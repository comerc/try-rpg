import { GameMap } from './GameMap';

export interface PathPoint { tx: number; ty: number; }

export interface PathOptions {
  extraBlocked?: (tx: number, ty: number) => boolean;
  destinationBlocked?: (tx: number, ty: number) => boolean;
  softBlocked?: (tx: number, ty: number) => boolean;
  softBlockCost?: number;
  maxTargetRadius?: number;
}

interface SearchNode {
  tx: number;
  ty: number;
  key: number;
  g: number;
  h: number;
  f: number;
  parent: SearchNode | null;
}

const CARDINAL_COST = 10;
const DIAGONAL_COST = 14;
const DIRS = [
  { dx: 1, dy: 0, cost: CARDINAL_COST },
  { dx: -1, dy: 0, cost: CARDINAL_COST },
  { dx: 0, dy: 1, cost: CARDINAL_COST },
  { dx: 0, dy: -1, cost: CARDINAL_COST },
  { dx: 1, dy: 1, cost: DIAGONAL_COST },
  { dx: 1, dy: -1, cost: DIAGONAL_COST },
  { dx: -1, dy: 1, cost: DIAGONAL_COST },
  { dx: -1, dy: -1, cost: DIAGONAL_COST },
];
const DEFAULT_SOFT_BLOCK_COST = 80;

class MinHeap {
  private items: SearchNode[] = [];

  get length(): number {
    return this.items.length;
  }

  push(node: SearchNode) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): SearchNode | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last) return first;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.items[index], this.items[parent]) >= 0) return;
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  private sinkDown(index: number) {
    const length = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < length && this.compare(this.items[left], this.items[best]) < 0) best = left;
      if (right < length && this.compare(this.items[right], this.items[best]) < 0) best = right;
      if (best === index) return;
      [this.items[index], this.items[best]] = [this.items[best], this.items[index]];
      index = best;
    }
  }

  private compare(a: SearchNode, b: SearchNode): number {
    if (a.f !== b.f) return a.f - b.f;
    if (a.h !== b.h) return a.h - b.h;
    return a.g - b.g;
  }
}

export class Pathfinding {
  constructor(private map: GameMap) {}

  markDirty() {
    // Kept for the old caller contract. The A* reads GameMap directly.
  }

  findPath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    cb: (path: PathPoint[] | null) => void,
    options: PathOptions = {},
  ) {
    cb(this.findPathSync(sx, sy, tx, ty, options));
  }

  findPathSync(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    options: PathOptions = {},
  ): PathPoint[] | null {
    sx = this.clampX(sx);
    sy = this.clampY(sy);
    tx = this.clampX(tx);
    ty = this.clampY(ty);

    return this.searchPath(sx, sy, tx, ty, options);
  }

  private searchPath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    options: PathOptions,
  ): PathPoint[] | null {
    const maxTargetRadius = Math.max(0, options.maxTargetRadius ?? 12);
    const exactTargetPassable = this.isDestinationPassable(tx, ty, sx, sy, options);
    if (!exactTargetPassable && maxTargetRadius <= 0) return null;
    const open = new MinHeap();
    const bestG = new Float64Array(this.map.w * this.map.h);
    bestG.fill(Infinity);
    const closed = new Uint8Array(this.map.w * this.map.h);
    const startH = this.heuristic(sx, sy, tx, ty);
    const startKey = this.nodeKey(sx, sy);
    open.push({
      tx: sx,
      ty: sy,
      key: startKey,
      g: 0,
      h: startH,
      f: startH,
      parent: null,
    });
    bestG[startKey] = 0;

    let bestFallback: SearchNode | null = null;
    let bestFallbackTargetCost = Infinity;
    let bestFallbackPathCost = Infinity;
    while (open.length > 0) {
      const current = open.pop();
      if (!current) break;
      if (closed[current.key]) continue;
      closed[current.key] = 1;

      if (exactTargetPassable && current.tx === tx && current.ty === ty) return this.reconstruct(current);
      if (this.isFallbackCandidate(current.tx, current.ty, sx, sy, tx, ty, maxTargetRadius, options)) {
        const targetCost = this.heuristic(current.tx, current.ty, tx, ty);
        if (targetCost < bestFallbackTargetCost || (targetCost === bestFallbackTargetCost && current.g < bestFallbackPathCost)) {
          bestFallback = current;
          bestFallbackTargetCost = targetCost;
          bestFallbackPathCost = current.g;
        }
      }

      for (const dir of DIRS) {
        const nx = current.tx + dir.dx;
        const ny = current.ty + dir.dy;
        const nextKey = this.nodeKey(nx, ny);
        if (nextKey < 0 || closed[nextKey]) continue;
        if (!this.canStep(current.tx, current.ty, nx, ny, sx, sy, options)) continue;

        const g = current.g + this.stepCost(nx, ny, sx, sy, dir.cost, options);
        if (g >= bestG[nextKey]) continue;

        bestG[nextKey] = g;
        const h = this.heuristic(nx, ny, tx, ty);
        open.push({
          tx: nx,
          ty: ny,
          key: nextKey,
          g,
          h,
          f: g + h,
          parent: current,
        });
      }
    }

    return bestFallback ? this.reconstruct(bestFallback) : null;
  }

  private canStep(
    fromTx: number,
    fromTy: number,
    tx: number,
    ty: number,
    sx: number,
    sy: number,
    options: PathOptions,
  ): boolean {
    if (!this.isPassable(tx, ty, sx, sy, options)) return false;
    const dx = tx - fromTx;
    const dy = ty - fromTy;
    if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) return true;
    return this.isPassable(fromTx + dx, fromTy, sx, sy, options)
      && this.isPassable(fromTx, fromTy + dy, sx, sy, options);
  }

  private isPassable(tx: number, ty: number, sx: number, sy: number, options: PathOptions): boolean {
    if (!this.map.inBounds(tx, ty)) return false;
    if (tx === sx && ty === sy) return true;
    if (this.map.isBlocked(tx, ty)) return false;
    if (options.extraBlocked?.(tx, ty)) return false;
    return true;
  }

  private isDestinationPassable(tx: number, ty: number, sx: number, sy: number, options: PathOptions): boolean {
    if (!this.isPassable(tx, ty, sx, sy, options)) return false;
    if (tx === sx && ty === sy) return true;
    if (options.destinationBlocked?.(tx, ty)) return false;
    return true;
  }

  private isFallbackCandidate(
    tx: number,
    ty: number,
    sx: number,
    sy: number,
    targetTx: number,
    targetTy: number,
    maxTargetRadius: number,
    options: PathOptions,
  ): boolean {
    if (maxTargetRadius <= 0) return false;
    if (tx === targetTx && ty === targetTy) return false;
    if (Math.max(Math.abs(tx - targetTx), Math.abs(ty - targetTy)) > maxTargetRadius) return false;
    return this.isDestinationPassable(tx, ty, sx, sy, options);
  }

  private stepCost(tx: number, ty: number, sx: number, sy: number, baseCost: number, options: PathOptions): number {
    if (tx === sx && ty === sy) return baseCost;
    if (!options.softBlocked?.(tx, ty)) return baseCost;
    return baseCost + (options.softBlockCost ?? DEFAULT_SOFT_BLOCK_COST);
  }

  private reconstruct(node: SearchNode): PathPoint[] {
    const path: PathPoint[] = [];
    let current: SearchNode | null = node;
    while (current) {
      path.push({ tx: current.tx, ty: current.ty });
      current = current.parent;
    }
    path.reverse();
    return path;
  }

  private heuristic(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return CARDINAL_COST * (dx + dy) + (DIAGONAL_COST - 2 * CARDINAL_COST) * Math.min(dx, dy);
  }

  private clampX(tx: number): number {
    return Math.max(0, Math.min(this.map.w - 1, tx));
  }

  private clampY(ty: number): number {
    return Math.max(0, Math.min(this.map.h - 1, ty));
  }

  private nodeKey(tx: number, ty: number): number {
    if (!this.map.inBounds(tx, ty)) return -1;
    return ty * this.map.w + tx;
  }
}
