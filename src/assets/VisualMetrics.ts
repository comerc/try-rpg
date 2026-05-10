import { BUILDING_DEFS, BuildingKind, TILE, UnitKind } from '../config';

export const UNIT_VISUAL_SCALE: Record<UnitKind, number> = {
  peasant: 0.48,
  footman: 0.5,
  archer: 0.48,
  knight: 0.52,
  cavalier: 0.58,
  horseArcher: 0.56,
  horseKnight: 0.6,
};

const BUILDING_VISUAL_BOUNDS: Record<BuildingKind, { maxWidth: number; maxHeight: number }> = {
  townhall: { maxWidth: TILE * 3.08, maxHeight: TILE * 3.04 },
  barracks: { maxWidth: TILE * 3.02, maxHeight: TILE * 2.96 },
  farm: { maxWidth: TILE * 1.98, maxHeight: TILE * 1.98 },
  tower: { maxWidth: TILE * 2.02, maxHeight: TILE * 2.26 },
  jousting: { maxWidth: TILE * 3.08, maxHeight: TILE * 2.8 },
};

export function buildingImageFit(
  kind: BuildingKind,
  sourceWidth: number,
  sourceHeight: number,
  constructionScale = 1,
): { scale: number; y: number } {
  const bounds = BUILDING_VISUAL_BOUNDS[kind];
  const sourceW = Math.max(1, sourceWidth);
  const sourceH = Math.max(1, sourceHeight);
  const fitScale = Math.min(bounds.maxWidth / sourceW, bounds.maxHeight / sourceH);
  const scale = fitScale * constructionScale;
  const footprintBottom = (BUILDING_DEFS[kind].size * TILE) / 2 - 3;
  return {
    scale,
    y: footprintBottom - (sourceH * scale) / 2,
  };
}
