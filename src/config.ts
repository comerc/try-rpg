export const TILE = 48;
export const MAP_W = 60;
export const MAP_H = 40;

export const WORLD_W = TILE * MAP_W;
export const WORLD_H = TILE * MAP_H;

export const VIEWPORT_W = 1920;
export const VIEWPORT_H = 1080;

// Height of the opaque UI bars in UIScene. The Game camera's viewport is
// inset so the world never renders underneath them.
export const UI_TOP_H = 44;
export const UI_BOTTOM_H = 154;
export const WORLD_RENDER_PADDING = TILE * 2;

export type Team = 'player' | 'enemy';

export const TEAM_COLOR: Record<Team, number> = {
  player: 0x3b82f6,
  enemy: 0xef4444,
};

export type UnitKind = 'peasant' | 'footman' | 'archer' | 'knight' | 'cavalier' | 'horseArcher' | 'horseKnight';
export type BuildingKind = 'townhall' | 'barracks' | 'farm' | 'tower' | 'jousting';
export type ResourceKind = 'tree' | 'goldmine';

export interface UnitDef {
  maxHp: number;
  speed: number;
  attack: number;
  armor: number;
  range: number;
  attackCooldown: number;
  cost: { gold: number; wood: number; food: number };
  trainTime: number;
  sight: number;
  requires?: { building: BuildingKind; level: number };
}

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  peasant: {
    maxHp: 40, speed: 80, attack: 4, armor: 0,
    range: TILE * 1.2, attackCooldown: 1200,
    cost: { gold: 50, wood: 0, food: 1 }, trainTime: 8000, sight: TILE * 5,
  },
  footman: {
    maxHp: 90, speed: 70, attack: 12, armor: 2,
    range: TILE * 1.2, attackCooldown: 1000,
    cost: { gold: 80, wood: 0, food: 2 }, trainTime: 12000, sight: TILE * 6,
  },
  archer: {
    maxHp: 55, speed: 75, attack: 10, armor: 0,
    range: TILE * 5, attackCooldown: 1400,
    cost: { gold: 70, wood: 30, food: 2 }, trainTime: 13000, sight: TILE * 7,
  },
  knight: {
    maxHp: 150, speed: 64, attack: 22, armor: 4,
    range: TILE * 1.25, attackCooldown: 1150,
    cost: { gold: 160, wood: 60, food: 3 }, trainTime: 18000, sight: TILE * 6,
  },
  cavalier: {
    maxHp: 120, speed: 112, attack: 16, armor: 2,
    range: TILE * 1.25, attackCooldown: 1050,
    cost: { gold: 135, wood: 45, food: 3 }, trainTime: 17000, sight: TILE * 7,
    requires: { building: 'jousting', level: 1 },
  },
  horseArcher: {
    maxHp: 95, speed: 118, attack: 13, armor: 1,
    range: TILE * 4.6, attackCooldown: 1300,
    cost: { gold: 150, wood: 80, food: 3 }, trainTime: 19000, sight: TILE * 8,
    requires: { building: 'jousting', level: 2 },
  },
  horseKnight: {
    maxHp: 190, speed: 104, attack: 26, armor: 5,
    range: TILE * 1.35, attackCooldown: 1100,
    cost: { gold: 220, wood: 90, food: 4 }, trainTime: 24000, sight: TILE * 7,
    requires: { building: 'jousting', level: 2 },
  },
};

export interface BuildingDef {
  maxHp: number;
  size: number;
  cost: { gold: number; wood: number };
  buildTime: number;
  trains?: UnitKind[];
  provides?: { food?: number };
  acceptsResources?: boolean;
  sight: number;
  attack?: number;
  range?: number;
  attackCooldown?: number;
}

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  townhall: {
    maxHp: 600, size: 3,
    cost: { gold: 400, wood: 200 }, buildTime: 30000,
    trains: ['peasant'],
    provides: { food: 5 },
    acceptsResources: true,
    sight: TILE * 8,
  },
  barracks: {
    maxHp: 400, size: 3,
    cost: { gold: 200, wood: 100 }, buildTime: 20000,
    trains: ['footman', 'archer', 'cavalier', 'horseArcher', 'horseKnight'],
    sight: TILE * 6,
  },
  farm: {
    maxHp: 200, size: 2,
    cost: { gold: 80, wood: 40 }, buildTime: 10000,
    provides: { food: 5 },
    sight: TILE * 4,
  },
  tower: {
    maxHp: 300, size: 2,
    cost: { gold: 120, wood: 80 }, buildTime: 15000,
    sight: TILE * 8,
    attack: 14, range: TILE * 6, attackCooldown: 1300,
  },
  jousting: {
    maxHp: 360, size: 3,
    cost: { gold: 180, wood: 160 }, buildTime: 22000,
    sight: TILE * 6,
  },
};

export interface BuildingUpgradeDef {
  level: number;
  label: string;
  cost: { gold: number; wood: number };
  time: number;
  maxHpBonus?: number;
  foodBonus?: number;
  sightBonus?: number;
  attackBonus?: number;
  rangeBonus?: number;
  attackCooldownMultiplier?: number;
  trainTimeMultiplier?: number;
  unlocks?: UnitKind[];
}

export interface BuildingRuntimeStats {
  maxHp: number;
  foodProvided: number;
  sight: number;
  attack: number;
  range: number;
  attackCooldown: number;
  trainTimeMultiplier: number;
}

export const BUILDING_UPGRADES: Record<BuildingKind, BuildingUpgradeDef[]> = {
  townhall: [{
    level: 2,
    label: 'Большая ратуша',
    cost: { gold: 260, wood: 180 },
    time: 20000,
    maxHpBonus: 250,
    foodBonus: 4,
    sightBonus: TILE * 1.5,
    trainTimeMultiplier: 0.85,
  }],
  barracks: [{
    level: 2,
    label: 'Военная академия',
    cost: { gold: 240, wood: 160 },
    time: 22000,
    maxHpBonus: 180,
    sightBonus: TILE,
    trainTimeMultiplier: 0.9,
    unlocks: ['knight'],
  }],
  farm: [{
    level: 2,
    label: 'Урожайная ферма',
    cost: { gold: 120, wood: 100 },
    time: 14000,
    maxHpBonus: 70,
    foodBonus: 5,
  }],
  tower: [{
    level: 2,
    label: 'Сторожевая башня',
    cost: { gold: 160, wood: 140 },
    time: 18000,
    maxHpBonus: 120,
    sightBonus: TILE,
    attackBonus: 8,
    rangeBonus: TILE,
    attackCooldownMultiplier: 0.9,
  }],
  jousting: [{
    level: 2,
    label: 'Королевское ристалище',
    cost: { gold: 260, wood: 220 },
    time: 24000,
    maxHpBonus: 160,
    sightBonus: TILE,
  }],
};

export function nextBuildingUpgrade(kind: BuildingKind, currentLevel: number): BuildingUpgradeDef | null {
  return BUILDING_UPGRADES[kind].find((upgrade) => upgrade.level === currentLevel + 1) ?? null;
}

export function buildingAvailableTrains(kind: BuildingKind, level: number): UnitKind[] {
  const base = BUILDING_DEFS[kind].trains ?? [];
  const unlocked = BUILDING_UPGRADES[kind]
    .filter((upgrade) => upgrade.level <= level)
    .flatMap((upgrade) => upgrade.unlocks ?? []);
  return Array.from(new Set([...base, ...unlocked]));
}

export function unitTrainingRequirement(kind: UnitKind): UnitDef['requires'] | null {
  return UNIT_DEFS[kind].requires ?? null;
}

export function buildingRuntimeStats(kind: BuildingKind, level: number): BuildingRuntimeStats {
  const base = BUILDING_DEFS[kind];
  const stats: BuildingRuntimeStats = {
    maxHp: base.maxHp,
    foodProvided: base.provides?.food ?? 0,
    sight: base.sight,
    attack: base.attack ?? 0,
    range: base.range ?? 0,
    attackCooldown: base.attackCooldown ?? 1500,
    trainTimeMultiplier: 1,
  };

  for (const upgrade of BUILDING_UPGRADES[kind]) {
    if (upgrade.level > level) continue;
    stats.maxHp += upgrade.maxHpBonus ?? 0;
    stats.foodProvided += upgrade.foodBonus ?? 0;
    stats.sight += upgrade.sightBonus ?? 0;
    stats.attack += upgrade.attackBonus ?? 0;
    stats.range += upgrade.rangeBonus ?? 0;
    stats.attackCooldown *= upgrade.attackCooldownMultiplier ?? 1;
    stats.trainTimeMultiplier *= upgrade.trainTimeMultiplier ?? 1;
  }

  return stats;
}

export const START_RESOURCES = { gold: 500, wood: 250, food: 0 };
export const FOOD_BASE_CAP = 5;

export const GATHER_AMOUNT = 8;
export const GATHER_CYCLE = 2000;
export const RESOURCE_STOCK = { tree: 200, goldmine: 2000 };

export const REPAIR_RATE = 40; // hp/sec
export const REPAIR_COST_PER_HP = { gold: 0.15, wood: 0.08 };

export const SOUND_MASTER = 0.35;

export type GraphicsQuality = 'high' | 'medium' | 'low';

export function getGraphicsQuality(): GraphicsQuality {
  if (typeof window === 'undefined') return 'high';
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('quality') ?? window.localStorage.getItem('rts:graphics-quality');
  if (requested === 'low' || requested === 'medium' || requested === 'high') return requested;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mobile = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 900;
  if (mobile || cores <= 4) return 'medium';
  return 'high';
}
