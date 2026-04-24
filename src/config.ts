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

export type Team = 'player' | 'enemy';

export const TEAM_COLOR: Record<Team, number> = {
  player: 0x3b82f6,
  enemy: 0xef4444,
};

export type UnitKind = 'peasant' | 'footman' | 'archer';
export type BuildingKind = 'townhall' | 'barracks' | 'farm' | 'tower';
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
    trains: ['footman', 'archer'],
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
};

export const START_RESOURCES = { gold: 500, wood: 250, food: 0 };
export const FOOD_BASE_CAP = 5;

export const GATHER_AMOUNT = 8;
export const GATHER_CYCLE = 2000;
export const RESOURCE_STOCK = { tree: 200, goldmine: 2000 };

export const REPAIR_RATE = 40; // hp/sec
export const REPAIR_COST_PER_HP = { gold: 0.15, wood: 0.08 };

export const SOUND_MASTER = 0.35;
