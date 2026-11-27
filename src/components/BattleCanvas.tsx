import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ArmyUnit,
  BattleLogEntry,
  Boat,
  FloatingText,
  Particle,
  Projectile,
  Team,
} from '../types/game';
import {
  createArmyUnit,
  createNationBoat,
  MAP_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_WIDTH,
} from '../data/presets';
import { soundEngine } from '../utils/audio';
import {
  buildWaterMask,
  findNearestLand,
  findNearestWater,
  isWaterAt,
} from '../utils/waterMask';

export interface BattleCanvasHandle {
  selectTeamUnits: (teamId: string) => void;
  selectOrLaunchBoat: (teamId: string) => void;
  clearSelection: () => void;
  spawnPopulation: (teamId: string, count: number) => void;
  clashTeams: (teamIdA: string, teamIdB: string) => void;
  loadClosestToBoat: (boatId: string) => void;
  unloadBoat: (boatId: string) => void;
  fitToScreen: () => void;
  getSnapshot: () => {
    teams: Team[];
    units: ArmyUnit[];
    boats: Boat[];
  };
  resetWorld: (world: {
    teams: Team[];
    units: ArmyUnit[];
    boats: Boat[];
  }) => void;
  addTeamWithArmy: (
    team: Team,
    unitCount?: number
  ) => { homeX: number; homeY: number; dockX: number; dockY: number };
  convertMembers: (fromTeamId: string, toTeamId: string, count?: number) => void;
}

export interface TopBoatAction {
  boatId: string;
  teamColor: string;
  teamName: string;
  canLoad: boolean;
  canUnload: boolean;
  passengers: number;
}

interface BattleCanvasProps {
  teams: Team[];
  initialUnits: ArmyUnit[];
  initialBoats: Boat[];
  alliances: Record<string, string[]>;
  onStatsSync: (
    unitCounts: Record<string, number>,
    boatStatus: Record<string, { alive: boolean; passengers: number }>,
    selectedUnitCount: number,
    selectedBoatCount: number,
    topBoatAction: TopBoatAction | null
  ) => void;
  onBattleLog: (entry: BattleLogEntry) => void;
}

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

interface MarqueeBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface OrderPulse {
  x: number;
  y: number;
  alpha: number;
  radius: number;
  color: string;
}

export const BattleCanvas = forwardRef<BattleCanvasHandle, BattleCanvasProps>(
  (
    {
      teams,
      initialUnits,
      initialBoats,
      alliances,
      onStatsSync,
      onBattleLog,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const mapImageRef = useRef<HTMLImageElement | null>(null);
    const waterMaskRef = useRef<Uint8Array | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [isPanningCursor, setIsPanningCursor] = useState(false);

    const unitsRef = useRef<ArmyUnit[]>(initialUnits.map((u) => ({ ...u })));
    const boatsRef = useRef<Boat[]>(initialBoats.map((b) => ({ ...b })));
    const teamsRef = useRef<Team[]>(teams.map((t) => ({ ...t })));
    const projectilesRef = useRef<Projectile[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const floatingTextsRef = useRef<FloatingText[]>([]);
    const orderPulsesRef = useRef<OrderPulse[]>([]);

    const cameraRef = useRef<CameraState>({ x: 0, y: 0, scale: 0.7 });
    const marqueeRef = useRef<MarqueeBox | null>(null);
    const hoverTargetRef = useRef<{ type: 'UNIT' | 'BOAT'; id: string } | null>(
      null
    );
    const spacePressedRef = useRef(false);

    const propsRef = useRef({
      alliances,
    });
    propsRef.current = {
      alliances,
    };

    const callbacksRef = useRef({
      onStatsSync,
      onBattleLog,
    });
    callbacksRef.current = {
      onStatsSync,
      onBattleLog,
    };

    const pointerStateRef = useRef<{
      mode: 'IDLE' | 'PAN' | 'RIGHT_PAN' | 'MARQUEE' | 'DRAG_ENTITIES';
      startScreenX: number;
      startScreenY: number;
      lastWorldX: number;
      lastWorldY: number;
      dragMoved: boolean;
      clickedEntity: { type: 'UNIT' | 'BOAT'; id: string } | null;
      shiftKey: boolean;
    }>({
      mode: 'IDLE',
      startScreenX: 0,
      startScreenY: 0,
      lastWorldX: 0,
      lastWorldY: 0,
      dragMoved: false,
      clickedEntity: null,
      shiftKey: false,
    });

    useEffect(() => {
      const existingMap = new Map(teamsRef.current.map((t) => [t.id, t]));
      teamsRef.current = teams.map((t) => {
        const existing = existingMap.get(t.id);
        return existing ? { ...t, kills: existing.kills, losses: existing.losses } : t;
      });
    }, [teams]);

    const areAllied = (teamA: string, teamB: string): boolean => {
      if (teamA === teamB) return true;
      const alliesA = propsRef.current.alliances[teamA];
      return Boolean(alliesA && alliesA.includes(teamB));
    };

    const syncStatsNow = useCallback(() => {
      const counts: Record<string, number> = {};
      const boatStatus: Record<string, { alive: boolean; passengers: number }> = {};
      let selectedUnits = 0;
      let selectedBoats = 0;

      for (const t of teamsRef.current) {
        counts[t.id] = 0;
        boatStatus[t.id] = { alive: false, passengers: 0 };
      }

      for (const u of unitsRef.current) {
        counts[u.teamId] = (counts[u.teamId] ?? 0) + 1;
        if (u.selected) selectedUnits += 1;
      }

      for (const b of boatsRef.current) {
        counts[b.teamId] = (counts[b.teamId] ?? 0) + b.passengers.length;
        boatStatus[b.teamId] = {
          alive: true,
          passengers: (boatStatus[b.teamId]?.passengers ?? 0) + b.passengers.length,
        };
        if (b.selected) selectedBoats += 1;
      }

      // Determine top-of-map Load/Unload action based on selected boat OR selected person
      let topAction: TopBoatAction | null = null;
      const selectedBoat = boatsRef.current.find((b) => b.selected);
      if (selectedBoat) {
        const hasCloserPerson = unitsRef.current.some(
          (u) =>
            areAllied(u.teamId, selectedBoat.teamId) &&
            Math.hypot(u.x - selectedBoat.x, u.y - selectedBoat.y) <=
              selectedBoat.radius + 42
        );
        const canLoad =
          hasCloserPerson && selectedBoat.passengers.length < selectedBoat.capacity;
        const canUnload = selectedBoat.passengers.length > 0;
        if (canLoad || canUnload) {
          const team = teamsRef.current.find((t) => t.id === selectedBoat.teamId);
          topAction = {
            boatId: selectedBoat.id,
            teamColor: team?.color ?? '#0F172A',
            teamName: team?.name ?? 'Boat',
            canLoad,
            canUnload,
            passengers: selectedBoat.passengers.length,
          };
        }
      } else {
        // Check if any selected person is close to a friendly/allied boat
        for (const u of unitsRef.current) {
          if (!u.selected) continue;
          const nearBoat = boatsRef.current.find(
            (b) =>
              areAllied(u.teamId, b.teamId) &&
              Math.hypot(u.x - b.x, u.y - b.y) <= b.radius + 42
          );
          if (nearBoat) {
            const canLoad = nearBoat.passengers.length < nearBoat.capacity;
            const canUnload = nearBoat.passengers.length > 0;
            if (canLoad || canUnload) {
              const team = teamsRef.current.find((t) => t.id === u.teamId);
              topAction = {
                boatId: nearBoat.id,
                teamColor: team?.color ?? '#0F172A',
                teamName: team?.name ?? 'Unit',
                canLoad,
                canUnload,
                passengers: nearBoat.passengers.length,
              };
              break;
            }
          }
        }
      }

      callbacksRef.current.onStatsSync(
        counts,
        boatStatus,
        selectedUnits,
        selectedBoats,
        topAction
      );
    }, []);

    // Load map image and compute flood-fill water mask
    useEffect(() => {
      const img = new Image();
      img.src = MAP_IMAGE_SRC;
      img.onload = () => {
        mapImageRef.current = img;
        const mask = buildWaterMask(img);
        waterMaskRef.current = mask;

        // Ensure all starting units sit on land and all boats sit in water
        for (const u of unitsRef.current) {
          if (isWaterAt(mask, u.x, u.y)) {
            const land = findNearestLand(mask, u.x, u.y);
            if (land) {
              u.x = land.x;
              u.y = land.y;
            }
          }
        }
        for (const b of boatsRef.current) {
          if (!isWaterAt(mask, b.x, b.y)) {
            const water = findNearestWater(mask, b.x, b.y);
            if (water) {
              b.x = water.x;
              b.y = water.y;
            }
          }
        }

        setMapLoaded(true);
        syncStatsNow();
      };
    }, [syncStatsNow]);

    const fitToScreen = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const padding = 16;
      const scaleX = (rect.width - padding * 2) / MAP_WIDTH;
      const scaleY = (rect.height - padding * 2) / MAP_HEIGHT;
      const scale = Math.max(0.25, Math.min(scaleX, scaleY));
      const x = (rect.width - MAP_WIDTH * scale) / 2;
      const y = (rect.height - MAP_HEIGHT * scale) / 2;
      cameraRef.current = { x, y, scale };
    }, []);

    useEffect(() => {
      fitToScreen();
      const observer = new ResizeObserver(() => fitToScreen());
      if (containerRef.current) observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [fitToScreen]);

    const disembarkBoat = useCallback(
      (boat: Boat, preferredLand?: { x: number; y: number }) => {
        if (boat.passengers.length === 0) return;
        const mask = waterMaskRef.current;
        const anchor = preferredLand
          ? findNearestLand(mask, preferredLand.x, preferredLand.y, 120)
          : findNearestLand(mask, boat.x, boat.y, 90);

        if (!anchor) return;

        boat.passengers.forEach((p, idx) => {
          const angle = idx * 2.39996;
          const dist = 10 * Math.sqrt(idx);
          const candidateX = anchor.x + Math.cos(angle) * dist;
          const candidateY = anchor.y + Math.sin(angle) * dist;
          const landPos = isWaterAt(mask, candidateX, candidateY)
            ? anchor
            : { x: candidateX, y: candidateY };

          p.x = landPos.x;
          p.y = landPos.y;
          p.targetX = preferredLand ? preferredLand.x + Math.cos(angle) * dist : null;
          p.targetY = preferredLand ? preferredLand.y + Math.sin(angle) * dist : null;
          p.targetBoatId = null;
          p.selected = false;
          unitsRef.current.push(p);
        });

        boat.passengers = [];
        boat.disembarkPoint = null;
        soundEngine.playOrder();
        syncStatsNow();
      },
      [syncStatsNow]
    );

    const issueMoveOrder = useCallback(
      (worldX: number, worldY: number) => {
        const clampedX = Math.max(12, Math.min(MAP_WIDTH - 12, worldX));
        const clampedY = Math.max(12, Math.min(MAP_HEIGHT - 12, worldY));
        const mask = waterMaskRef.current;

        const selectedUnits = unitsRef.current.filter((u) => u.selected);
        const selectedBoats = boatsRef.current.filter((b) => b.selected);

        if (selectedUnits.length === 0 && selectedBoats.length === 0) return;

        // Check if user clicked right on a boat -> selected friendly/allied units board it!
        const clickedBoat = boatsRef.current.find((b) => {
          const dx = clampedX - b.x;
          const dy = clampedY - b.y;
          return dx * dx + dy * dy <= (b.radius + 14) * (b.radius + 14);
        });

        if (selectedUnits.length > 0) {
          if (clickedBoat) {
            selectedUnits.forEach((u) => {
              if (areAllied(u.teamId, clickedBoat.teamId)) {
                u.targetBoatId = clickedBoat.id;
                u.targetX = clickedBoat.x;
                u.targetY = clickedBoat.y;
              }
            });
            orderPulsesRef.current.push({
              x: clickedBoat.x,
              y: clickedBoat.y,
              alpha: 0.9,
              radius: 8,
              color: '#0F172A',
            });
            soundEngine.playOrder();
            return;
          }

          const spacing = 15;
          selectedUnits.forEach((unit, idx) => {
            unit.targetBoatId = null;
            if (selectedUnits.length === 1) {
              unit.targetX = clampedX;
              unit.targetY = clampedY;
            } else {
              const angle = idx * 2.3999632;
              const dist = spacing * Math.sqrt(idx) * 0.72;
              unit.targetX = Math.max(
                14,
                Math.min(MAP_WIDTH - 14, clampedX + Math.cos(angle) * dist)
              );
              unit.targetY = Math.max(
                14,
                Math.min(MAP_HEIGHT - 14, clampedY + Math.sin(angle) * dist)
              );
            }
          });

          orderPulsesRef.current.push({
            x: clampedX,
            y: clampedY,
            alpha: 0.9,
            radius: 7,
            color: '#0F172A',
          });
          soundEngine.playOrder();
        }

        if (selectedBoats.length > 0) {
          const clickedIsWater = isWaterAt(mask, clampedX, clampedY);
          selectedBoats.forEach((boat) => {
            if (clickedIsWater) {
              boat.targetX = clampedX;
              boat.targetY = clampedY;
              boat.disembarkPoint = null;
            } else {
              // Clicked land! Sail to nearest water shoreline & disembark passengers if any
              const coastalWater = findNearestWater(mask, clampedX, clampedY, 180);
              if (coastalWater) {
                boat.targetX = coastalWater.x;
                boat.targetY = coastalWater.y;
                boat.disembarkPoint = { x: clampedX, y: clampedY };
              }
            }
          });

          orderPulsesRef.current.push({
            x: clampedX,
            y: clampedY,
            alpha: 0.9,
            radius: 9,
            color: clickedIsWater ? '#0284C7' : '#0F172A',
          });
          soundEngine.playOrder();
        }
      },
      []
    );

    useImperativeHandle(
      ref,
      () => ({
        selectTeamUnits: (teamId: string) => {
          for (const u of unitsRef.current) {
            u.selected = u.teamId === teamId;
          }
          for (const b of boatsRef.current) {
            b.selected = false;
          }
          syncStatsNow();
        },
        selectOrLaunchBoat: (teamId: string) => {
          const existing = boatsRef.current.find((b) => b.teamId === teamId);
          for (const u of unitsRef.current) u.selected = false;

          if (existing) {
            for (const b of boatsRef.current) {
              b.selected = b.id === existing.id;
            }
          } else {
            const team = teamsRef.current.find((t) => t.id === teamId);
            if (!team) return;

            const teamUnits = unitsRef.current.filter((u) => u.teamId === teamId);
            if (teamUnits.length < 10) {
              callbacksRef.current.onBattleLog({
                id: `boat-cost-${Date.now()}`,
                text: `${team.name} needs 10 people to build a boat`,
                color: team.color,
                timestamp: Date.now(),
              });
              return;
            }

            // Spend 10 people from land units to build the boat
            const toRemove = new Set(teamUnits.slice(0, 10).map((u) => u.id));
            unitsRef.current = unitsRef.current.filter((u) => !toRemove.has(u.id));

            const mask = waterMaskRef.current;
            const waterSpot = findNearestWater(mask, team.dockX, team.dockY, 160);
            const newBoat = createNationBoat(
              team,
              waterSpot?.x ?? team.dockX,
              waterSpot?.y ?? team.dockY
            );
            newBoat.selected = true;
            for (const b of boatsRef.current) b.selected = false;
            boatsRef.current.push(newBoat);
            soundEngine.playOrder();
            callbacksRef.current.onBattleLog({
              id: `boat-${Date.now()}`,
              text: `${team.name} built a boat (-10 people)`,
              color: team.color,
              timestamp: Date.now(),
            });
          }
          syncStatsNow();
        },
        clearSelection: () => {
          for (const u of unitsRef.current) u.selected = false;
          for (const b of boatsRef.current) b.selected = false;
          syncStatsNow();
        },
        spawnPopulation: (teamId: string, count: number) => {
          const team = teamsRef.current.find((t) => t.id === teamId);
          if (!team) return;
          const mask = waterMaskRef.current;

          const teamUnits = unitsRef.current.filter((u) => u.teamId === teamId);
          const kingOnLand = teamUnits.find((u) => u.isKing);
          const boatWithKing = boatsRef.current.find((b) =>
            b.passengers.some((p) => p.teamId === teamId && p.isKing)
          );

          let cx = team.homeX;
          let cy = team.homeY;
          if (kingOnLand) {
            cx = kingOnLand.x;
            cy = kingOnLand.y;
          } else if (boatWithKing) {
            const nearLand = findNearestLand(
              mask,
              boatWithKing.x,
              boatWithKing.y,
              120
            );
            if (nearLand) {
              cx = nearLand.x;
              cy = nearLand.y;
            }
          } else if (teamUnits.length > 0) {
            cx = teamUnits.reduce((s, u) => s + u.x, 0) / teamUnits.length;
            cy = teamUnits.reduce((s, u) => s + u.y, 0) / teamUnits.length;
          }

          for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
            const dist = 10 + Math.random() * 14;
            const rawX = cx + Math.cos(ang) * dist;
            const rawY = cy + Math.sin(ang) * dist;
            const land = findNearestLand(mask, rawX, rawY, 80) ?? { x: cx, y: cy };
            unitsRef.current.push(createArmyUnit(teamId, land.x, land.y));
          }

          orderPulsesRef.current.push({
            x: cx,
            y: cy,
            alpha: 0.9,
            radius: 8,
            color: team.color,
          });

          soundEngine.playOrder();
          callbacksRef.current.onBattleLog({
            id: `pop-${Date.now()}-${teamId}`,
            text: `${team.name} gained +${count} near King`,
            color: team.color,
            timestamp: Date.now(),
          });
          syncStatsNow();
        },
        clashTeams: (teamIdA: string, teamIdB: string) => {
          if (areAllied(teamIdA, teamIdB)) {
            const tA = teamsRef.current.find((t) => t.id === teamIdA);
            const tB = teamsRef.current.find((t) => t.id === teamIdB);
            if (tA && tB) {
              callbacksRef.current.onBattleLog({
                id: `ally-block-${Date.now()}`,
                text: `${tA.name} & ${tB.name} are allies`,
                color: tA.color,
                timestamp: Date.now(),
              });
            }
            return;
          }

          const unitsA = unitsRef.current.filter((u) => u.teamId === teamIdA);
          const unitsB = unitsRef.current.filter((u) => u.teamId === teamIdB);
          if (unitsA.length === 0 || unitsB.length === 0) return;

          const cxA = unitsA.reduce((s, u) => s + u.x, 0) / unitsA.length;
          const cyA = unitsA.reduce((s, u) => s + u.y, 0) / unitsA.length;
          const cxB = unitsB.reduce((s, u) => s + u.x, 0) / unitsB.length;
          const cyB = unitsB.reduce((s, u) => s + u.y, 0) / unitsB.length;

          const midX = (cxA + cxB) / 2;
          const midY = (cyA + cyB) / 2;

          unitsA.forEach((u, idx) => {
            const ang = idx * 2.39996;
            const d = 11 * Math.sqrt(idx);
            u.targetX = midX - 10 + Math.cos(ang) * d;
            u.targetY = midY + Math.sin(ang) * d;
          });
          unitsB.forEach((u, idx) => {
            const ang = idx * 2.39996;
            const d = 11 * Math.sqrt(idx);
            u.targetX = midX + 10 + Math.cos(ang) * d;
            u.targetY = midY + Math.sin(ang) * d;
          });

          soundEngine.playOrder();
          syncStatsNow();
        },
        loadClosestToBoat: (boatId: string) => {
          const boat = boatsRef.current.find((b) => b.id === boatId);
          if (!boat || boat.passengers.length >= boat.capacity) return;

          // Prefer selected closest unit if any selected unit is nearby, else closest nearby friendly/allied unit
          let closestUnit: ArmyUnit | null = null;
          let closestDist = Infinity;
          const hasSelectedNearby = unitsRef.current.some(
            (u) =>
              u.selected &&
              areAllied(u.teamId, boat.teamId) &&
              Math.hypot(u.x - boat.x, u.y - boat.y) <= boat.radius + 42
          );

          for (const u of unitsRef.current) {
            if (hasSelectedNearby && !u.selected) continue;
            if (!areAllied(u.teamId, boat.teamId)) continue;
            const d = Math.hypot(u.x - boat.x, u.y - boat.y);
            if (d <= boat.radius + 42 && d < closestDist) {
              closestDist = d;
              closestUnit = u;
            }
          }

          if (!closestUnit) return;

          closestUnit.selected = false;
          closestUnit.targetX = null;
          closestUnit.targetY = null;
          closestUnit.targetBoatId = null;
          boat.passengers.push(closestUnit);
          unitsRef.current = unitsRef.current.filter((u) => u.id !== closestUnit!.id);
          soundEngine.playOrder();
          syncStatsNow();
        },
        unloadBoat: (boatId: string) => {
          const boat = boatsRef.current.find((b) => b.id === boatId);
          if (!boat || boat.passengers.length === 0) return;
          disembarkBoat(boat);
        },
        fitToScreen,
        getSnapshot: () => ({
          teams: teamsRef.current.map((t) => ({ ...t })),
          units: unitsRef.current.map((u) => ({ ...u, selected: false })),
          boats: boatsRef.current.map((b) => ({
            ...b,
            selected: false,
            passengers: b.passengers.map((p) => ({ ...p, selected: false })),
          })),
        }),
        resetWorld: (world) => {
          teamsRef.current = world.teams.map((t) => ({ ...t }));
          unitsRef.current = world.units.map((u) => ({ ...u }));
          boatsRef.current = world.boats.map((b) => ({
            ...b,
            passengers: b.passengers.map((p) => ({ ...p })),
          }));
          projectilesRef.current = [];
          particlesRef.current = [];
          floatingTextsRef.current = [];
          orderPulsesRef.current = [];

          const mask = waterMaskRef.current;
          if (mask) {
            for (const u of unitsRef.current) {
              if (isWaterAt(mask, u.x, u.y)) {
                const land = findNearestLand(mask, u.x, u.y);
                if (land) {
                  u.x = land.x;
                  u.y = land.y;
                }
              }
            }
            for (const b of boatsRef.current) {
              if (!isWaterAt(mask, b.x, b.y)) {
                const water = findNearestWater(mask, b.x, b.y);
                if (water) {
                  b.x = water.x;
                  b.y = water.y;
                }
              }
            }
          }

          fitToScreen();
          syncStatsNow();
        },
        addTeamWithArmy: (team: Team, unitCount = 8) => {
          const mask = waterMaskRef.current;
          const candidates: Array<[number, number]> = [
            [270, 235],
            [318, 426],
            [460, 755],
            [515, 145],
            [755, 195],
            [990, 325],
            [1145, 475],
            [1210, 215],
            [660, 485],
            [778, 675],
            [1315, 345],
            [865, 650],
          ];

          let bestSpot = { x: team.homeX, y: team.homeY };
          let bestMinDist = -1;

          for (const [cx, cy] of candidates) {
            const land = mask ? findNearestLand(mask, cx, cy, 45) : { x: cx, y: cy };
            if (!land) continue;
            let minDist = Infinity;
            for (const u of unitsRef.current) {
              const d = Math.hypot(u.x - land.x, u.y - land.y);
              if (d < minDist) minDist = d;
            }
            if (unitsRef.current.length === 0) minDist = 9999;
            if (minDist > bestMinDist) {
              bestMinDist = minDist;
              bestSpot = land;
            }
          }

          const waterSpot = mask
            ? findNearestWater(mask, bestSpot.x, bestSpot.y, 260)
            : { x: team.dockX, y: team.dockY };
          const dockX = waterSpot?.x ?? team.dockX;
          const dockY = waterSpot?.y ?? team.dockY;

          const placedTeam: Team = {
            ...team,
            homeX: bestSpot.x,
            homeY: bestSpot.y,
            dockX,
            dockY,
          };

          if (!teamsRef.current.some((t) => t.id === placedTeam.id)) {
            teamsRef.current.push(placedTeam);
          }

          // Spawn 1 King + (unitCount - 1) common circles on land
          for (let i = 0; i < unitCount; i++) {
            const ang = i === 0 ? 0 : (Math.PI * 2 * i) / Math.max(1, unitCount - 1);
            const dist = i === 0 ? 0 : 14 + (i % 2) * 8;
            const rawX = bestSpot.x + Math.cos(ang) * dist;
            const rawY = bestSpot.y + Math.sin(ang) * dist;
            const land =
              (mask ? findNearestLand(mask, rawX, rawY, 60) : null) ?? bestSpot;

            unitsRef.current.push(
              createArmyUnit(
                placedTeam.id,
                land.x,
                land.y,
                i === 0
                  ? {
                      isKing: true,
                      hp: 260,
                      maxHp: 260,
                      attack: 22,
                      healCooldown: 0,
                      selfHealTimer: 0,
                    }
                  : undefined
              )
            );
          }

          // Give the new nation its first boat free
          boatsRef.current.push(createNationBoat(placedTeam, dockX, dockY));

          orderPulsesRef.current.push({
            x: bestSpot.x,
            y: bestSpot.y,
            alpha: 1,
            radius: 10,
            color: placedTeam.color,
          });

          soundEngine.playOrder();
          callbacksRef.current.onBattleLog({
            id: `new-team-${Date.now()}-${placedTeam.id}`,
            text: `${placedTeam.name} joined the world`,
            color: placedTeam.color,
            timestamp: Date.now(),
          });
          syncStatsNow();

          return {
            homeX: bestSpot.x,
            homeY: bestSpot.y,
            dockX,
            dockY,
          };
        },
        convertMembers: (fromTeamId: string, toTeamId: string, count = 5) => {
          if (fromTeamId === toTeamId) return;
          const fromTeam = teamsRef.current.find((t) => t.id === fromTeamId);
          const toTeam = teamsRef.current.find((t) => t.id === toTeamId);
          if (!fromTeam || !toTeam) return;

          const toUnits = unitsRef.current.filter((u) => u.teamId === toTeamId);
          const toKing = toUnits.find((u) => u.isKing);
          const toBoatWithKing = boatsRef.current.find((b) =>
            b.passengers.some((p) => p.teamId === toTeamId && p.isKing)
          );

          let refX = toTeam.homeX;
          let refY = toTeam.homeY;
          if (toKing) {
            refX = toKing.x;
            refY = toKing.y;
          } else if (toBoatWithKing) {
            refX = toBoatWithKing.x;
            refY = toBoatWithKing.y;
          } else if (toUnits.length > 0) {
            refX = toUnits.reduce((s, u) => s + u.x, 0) / toUnits.length;
            refY = toUnits.reduce((s, u) => s + u.y, 0) / toUnits.length;
          }

          // Nearest members of 2nd-spin team (non-Kings prioritized, then King last if < count)
          const candidates = unitsRef.current
            .filter((u) => u.teamId === fromTeamId)
            .sort((a, b) => {
              if (Boolean(a.isKing) !== Boolean(b.isKing)) {
                return a.isKing ? 1 : -1;
              }
              return (
                Math.hypot(a.x - refX, a.y - refY) -
                Math.hypot(b.x - refX, b.y - refY)
              );
            });

          const chosen = candidates.slice(0, count);

          // If fewer than count on land, also pull & convert passengers from 2nd-spin team's boats
          if (chosen.length < count) {
            const mask = waterMaskRef.current;
            for (const b of boatsRef.current) {
              if (chosen.length >= count) break;
              const remainingBoatPassengers: ArmyUnit[] = [];
              for (const p of b.passengers) {
                if (p.teamId === fromTeamId && chosen.length < count) {
                  const land =
                    findNearestLand(mask, b.x, b.y, 120) ?? {
                      x: fromTeam.homeX,
                      y: fromTeam.homeY,
                    };
                  p.x = land.x;
                  p.y = land.y;
                  unitsRef.current.push(p);
                  chosen.push(p);
                } else {
                  remainingBoatPassengers.push(p);
                }
              }
              b.passengers = remainingBoatPassengers;
            }
          }

          for (const member of chosen) {
            member.teamId = toTeamId;
            member.isKing = false;
            member.maxHp = 100;
            member.hp = 100;
            member.attack = 15;
            member.selected = false;
            member.targetX = null;
            member.targetY = null;
            member.targetBoatId = null;
            member.attackTargetId = null;
            member.hitFlash = 1;

            orderPulsesRef.current.push({
              x: member.x,
              y: member.y,
              alpha: 0.95,
              radius: 5,
              color: toTeam.color,
            });
          }

          if (chosen.length > 0) {
            const avgX = chosen.reduce((s, u) => s + u.x, 0) / chosen.length;
            const avgY = chosen.reduce((s, u) => s + u.y, 0) / chosen.length;
            floatingTextsRef.current.push({
              id: `ft-conv-${Date.now()}`,
              x: avgX,
              y: avgY - 12,
              text: `+${chosen.length} Converted`,
              color: toTeam.color,
              alpha: 1,
              vy: -18,
            });

            soundEngine.playOrder();
            callbacksRef.current.onBattleLog({
              id: `conv-${Date.now()}-${toTeamId}`,
              text: `${toTeam.name} converted ${chosen.length} from ${fromTeam.name}`,
              color: toTeam.color,
              timestamp: Date.now(),
            });
          }

          syncStatsNow();
        },
      }),
      [disembarkBoat, fitToScreen, syncStatsNow]
    );

    // Keyboard shortcuts (Esc clear, Ctrl+A select all, R fit map)
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.code === 'Space') {
          spacePressedRef.current = true;
        } else if (e.key === 'Escape') {
          for (const u of unitsRef.current) u.selected = false;
          for (const b of boatsRef.current) b.selected = false;
          syncStatsNow();
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          for (const u of unitsRef.current) u.selected = true;
          syncStatsNow();
        } else if (e.key.toLowerCase() === 'r') {
          fitToScreen();
        }
      };

      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') spacePressedRef.current = false;
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }, [fitToScreen, syncStatsNow]);

    const screenToWorld = (sx: number, sy: number) => {
      const cam = cameraRef.current;
      return {
        x: (sx - cam.x) / cam.scale,
        y: (sy - cam.y) / cam.scale,
      };
    };

    const findEntityAt = (
      wx: number,
      wy: number
    ): { type: 'UNIT' | 'BOAT'; id: string } | null => {
      for (let i = boatsRef.current.length - 1; i >= 0; i--) {
        const b = boatsRef.current[i];
        const dx = wx - b.x;
        const dy = wy - b.y;
        const r = b.radius + 5;
        if (dx * dx + dy * dy <= r * r) {
          return { type: 'BOAT', id: b.id };
        }
      }
      for (let i = unitsRef.current.length - 1; i >= 0; i--) {
        const u = unitsRef.current[i];
        const dx = wx - u.x;
        const dy = wy - u.y;
        const r = u.radius + 5;
        if (dx * dx + dy * dy <= r * r) {
          return { type: 'UNIT', id: u.id };
        }
      }
      return null;
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);

      // Middle click or Space+click -> Pan map
      if (e.button === 1 || spacePressedRef.current) {
        setIsPanningCursor(true);
        pointerStateRef.current = {
          ...pointerStateRef.current,
          mode: 'PAN',
          startScreenX: sx,
          startScreenY: sy,
          dragMoved: false,
        };
        return;
      }

      // Right-click -> Hold & move to drag map; quick right-click moves selected units/boats
      if (e.button === 2) {
        pointerStateRef.current = {
          ...pointerStateRef.current,
          mode: 'RIGHT_PAN',
          startScreenX: sx,
          startScreenY: sy,
          dragMoved: false,
        };
        return;
      }

      if (e.button !== 0) return;

      const hit = findEntityAt(world.x, world.y);
      if (hit) {
        // Special case: if units are already selected and user clicks a friendly/allied boat -> march near that boat
        const hasSelectedUnits = unitsRef.current.some((u) => u.selected);
        if (hit.type === 'BOAT' && hasSelectedUnits && !e.shiftKey) {
          const boat = boatsRef.current.find((b) => b.id === hit.id);
          const firstSel = unitsRef.current.find((u) => u.selected);
          if (boat && firstSel && areAllied(firstSel.teamId, boat.teamId)) {
            issueMoveOrder(boat.x, boat.y);
            return;
          }
        }

        if (hit.type === 'UNIT') {
          const unit = unitsRef.current.find((u) => u.id === hit.id);
          if (unit) {
            if (e.shiftKey) {
              unit.selected = !unit.selected;
            } else if (!unit.selected) {
              for (const u of unitsRef.current) u.selected = false;
              for (const b of boatsRef.current) b.selected = false;
              unit.selected = true;
            }
            syncStatsNow();
          }
        } else {
          const boat = boatsRef.current.find((b) => b.id === hit.id);
          if (boat) {
            if (e.shiftKey) {
              boat.selected = !boat.selected;
            } else if (!boat.selected) {
              for (const u of unitsRef.current) u.selected = false;
              for (const b of boatsRef.current) b.selected = false;
              boat.selected = true;
            }
            syncStatsNow();
          }
        }

        pointerStateRef.current = {
          mode: 'DRAG_ENTITIES',
          startScreenX: sx,
          startScreenY: sy,
          lastWorldX: world.x,
          lastWorldY: world.y,
          dragMoved: false,
          clickedEntity: hit,
          shiftKey: e.shiftKey,
        };
      } else {
        // Left-drag on empty map -> marquee selection box; quick click -> move selected units/boats
        pointerStateRef.current = {
          mode: 'MARQUEE',
          startScreenX: sx,
          startScreenY: sy,
          lastWorldX: world.x,
          lastWorldY: world.y,
          dragMoved: false,
          clickedEntity: null,
          shiftKey: e.shiftKey,
        };
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      const ps = pointerStateRef.current;

      if (ps.mode === 'IDLE') {
        hoverTargetRef.current = findEntityAt(world.x, world.y);
        return;
      }

      if (ps.mode === 'PAN' || ps.mode === 'RIGHT_PAN') {
        const dx = sx - ps.startScreenX;
        const dy = sy - ps.startScreenY;
        if (ps.mode === 'RIGHT_PAN' && !ps.dragMoved) {
          if (dx * dx + dy * dy > 16) {
            ps.dragMoved = true;
            setIsPanningCursor(true);
          }
        }
        if (ps.mode === 'PAN' || ps.dragMoved) {
          cameraRef.current.x += dx;
          cameraRef.current.y += dy;
          ps.startScreenX = sx;
          ps.startScreenY = sy;
        }
        return;
      }

      const moveDistSq =
        (sx - ps.startScreenX) * (sx - ps.startScreenX) +
        (sy - ps.startScreenY) * (sy - ps.startScreenY);
      if (moveDistSq > 20) ps.dragMoved = true;

      if (ps.mode === 'DRAG_ENTITIES' && ps.dragMoved) {
        const dx = world.x - ps.lastWorldX;
        const dy = world.y - ps.lastWorldY;
        const mask = waterMaskRef.current;

        // Drag selected units (strictly blocked by water; never auto-boards boats)
        for (const u of unitsRef.current) {
          if (u.selected) {
            const nx = Math.max(12, Math.min(MAP_WIDTH - 12, u.x + dx));
            const ny = Math.max(12, Math.min(MAP_HEIGHT - 12, u.y + dy));

            if (!isWaterAt(mask, nx, ny)) {
              u.x = nx;
              u.y = ny;
            } else if (!isWaterAt(mask, nx, u.y)) {
              u.x = nx;
            } else if (!isWaterAt(mask, u.x, ny)) {
              u.y = ny;
            }
            u.targetX = null;
            u.targetY = null;
            u.targetBoatId = null;
          }
        }

        // Drag selected boats (stay in water!)
        for (const b of boatsRef.current) {
          if (b.selected) {
            const nx = Math.max(16, Math.min(MAP_WIDTH - 16, b.x + dx));
            const ny = Math.max(16, Math.min(MAP_HEIGHT - 16, b.y + dy));
            if (isWaterAt(mask, nx, ny)) {
              if (Math.hypot(dx, dy) > 0.5) {
                b.facingAngle = Math.atan2(dy, dx);
              }
              b.x = nx;
              b.y = ny;
            } else if (isWaterAt(mask, nx, b.y)) {
              b.x = nx;
            } else if (isWaterAt(mask, b.x, ny)) {
              b.y = ny;
            }
            b.targetX = null;
            b.targetY = null;
            b.disembarkPoint = null;
          }
        }

        ps.lastWorldX = world.x;
        ps.lastWorldY = world.y;
      } else if (ps.mode === 'MARQUEE' && ps.dragMoved) {
        const startW = screenToWorld(ps.startScreenX, ps.startScreenY);
        marqueeRef.current = {
          startX: startW.x,
          startY: startW.y,
          endX: world.x,
          endY: world.y,
        };
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      const rect = canvas?.getBoundingClientRect();
      const sx = rect ? e.clientX - rect.left : 0;
      const sy = rect ? e.clientY - rect.top : 0;
      const world = screenToWorld(sx, sy);
      const ps = pointerStateRef.current;

      if (ps.mode === 'RIGHT_PAN') {
        setIsPanningCursor(false);
        if (!ps.dragMoved) {
          const anySelected =
            unitsRef.current.some((u) => u.selected) ||
            boatsRef.current.some((b) => b.selected);
          if (anySelected) {
            issueMoveOrder(world.x, world.y);
          }
        }
      } else if (ps.mode === 'PAN') {
        setIsPanningCursor(false);
      } else if (
        ps.mode === 'DRAG_ENTITIES' &&
        !ps.dragMoved &&
        ps.clickedEntity &&
        !ps.shiftKey
      ) {
        if (ps.clickedEntity.type === 'UNIT') {
          for (const u of unitsRef.current) {
            u.selected = u.id === ps.clickedEntity.id;
          }
          for (const b of boatsRef.current) b.selected = false;
        } else {
          for (const u of unitsRef.current) u.selected = false;
          for (const b of boatsRef.current) {
            b.selected = b.id === ps.clickedEntity.id;
          }
        }
        syncStatsNow();
      } else if (ps.mode === 'MARQUEE') {
        if (ps.dragMoved && marqueeRef.current) {
          const box = marqueeRef.current;
          const minX = Math.min(box.startX, box.endX);
          const maxX = Math.max(box.startX, box.endX);
          const minY = Math.min(box.startY, box.endY);
          const maxY = Math.max(box.startY, box.endY);

          for (const u of unitsRef.current) {
            const inside = u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY;
            if (ps.shiftKey) {
              if (inside) u.selected = true;
            } else {
              u.selected = inside;
            }
          }
          for (const b of boatsRef.current) {
            const inside = b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY;
            if (ps.shiftKey) {
              if (inside) b.selected = true;
            } else {
              b.selected = inside;
            }
          }
          marqueeRef.current = null;
          syncStatsNow();
        } else {
          const anySelected =
            unitsRef.current.some((u) => u.selected) ||
            boatsRef.current.some((b) => b.selected);
          if (anySelected) {
            issueMoveOrder(world.x, world.y);
          }
        }
      }

      pointerStateRef.current.mode = 'IDLE';
      marqueeRef.current = null;
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = findEntityAt(world.x, world.y);
      if (hit && hit.type === 'UNIT') {
        const clicked = unitsRef.current.find((u) => u.id === hit.id);
        if (clicked) {
          for (const u of unitsRef.current) {
            u.selected = u.teamId === clicked.teamId;
          }
          for (const b of boatsRef.current) b.selected = false;
          syncStatsNow();
        }
      }
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cam = cameraRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const newScale = Math.max(0.35, Math.min(4.0, cam.scale * factor));
      const ratio = newScale / cam.scale;
      cameraRef.current = {
        scale: newScale,
        x: sx - (sx - cam.x) * ratio,
        y: sy - (sy - cam.y) * ratio,
      };
    };

    // Main 60fps simulation & rendering loop
    useEffect(() => {
      let rafId = 0;
      let lastTime = performance.now();
      let lastStatsEmit = 0;

      const step = (now: number) => {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        const mask = waterMaskRef.current;
        const units = unitsRef.current;
        const boats = boatsRef.current;
        const teamMap = new Map(teamsRef.current.map((t) => [t.id, t]));
        let statsDirty = false;

        // 1. Move Boats across water + disembark on arrival at land target
        for (const b of boats) {
          if (b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - dt);
          if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt * 5);

          if (b.targetX !== null && b.targetY !== null) {
            const dx = b.targetX - b.x;
            const dy = b.targetY - b.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 8) {
              b.targetX = null;
              b.targetY = null;
              if (b.disembarkPoint && b.passengers.length > 0) {
                disembarkBoat(b, b.disembarkPoint);
              }
            } else {
              const stepDist = Math.min(dist, b.speed * dt);
              const nx = b.x + (dx / dist) * stepDist;
              const ny = b.y + (dy / dist) * stepDist;
              b.facingAngle = Math.atan2(dy, dx);

              if (isWaterAt(mask, nx, ny)) {
                b.x = nx;
                b.y = ny;
              } else if (isWaterAt(mask, nx, b.y)) {
                b.x = nx;
              } else if (isWaterAt(mask, b.x, ny)) {
                b.y = ny;
              } else {
                // Reached shoreline!
                b.targetX = null;
                b.targetY = null;
                if (b.disembarkPoint && b.passengers.length > 0) {
                  disembarkBoat(b, b.disembarkPoint);
                }
              }
            }
          }
        }

        // 2. Move Army Circles (blocked by water; never auto-boards boats)
        const unitsRemaining: ArmyUnit[] = [];
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (u.cooldown > 0) u.cooldown = Math.max(0, u.cooldown - dt);
          if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt * 5);

          if (u.targetBoatId) {
            const targetBoat = boats.find((b) => b.id === u.targetBoatId);
            if (targetBoat) {
              u.targetX = targetBoat.x;
              u.targetY = targetBoat.y;
              if (Math.hypot(targetBoat.x - u.x, targetBoat.y - u.y) <= targetBoat.radius + 18) {
                u.targetX = null;
                u.targetY = null;
                u.targetBoatId = null;
              }
            } else {
              u.targetBoatId = null;
            }
          }

          if (u.targetX !== null && u.targetY !== null) {
            const dx = u.targetX - u.x;
            const dy = u.targetY - u.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 4) {
              u.targetX = null;
              u.targetY = null;
            } else {
              const stepDist = Math.min(dist, u.speed * dt);
              const nx = u.x + (dx / dist) * stepDist;
              const ny = u.y + (dy / dist) * stepDist;

              if (!isWaterAt(mask, nx, ny)) {
                u.x = nx;
                u.y = ny;
              } else if (!isWaterAt(mask, nx, u.y)) {
                u.x = nx;
              } else if (!isWaterAt(mask, u.x, ny)) {
                u.y = ny;
              } else {
                // Blocked by water shoreline! Stop cleanly
                u.targetX = null;
                u.targetY = null;
                u.targetBoatId = null;
              }
            }
          }
          unitsRemaining.push(u);
        }
        unitsRef.current = unitsRemaining;

        // 3. Soft separation physics for land circles
        for (let i = 0; i < unitsRemaining.length; i++) {
          const a = unitsRemaining[i];
          for (let j = i + 1; j < unitsRemaining.length; j++) {
            const b = unitsRemaining[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const minDist = a.radius + b.radius + 1;
            const distSq = dx * dx + dy * dy;
            if (distSq > 0.001 && distSq < minDist * minDist) {
              const dist = Math.sqrt(distSq);
              const overlap = (minDist - dist) * 0.4;
              const nx = dx / dist;
              const ny = dy / dist;
              const ax = a.x - nx * overlap;
              const ay = a.y - ny * overlap;
              const bx = b.x + nx * overlap;
              const by = b.y + ny * overlap;
              if (!isWaterAt(mask, ax, ay)) {
                a.x = ax;
                a.y = ay;
              }
              if (!isWaterAt(mask, bx, by)) {
                b.x = bx;
                b.y = by;
              }
            }
          }
        }

        // 4. Touch-ONLY Combat & King Touch-Healing
        for (const u of unitsRemaining) {
          // King heals himself slowly & heals injured friendly/allied circles by touching them
          if (u.isKing) {
            if (u.hp < u.maxHp) {
              u.hp = Math.min(u.maxHp, u.hp + 5 * dt);
              u.selfHealTimer = (u.selfHealTimer ?? 0) + dt;
              if (u.selfHealTimer >= 1.6) {
                u.selfHealTimer = 0;
                floatingTextsRef.current.push({
                  id: `sheal-${now}-${Math.random()}`,
                  x: u.x,
                  y: u.y - u.radius - 6,
                  text: '+8',
                  color: '#16A34A',
                  alpha: 0.9,
                  vy: -14,
                });
              }
            } else {
              u.selfHealTimer = 0;
            }

            u.healCooldown = Math.max(0, (u.healCooldown ?? 0) - dt);
            if (u.healCooldown <= 0) {
              let healedAny = false;
              for (const ally of unitsRemaining) {
                if (ally.id === u.id) continue;
                if (!areAllied(u.teamId, ally.teamId)) continue;
                if (ally.hp >= ally.maxHp) continue;
                const d = Math.hypot(ally.x - u.x, ally.y - u.y);
                if (d <= u.radius + ally.radius + 4.5) {
                  const healAmt = Math.min(16, ally.maxHp - ally.hp);
                  ally.hp += healAmt;
                  healedAny = true;

                  floatingTextsRef.current.push({
                    id: `heal-${now}-${Math.random()}`,
                    x: ally.x,
                    y: ally.y - ally.radius - 3,
                    text: `+${Math.round(healAmt)}`,
                    color: '#16A34A',
                    alpha: 1,
                    vy: -18,
                  });
                  for (let s = 0; s < 3; s++) {
                    const ang = Math.random() * Math.PI * 2;
                    const spd = 16 + Math.random() * 24;
                    particlesRef.current.push({
                      id: `hpt-${now}-${Math.random()}`,
                      x: ally.x,
                      y: ally.y,
                      vx: Math.cos(ang) * spd,
                      vy: Math.sin(ang) * spd,
                      radius: 1.5,
                      color: '#22C55E',
                      alpha: 0.9,
                      decay: 2.4,
                    });
                  }
                }
              }
              if (healedAny) {
                u.healCooldown = 0.45;
              }
            }
          }

          // Balls cannot attack each other; only attack enemy boats when touching them
          let targetBoat: Boat | null = null;
          let minDist = Infinity;
          for (const b of boats) {
            if (areAllied(u.teamId, b.teamId)) continue;
            const d = Math.hypot(b.x - u.x, b.y - u.y);
            const touchBoatDist = u.radius + b.radius + 3.5;
            if (d <= touchBoatDist && d < minDist) {
              minDist = d;
              targetBoat = b;
            }
          }

          if (targetBoat && u.cooldown <= 0) {
            u.cooldown = 0.56 + Math.random() * 0.14;
            const teamColor = teamMap.get(u.teamId)?.color ?? '#0F172A';
            projectilesRef.current.push({
              id: `proj-${now}-${Math.random()}`,
              fromX: u.x,
              fromY: u.y,
              toX: targetBoat.x,
              toY: targetBoat.y,
              x: u.x,
              y: u.y,
              progress: 0,
              color: teamColor,
              damage: u.attack,
              targetUnitId: null,
              targetBoatId: targetBoat.id,
              attackerTeamId: u.teamId,
            });
            soundEngine.playShot();
          }
        }

        // Boats only attack enemy boats when touching (balls cannot be attacked by balls/boats)
        for (const b of boats) {
          if (b.cooldown > 0) continue;

          let targetBoat: Boat | null = null;
          let minDist = Infinity;

          for (const otherBoat of boats) {
            if (areAllied(b.teamId, otherBoat.teamId)) continue;
            const d = Math.hypot(otherBoat.x - b.x, otherBoat.y - b.y);
            const touchDist = b.radius + otherBoat.radius + 4;
            if (d <= touchDist && d < minDist) {
              minDist = d;
              targetBoat = otherBoat;
            }
          }

          if (targetBoat) {
            b.cooldown = 0.72;
            const teamColor = teamMap.get(b.teamId)?.color ?? '#0F172A';
            projectilesRef.current.push({
              id: `bproj-${now}-${Math.random()}`,
              fromX: b.x,
              fromY: b.y,
              toX: targetBoat.x,
              toY: targetBoat.y,
              x: b.x,
              y: b.y,
              progress: 0,
              color: teamColor,
              damage: b.attack,
              targetUnitId: null,
              targetBoatId: targetBoat.id,
              attackerTeamId: b.teamId,
            });
            soundEngine.playShot();
          }
        }

        // 5. Resolve Projectiles
        const activeProjectiles: Projectile[] = [];
        const deadUnitIds = new Set<string>();
        const deadBoatIds = new Set<string>();

        for (const p of projectilesRef.current) {
          p.progress += dt * 7.8;

          const tUnit = p.targetUnitId
            ? unitsRemaining.find((u) => u.id === p.targetUnitId)
            : undefined;
          const tBoat = p.targetBoatId
            ? boats.find((b) => b.id === p.targetBoatId)
            : undefined;

          if (tUnit) {
            p.toX = tUnit.x;
            p.toY = tUnit.y;
          } else if (tBoat) {
            p.toX = tBoat.x;
            p.toY = tBoat.y;
          }

          p.x = p.fromX + (p.toX - p.fromX) * Math.min(1, p.progress);
          p.y = p.fromY + (p.toY - p.fromY) * Math.min(1, p.progress);

          if (p.progress >= 1) {
            if (tUnit && !deadUnitIds.has(tUnit.id)) {
              tUnit.hp -= p.damage;
              tUnit.hitFlash = 1;

              for (let s = 0; s < 3; s++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 25 + Math.random() * 45;
                particlesRef.current.push({
                  id: `pt-${now}-${Math.random()}`,
                  x: tUnit.x,
                  y: tUnit.y,
                  vx: Math.cos(ang) * spd,
                  vy: Math.sin(ang) * spd,
                  radius: 1.6,
                  color: p.color,
                  alpha: 0.9,
                  decay: 2.8,
                });
              }

              if (tUnit.hp <= 0) {
                deadUnitIds.add(tUnit.id);
                statsDirty = true;
                soundEngine.playElimination();
                const victimColor = teamMap.get(tUnit.teamId)?.color ?? '#64748B';
                for (let k = 0; k < 8; k++) {
                  const ang = (Math.PI * 2 * k) / 8;
                  const spd = 35 + Math.random() * 55;
                  particlesRef.current.push({
                    id: `burst-${now}-${Math.random()}`,
                    x: tUnit.x,
                    y: tUnit.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    radius: 2,
                    color: victimColor,
                    alpha: 1,
                    decay: 2.2,
                  });
                }
              }
            } else if (tBoat && !deadBoatIds.has(tBoat.id)) {
              tBoat.hp -= p.damage;
              tBoat.hitFlash = 1;
              floatingTextsRef.current.push({
                id: `ft-${now}-${Math.random()}`,
                x: tBoat.x,
                y: tBoat.y - tBoat.radius - 4,
                text: `-${p.damage}`,
                color: '#0F172A',
                alpha: 1,
                vy: -20,
              });

              if (tBoat.hp <= 0) {
                deadBoatIds.add(tBoat.id);
                statsDirty = true;
                soundEngine.playElimination();
                const boatTeam = teamMap.get(tBoat.teamId);
                for (let k = 0; k < 16; k++) {
                  const ang = (Math.PI * 2 * k) / 16;
                  const spd = 45 + Math.random() * 75;
                  particlesRef.current.push({
                    id: `bburst-${now}-${Math.random()}`,
                    x: tBoat.x,
                    y: tBoat.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    radius: 3,
                    color: k % 2 === 0 ? boatTeam?.color ?? '#0F172A' : '#38BDF8',
                    alpha: 1,
                    decay: 1.5,
                  });
                }
                if (boatTeam) {
                  callbacksRef.current.onBattleLog({
                    id: `sunk-${Date.now()}-${boatTeam.id}`,
                    text: `${boatTeam.name}'s boat was destroyed!`,
                    color: boatTeam.color,
                    timestamp: Date.now(),
                  });
                }
              }
            }
          } else {
            activeProjectiles.push(p);
          }
        }
        projectilesRef.current = activeProjectiles;

        if (deadUnitIds.size > 0) {
          unitsRef.current = unitsRemaining.filter((u) => !deadUnitIds.has(u.id));
        }
        if (deadBoatIds.size > 0) {
          boatsRef.current = boats.filter((b) => !deadBoatIds.has(b.id));
        }

        // Particles & Floating Texts & Pulses
        particlesRef.current = particlesRef.current.filter((pt) => {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.alpha -= pt.decay * dt;
          return pt.alpha > 0;
        });

        floatingTextsRef.current = floatingTextsRef.current.filter((ft) => {
          ft.y += ft.vy * dt;
          ft.alpha -= 1.3 * dt;
          return ft.alpha > 0;
        });

        orderPulsesRef.current = orderPulsesRef.current.filter((op) => {
          op.radius += 45 * dt;
          op.alpha -= 1.8 * dt;
          return op.alpha > 0;
        });

        if (statsDirty || now - lastStatsEmit > 160) {
          lastStatsEmit = now;
          syncStatsNow();
        }

        // === RENDER ===
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (canvas && container) {
          const rect = container.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const targetW = Math.floor(rect.width * dpr);
          const targetH = Math.floor(rect.height * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.save();
            ctx.scale(dpr, dpr);

            ctx.fillStyle = '#F1F5F9';
            ctx.fillRect(0, 0, rect.width, rect.height);

            const cam = cameraRef.current;
            ctx.translate(cam.x, cam.y);
            ctx.scale(cam.scale, cam.scale);

            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
            ctx.shadowBlur = 20 / cam.scale;
            ctx.shadowOffsetY = 5 / cam.scale;
            ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
            ctx.shadowColor = 'transparent';

            if (mapImageRef.current) {
              ctx.drawImage(mapImageRef.current, 0, 0, MAP_WIDTH, MAP_HEIGHT);
            }

            ctx.lineWidth = 1.5 / cam.scale;
            ctx.strokeStyle = '#CBD5E1';
            ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

            // Waypoint lines for moving units & boats
            for (const u of unitsRef.current) {
              if (u.targetX !== null && u.targetY !== null) {
                const color = teamMap.get(u.teamId)?.color ?? '#0F172A';
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.moveTo(u.x, u.y);
                ctx.lineTo(u.targetX, u.targetY);
                ctx.strokeStyle = u.selected ? color : 'rgba(100,116,139,0.45)';
                ctx.lineWidth = u.selected ? 1.4 : 0.9;
                ctx.stroke();
                ctx.restore();
              }
            }
            for (const b of boatsRef.current) {
              if (b.targetX !== null && b.targetY !== null) {
                const color = teamMap.get(b.teamId)?.color ?? '#0F172A';
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([6, 4]);
                ctx.moveTo(b.x, b.y);
                ctx.lineTo(b.targetX, b.targetY);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.6;
                ctx.stroke();
                ctx.restore();
              }
            }

            // Order pulses
            for (const op of orderPulsesRef.current) {
              ctx.beginPath();
              ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
              ctx.strokeStyle = op.color;
              ctx.globalAlpha = Math.max(0, op.alpha);
              ctx.lineWidth = 1.6;
              ctx.stroke();
              ctx.globalAlpha = 1;
            }

            // Render Boats
            for (const b of boatsRef.current) {
              const team = teamMap.get(b.teamId);
              const color = team?.color ?? '#475569';
              const isHovered =
                hoverTargetRef.current?.type === 'BOAT' &&
                hoverTargetRef.current.id === b.id;

              if (b.selected || isHovered) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius + 5, 0, Math.PI * 2);
                ctx.strokeStyle = b.selected ? '#0F172A' : 'rgba(15,23,42,0.45)';
                ctx.lineWidth = b.selected ? 2 : 1.3;
                ctx.stroke();
              }

              // Boat hull
              ctx.save();
              ctx.translate(b.x, b.y);
              ctx.rotate(b.facingAngle);

              ctx.beginPath();
              ctx.moveTo(15, 0);
              ctx.quadraticCurveTo(8, 9, -12, 8);
              ctx.lineTo(-14, 0);
              ctx.lineTo(-12, -8);
              ctx.quadraticCurveTo(8, -9, 15, 0);
              ctx.closePath();

              ctx.fillStyle = b.hitFlash > 0.25 ? '#FFFFFF' : color;
              ctx.fill();
              ctx.lineWidth = 1.8;
              ctx.strokeStyle = '#0F172A';
              ctx.stroke();

              // Cabin deck
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(-6, -4, 9, 8);
              ctx.lineWidth = 1;
              ctx.strokeStyle = '#0F172A';
              ctx.strokeRect(-6, -4, 9, 8);
              ctx.restore();

              // Passenger count badge on boat if carrying circles
              if (b.passengers.length > 0) {
                ctx.fillStyle = '#0F172A';
                ctx.beginPath();
                ctx.arc(b.x + 11, b.y - 10, 7, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '700 8.5px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(b.passengers.length), b.x + 11, b.y - 9.5);
              }

              // Boat HP bar when damaged
              if (b.hp < b.maxHp) {
                const w = 26;
                const ratio = Math.max(0, b.hp / b.maxHp);
                ctx.fillStyle = 'rgba(15,23,42,0.25)';
                ctx.fillRect(b.x - w / 2, b.y - b.radius - 8, w, 3.5);
                ctx.fillStyle = ratio > 0.4 ? color : '#DC2626';
                ctx.fillRect(b.x - w / 2, b.y - b.radius - 8, w * ratio, 3.5);
              }
            }

            // Render Small Army Circles
            for (const u of unitsRef.current) {
              const team = teamMap.get(u.teamId);
              const color = team?.color ?? '#475569';
              const isHovered =
                hoverTargetRef.current?.type === 'UNIT' &&
                hoverTargetRef.current.id === u.id;

              if (u.selected) {
                ctx.beginPath();
                ctx.arc(u.x, u.y, u.radius + 3.2, 0, Math.PI * 2);
                ctx.strokeStyle = '#0F172A';
                ctx.lineWidth = 1.6;
                ctx.stroke();
              } else if (isHovered) {
                ctx.beginPath();
                ctx.arc(u.x, u.y, u.radius + 2.5, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(15,23,42,0.45)';
                ctx.lineWidth = 1.1;
                ctx.stroke();
              }

              ctx.beginPath();
              ctx.arc(u.x, u.y, u.radius, 0, Math.PI * 2);
              ctx.fillStyle = u.hitFlash > 0.25 ? '#FFFFFF' : color;
              ctx.fill();
              ctx.lineWidth = 1.3;
              ctx.strokeStyle = '#FFFFFF';
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(u.x, u.y, u.radius + 0.5, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
              ctx.lineWidth = 0.7;
              ctx.stroke();

              // Crown on King circle (same circle size, crown sitting on top)
              if (u.isKing) {
                const cy = u.y - u.radius + 0.5;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(u.x - 4.5, cy);
                ctx.lineTo(u.x - 5, cy - 4.5);
                ctx.lineTo(u.x - 2.2, cy - 2);
                ctx.lineTo(u.x, cy - 5.5);
                ctx.lineTo(u.x + 2.2, cy - 2);
                ctx.lineTo(u.x + 5, cy - 4.5);
                ctx.lineTo(u.x + 4.5, cy);
                ctx.closePath();
                ctx.fillStyle = '#FACC15';
                ctx.fill();
                ctx.lineWidth = 0.9;
                ctx.strokeStyle = '#0F172A';
                ctx.stroke();
                ctx.restore();
              }
            }

            // Projectiles
            for (const p of projectilesRef.current) {
              ctx.beginPath();
              ctx.moveTo(
                p.fromX + (p.toX - p.fromX) * Math.max(0, p.progress - 0.3),
                p.fromY + (p.toY - p.fromY) * Math.max(0, p.progress - 0.3)
              );
              ctx.lineTo(p.x, p.y);
              ctx.strokeStyle = p.color;
              ctx.lineWidth = 2;
              ctx.lineCap = 'round';
              ctx.stroke();
            }

            // Particles
            for (const pt of particlesRef.current) {
              ctx.save();
              ctx.globalAlpha = Math.max(0, pt.alpha);
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
              ctx.fillStyle = pt.color;
              ctx.fill();
              ctx.restore();
            }

            // Floating texts
            for (const ft of floatingTextsRef.current) {
              ctx.save();
              ctx.globalAlpha = Math.max(0, ft.alpha);
              ctx.font = '700 10px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillStyle = ft.color;
              ctx.fillText(ft.text, ft.x, ft.y);
              ctx.restore();
            }

            // Marquee box
            if (marqueeRef.current) {
              const b = marqueeRef.current;
              const x = Math.min(b.startX, b.endX);
              const y = Math.min(b.startY, b.endY);
              const w = Math.abs(b.endX - b.startX);
              const h = Math.abs(b.endY - b.startY);
              ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
              ctx.fillRect(x, y, w, h);
              ctx.strokeStyle = '#0F172A';
              ctx.lineWidth = 1.3 / cam.scale;
              ctx.strokeRect(x, y, w, h);
            }

            ctx.restore();
          }
        }

        rafId = requestAnimationFrame(step);
      };

      rafId = requestAnimationFrame(step);
      return () => cancelAnimationFrame(rafId);
    }, [disembarkBoat, syncStatsNow]);

    return (
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-slate-100 select-none"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          className={`block h-full w-full touch-none ${
            isPanningCursor ? 'cursor-grabbing' : 'cursor-default'
          }`}
          aria-label="World map simulator canvas"
        />

        {!mapLoaded && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/80">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm">
              Loading map…
            </div>
          </div>
        )}
      </div>
    );
  }
);

BattleCanvas.displayName = 'BattleCanvas';
