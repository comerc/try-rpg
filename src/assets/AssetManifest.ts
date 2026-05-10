import type { BuildingKind, ResourceKind, Team, UnitKind } from '../config';

export type AnimationState = 'idle' | 'walk' | 'attack' | 'hit' | 'death' | 'gather' | 'build';
export type AnimationDirection = 'down' | 'right' | 'up';

export interface ImageAsset {
  key: string;
  path: string;
}

export const ASSET_BASE = '/assets/generated';

const units: UnitKind[] = ['peasant', 'footman', 'archer', 'knight', 'cavalier', 'horseArcher', 'horseKnight'];
const buildings: BuildingKind[] = ['townhall', 'barracks', 'farm', 'tower', 'jousting'];
const teams: Team[] = ['player', 'enemy'];
const resources: ResourceKind[] = ['tree', 'goldmine'];
const tiles = ['grass', 'grass-rich', 'dirt', 'water'] as const;
const buildingStages = ['foundation', 'scaffold', 'shell', 'ready', 'damaged', 'ruins'] as const;

export const TERRAIN_ANIMATION_FRAME_COUNT = 8;
export const BUILDING_CONSTRUCTION_FRAME_COUNT = 12;
export const BUILDING_SURFACE_FRAME_COUNT = 8;
export const BUILDING_DESTRUCTION_FRAME_COUNT = 8;

const unitSourceFrameCounts: Record<string, number> = {
  idle: 12,
  'walk-down': 18,
  'walk-right': 18,
  'walk-up': 18,
  attack: 12,
  gather: 12,
  build: 12,
  hit: 8,
  death: 12,
};

export const UNIT_ANIMATION_FRAME_COUNTS: Record<AnimationState, number> = {
  idle: 12,
  walk: 18,
  attack: 12,
  hit: 8,
  death: 12,
  gather: 12,
  build: 12,
};

export const BASE_IMAGE_ASSETS: ImageAsset[] = [
  ...tiles.map((tile) => image(`tile-${tile}`, `${ASSET_BASE}/tile-${tile}.png`)),
  ...units.flatMap((kind) => teams.map((team) => image(`unit-${kind}-${team}-d`, `${ASSET_BASE}/unit-${kind}-${team}-d.png`))),
  ...resources.map((kind) => image(`res-${kind}-d`, `${ASSET_BASE}/res-${kind}-d.png`)),
  ...buildings.flatMap((kind) => teams.map((team) => image(`bld-${kind}-${team}-d`, `${ASSET_BASE}/bld-${kind}-${team}-d.png`))),
  ...buildings.flatMap((kind) => teams.map((team) => image(`bld-${kind}-${team}-level2-d`, `${ASSET_BASE}/bld-${kind}-${team}-level2-d.png`))),
  image('splash-menu', `${ASSET_BASE}/splashes/splash-menu.png`),
  image('splash-victory', `${ASSET_BASE}/splashes/splash-victory.png`),
  image('splash-defeat', `${ASSET_BASE}/splashes/splash-defeat.png`),
];

export const ANIMATION_IMAGE_ASSETS: ImageAsset[] = [
  ...unitAnimationAssets(),
  ...buildings.flatMap((kind) => teams.flatMap((team) => buildingStages.map((stage) => image(
    `bld-${kind}-${team}-${stage}`,
    `${ASSET_BASE}/animation/bld-${kind}-${team}-${stage}.png`,
  )))),
  ...buildings.flatMap((kind) => teams.flatMap((team) => range(BUILDING_CONSTRUCTION_FRAME_COUNT).map((i) => image(
    `bld-${kind}-${team}-build-${i}`,
    `${ASSET_BASE}/animation/bld-${kind}-${team}-build-${i}.png`,
  )))),
  ...buildings.flatMap((kind) => teams.flatMap((team) => range(BUILDING_SURFACE_FRAME_COUNT).flatMap((i) => [
    image(`bld-${kind}-${team}-ready-${i}`, `${ASSET_BASE}/animation/bld-${kind}-${team}-ready-${i}.png`),
    image(`bld-${kind}-${team}-damaged-${i}`, `${ASSET_BASE}/animation/bld-${kind}-${team}-damaged-${i}.png`),
    image(`bld-${kind}-${team}-level2-ready-${i}`, `${ASSET_BASE}/animation/bld-${kind}-${team}-level2-ready-${i}.png`),
    image(`bld-${kind}-${team}-level2-damaged-${i}`, `${ASSET_BASE}/animation/bld-${kind}-${team}-level2-damaged-${i}.png`),
  ]))),
  ...['barracks', 'tower', 'jousting'].flatMap((kind) => teams.flatMap((team) => range(BUILDING_DESTRUCTION_FRAME_COUNT).map((i) => image(
    `bld-${kind}-${team}-destroy-${i}`,
    `${ASSET_BASE}/animation/bld-${kind}-${team}-destroy-${i}.png`,
  )))),
  ...resources.flatMap((kind) => range(4).map((i) => image(`res-${kind}-${i}`, `${ASSET_BASE}/animation/res-${kind}-${i}.png`))),
  ...tiles.flatMap((tile) => range(TERRAIN_ANIMATION_FRAME_COUNT).map((i) => image(`tile-${tile}-${i}`, `${ASSET_BASE}/animation/tile-${tile}-${i}.png`))),
];

export const ASSET_MANIFEST: ImageAsset[] = [
  ...BASE_IMAGE_ASSETS,
  ...ANIMATION_IMAGE_ASSETS,
];

export function unitAnimationKey(
  kind: UnitKind,
  team: Team,
  state: AnimationState,
  direction: AnimationDirection,
  frame: number,
): string {
  const source = sourceStateFor(state, direction);
  const count = unitSourceFrameCounts[source] ?? 1;
  return `unit-${kind}-${team}-${source}-${frame % count}`;
}

export function unitAnimationFallback(kind: UnitKind, team: Team): string {
  return `unit-${kind}-${team}-d`;
}

function sourceStateFor(state: AnimationState, direction: AnimationDirection): string {
  if (state === 'walk') return `walk-${direction}`;
  if (state === 'attack' || state === 'gather' || state === 'build' || state === 'hit' || state === 'death') return state;
  return 'idle';
}

function unitAnimationAssets(): ImageAsset[] {
  const states = Object.entries(unitSourceFrameCounts);
  return units.flatMap((kind) => teams.flatMap((team) => states.flatMap(([state, count]) => (
    range(count).map((i) => image(`unit-${kind}-${team}-${state}-${i}`, `${ASSET_BASE}/animation/unit-${kind}-${team}-${state}-${i}.png`))
  ))));
}

function image(key: string, path: string): ImageAsset {
  return { key, path };
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}
