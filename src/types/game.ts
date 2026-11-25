export interface Team {
  id: string;
  name: string;
  color: string;
  kills: number;
  losses: number;
  homeX: number;
  homeY: number;
  dockX: number;
  dockY: number;
}

export interface ArmyUnit {
  id: string;
  teamId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number | null;
  targetY: number | null;
  targetBoatId: string | null;
  radius: number;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  speed: number;
  cooldown: number;
  hitFlash: number;
  selected: boolean;
  attackTargetId: string | null;
  isKing?: boolean;
  healCooldown?: number;
  selfHealTimer?: number;
}

export interface Boat {
  id: string;
  teamId: string;
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  disembarkPoint: { x: number; y: number } | null;
  radius: number;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  speed: number;
  cooldown: number;
  hitFlash: number;
  selected: boolean;
  capacity: number;
  passengers: ArmyUnit[];
  facingAngle: number;
}

export interface Projectile {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  x: number;
  y: number;
  progress: number;
  color: string;
  damage: number;
  targetUnitId: string | null;
  targetBoatId: string | null;
  attackerTeamId: string;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

export interface WheelEntry {
  id: string;
  name: string;
  color: string;
  teamId?: string;
}

export interface SpinPairResult {
  id: string;
  first: WheelEntry;
  second: WheelEntry;
  timestamp: number;
}

export interface BattleLogEntry {
  id: string;
  text: string;
  color: string;
  timestamp: number;
}
