import { ArmyUnit, Boat, Team } from '../types/game';

export const MAP_WIDTH = 1531;
export const MAP_HEIGHT = 980;
export const MAP_IMAGE_SRC = '/assets/aistudio/image_5ad39116.png';

export const TEAM_COLOR_PALETTE = [
  { label: 'Yellow (Arabs)', color: '#EAB308' },
  { label: 'Dark Red (Turks)', color: '#991B1B' },
  { label: 'Green (Africans)', color: '#16A34A' },
  { label: 'Orange (Indians)', color: '#EA580C' },
  { label: 'Light Blue (Russians)', color: '#38BDF8' },
  { label: 'Cobalt (Americans)', color: '#2563EB' },
  { label: 'Teal (Brazilians)', color: '#0891B2' },
  { label: 'Violet (Europeans)', color: '#7C3AED' },
  { label: 'Crimson (Chinese)', color: '#DC2626' },
  { label: 'Rose (Australians)', color: '#DB2777' },
];

let unitSeq = 1;
export function nextUnitId(): string {
  unitSeq += 1;
  return `unit-${Date.now()}-${unitSeq}`;
}

let boatSeq = 1;
export function nextBoatId(): string {
  boatSeq += 1;
  return `boat-${Date.now()}-${boatSeq}`;
}

export function createArmyUnit(
  teamId: string,
  x: number,
  y: number,
  overrides?: Partial<ArmyUnit>
): ArmyUnit {
  return {
    id: nextUnitId(),
    teamId,
    x: Math.max(12, Math.min(MAP_WIDTH - 12, x)),
    y: Math.max(12, Math.min(MAP_HEIGHT - 12, y)),
    vx: 0,
    vy: 0,
    targetX: null,
    targetY: null,
    targetBoatId: null,
    radius: 6,
    hp: 100,
    maxHp: 100,
    attack: 15,
    range: 32,
    speed: 96,
    cooldown: Math.random() * 0.25,
    hitFlash: 0,
    selected: false,
    attackTargetId: null,
    isKing: false,
    healCooldown: 0,
    selfHealTimer: 0,
    ...overrides,
  };
}

export function createNationBoat(team: Team, x?: number, y?: number): Boat {
  return {
    id: nextBoatId(),
    teamId: team.id,
    x: x ?? team.dockX,
    y: y ?? team.dockY,
    targetX: null,
    targetY: null,
    disembarkPoint: null,
    radius: 15,
    hp: 240,
    maxHp: 240,
    attack: 18,
    range: 46,
    speed: 132,
    cooldown: 0,
    hitFlash: 0,
    selected: false,
    capacity: 18,
    passengers: [],
    facingAngle: 0,
  };
}

interface NationBlueprint {
  team: Team;
  points: Array<[number, number]>;
}

const NATION_BLUEPRINTS: NationBlueprint[] = [
  {
    team: {
      id: 'team-arabs',
      name: 'Arabs',
      color: '#EAB308',
      kills: 0,
      losses: 0,
      homeX: 892,
      homeY: 428,
      dockX: 930,
      dockY: 505,
    },
    points: [
      [872, 412], [892, 408], [912, 416], [882, 428],
      [902, 428], [890, 444], [914, 442], [926, 428],
    ],
  },
  {
    team: {
      id: 'team-turks',
      name: 'Turks',
      color: '#991B1B',
      kills: 0,
      losses: 0,
      homeX: 842,
      homeY: 356,
      dockX: 805,
      dockY: 384,
    },
    points: [
      [826, 350], [842, 348], [858, 350], [832, 362],
      [848, 362], [864, 360], [820, 358], [852, 370],
    ],
  },
  {
    team: {
      id: 'team-africans',
      name: 'Africans',
      color: '#16A34A',
      kills: 0,
      losses: 0,
      homeX: 765,
      homeY: 540,
      dockX: 635,
      dockY: 540,
    },
    points: [
      [718, 490], [742, 495], [768, 505], [750, 528],
      [776, 535], [798, 558], [766, 585], [782, 640],
      [776, 682],
    ],
  },
  {
    team: {
      id: 'team-indians',
      name: 'Indians',
      color: '#EA580C',
      kills: 0,
      losses: 0,
      homeX: 1066,
      homeY: 444,
      dockX: 1055,
      dockY: 545,
    },
    points: [
      [1048, 422], [1068, 420], [1086, 430], [1054, 442],
      [1072, 444], [1062, 464], [1076, 476], [1066, 492],
    ],
  },
  {
    team: {
      id: 'team-russians',
      name: 'Russians',
      color: '#38BDF8',
      kills: 0,
      losses: 0,
      homeX: 985,
      homeY: 236,
      dockX: 1000,
      dockY: 155,
    },
    points: [
      [888, 226], [924, 224], [960, 222], [998, 224],
      [1036, 222], [1076, 224], [1114, 226], [1152, 228],
      [942, 246], [1018, 246],
    ],
  },
  {
    team: {
      id: 'team-americans',
      name: 'Americans',
      color: '#2563EB',
      kills: 0,
      losses: 0,
      homeX: 350,
      homeY: 335,
      dockX: 485,
      dockY: 390,
    },
    points: [
      [300, 315], [328, 320], [356, 324], [386, 324],
      [414, 326], [322, 344], [354, 348], [386, 348],
      [352, 246], [392, 248],
    ],
  },
  {
    team: {
      id: 'team-brazilians',
      name: 'Brazilians',
      color: '#0891B2',
      kills: 0,
      losses: 0,
      homeX: 492,
      homeY: 616,
      dockX: 585,
      dockY: 635,
    },
    points: [
      [455, 588], [482, 594], [508, 604], [472, 618],
      [500, 626], [526, 636], [486, 650], [462, 686],
    ],
  },
  {
    team: {
      id: 'team-europeans',
      name: 'Europeans',
      color: '#7C3AED',
      kills: 0,
      losses: 0,
      homeX: 740,
      homeY: 290,
      dockX: 655,
      dockY: 315,
    },
    points: [
      [718, 282], [736, 276], [756, 278], [774, 284],
      [726, 298], [748, 298], [768, 300], [692, 256],
    ],
  },
  {
    team: {
      id: 'team-chinese',
      name: 'Chinese',
      color: '#DC2626',
      kills: 0,
      losses: 0,
      homeX: 1165,
      homeY: 360,
      dockX: 1255,
      dockY: 380,
    },
    points: [
      [1126, 344], [1150, 344], [1174, 346], [1198, 350],
      [1138, 366], [1164, 368], [1188, 372], [1156, 390],
    ],
  },
  {
    team: {
      id: 'team-australians',
      name: 'Australians',
      color: '#DB2777',
      kills: 0,
      losses: 0,
      homeX: 1285,
      homeY: 710,
      dockX: 1375,
      dockY: 675,
    },
    points: [
      [1255, 698], [1278, 694], [1302, 698], [1264, 718],
      [1288, 720], [1312, 718], [1282, 736],
    ],
  },
];

export function createInitialWorld(): {
  teams: Team[];
  units: ArmyUnit[];
  boats: Boat[];
} {
  const teams = NATION_BLUEPRINTS.map((n) => ({ ...n.team }));
  const units = NATION_BLUEPRINTS.flatMap((n) =>
    n.points.map(([x, y], idx) =>
      createArmyUnit(
        n.team.id,
        x,
        y,
        idx === 0
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
    )
  );
  const boats = teams.map((t) => createNationBoat(t));
  return { teams, units, boats };
}
