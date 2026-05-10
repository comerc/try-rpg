import Phaser from 'phaser';
import { TILE, REPAIR_RATE, REPAIR_COST_PER_HP } from '../config';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/Resource';
import { GameMap } from '../world/GameMap';
import { Pathfinding, type PathOptions } from '../world/Pathfinding';
import { EconomySystem } from './EconomySystem';

const UNIT_SOFT_BLOCK_COST = 80;

export class CommandSystem {
  constructor(
    private scene: Phaser.Scene,
    private map: GameMap,
    private path: Pathfinding,
    private getEntities: () => Entity[],
    private eco: EconomySystem,
  ) {
    scene.events.on('gather:return', this.onGatherReturn, this);
    scene.events.on('gather:deposit', this.onGatherDeposit, this);
    scene.events.on('repair:tick', this.onRepairTick, this);
  }

  moveTo(units: Unit[], wx: number, wy: number) {
    const offsets = this.getFormationOffsets(units.length);
    const reserved = new Set<string>();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      this.clearAttackChase(u);
      const ox = offsets[i].x;
      const oy = offsets[i].y;
      u.lastOrderPoint = { x: wx + ox, y: wy + oy };
      const requested = this.map.worldToTile(wx + ox, wy + oy);
      this.findCommandPath(u, requested.tx, requested.ty, reserved, (p) => {
        u.setPath(p);
      });
    }
  }

  attackMove(units: Unit[], wx: number, wy: number) {
    const tgt = this.map.worldToTile(wx, wy);
    const reserved = new Set<string>();
    for (const u of units) {
      u.clearBuildQueue();
      this.clearAttackChase(u);
      u.lastOrderPoint = { x: wx, y: wy };
      this.findCommandPath(u, tgt.tx, tgt.ty, reserved, (p) => {
        u.fsm = { kind: 'attackMoving', path: p, i: 0 };
      });
    }
  }

  attackTarget(units: Unit[], target: Entity) {
    const reserved = new Set<string>();
    for (const u of units) {
      u.clearBuildQueue();
      if (this.inRange(u, target)) {
        u.attackChaseTarget = target;
        u.fsm = { kind: 'attacking', target };
      } else {
        const tgt = this.map.worldToTile(target.x, target.y);
        this.findCommandPath(u, tgt.tx, tgt.ty, reserved, (p) => {
          u.fsm = { kind: 'attackMoving', path: p, i: 0 };
          u.attackChaseTarget = target;
        });
      }
    }
  }

  gather(units: Unit[], resource: ResourceNode) {
    const reserved = new Set<string>();
    for (const u of units) {
      if (u.kind !== 'peasant') continue;
      u.clearBuildQueue();
      this.clearAttackChase(u);
      this.findAccessPath(u, resource, reserved, (p) => {
        u.fsm = { kind: 'gathering', resource, returning: false, carrying: 0, gatherTicker: 0, path: p, i: 0 };
      });
    }
  }

  stop(units: Unit[]) { for (const u of units) u.stop(); }
  hold(units: Unit[]) { for (const u of units) u.hold(); }

  patrol(units: Unit[], pointA: { x: number; y: number }, pointB: { x: number; y: number }) {
    const reserved = new Set<string>();
    for (const u of units) {
      u.clearBuildQueue();
      this.clearAttackChase(u);
      const tgt = this.map.worldToTile(pointB.x, pointB.y);
      this.findCommandPath(u, tgt.tx, tgt.ty, reserved, (p) => {
        u.fsm = { kind: 'patrol', pointA, pointB, path: p, i: 0, toB: true };
      });
    }
  }

  buildWith(unit: Unit, target: Building) {
    this.clearAttackChase(unit);
    this.findAccessPath(unit, target, new Set(), (p) => {
      unit.assignBuildTarget(target);
      if (unit.fsm.kind === 'building') {
        unit.fsm.path = p;
        unit.fsm.i = 0;
      }
    });
  }

  repair(units: Unit[], target: Building) {
    const reserved = new Set<string>();
    for (const u of units) {
      if (u.kind !== 'peasant') continue;
      if (target.team !== u.team) continue;
      if (!target.isBuilt() || target.hp >= target.maxHp) continue;
      u.clearBuildQueue();
      this.clearAttackChase(u);
      this.findAccessPath(u, target, reserved, (p) => {
        u.fsm = { kind: 'repair', target, path: p, i: 0 };
      });
    }
  }

  destroy() {
    this.scene.events.off('gather:return', this.onGatherReturn, this);
    this.scene.events.off('gather:deposit', this.onGatherDeposit, this);
    this.scene.events.off('repair:tick', this.onRepairTick, this);
  }

  private getFormationOffsets(count: number): { x: number; y: number }[] {
    if (count <= 1) return [{ x: 0, y: 0 }];
    const cols = Math.ceil(Math.sqrt(count));
    const spacing = TILE;
    const offsets: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      offsets.push({
        x: (col - (cols - 1) / 2) * spacing,
        y: (row - Math.floor((count - 1) / cols) / 2) * spacing,
      });
    }
    return offsets;
  }

  private findCommandPath(
    unit: Unit,
    tx: number,
    ty: number,
    reserved: Set<string>,
    onPath: (path: { tx: number; ty: number }[]) => void,
  ) {
    const from = this.map.worldToTile(unit.x, unit.y);
    this.path.findPath(from.tx, from.ty, tx, ty, (path) => {
      if (!path || path.length < 1) return;
      const end = path[path.length - 1];
      reserved.add(this.tileKey(end.tx, end.ty));
      onPath(path);
    }, this.dynamicPathOptions(unit, reserved, 12));
  }

  private dynamicPathOptions(unit: Unit, reserved: Set<string>, maxTargetRadius: number): PathOptions {
    const blocked = (px: number, py: number) => this.isDynamicBlocked(px, py, unit, reserved);
    return {
      maxTargetRadius,
      softBlocked: blocked,
      softBlockCost: UNIT_SOFT_BLOCK_COST,
      destinationBlocked: blocked,
    };
  }

  private findAccessPath(
    unit: Unit,
    target: { tx: number; ty: number; size: number },
    reserved: Set<string>,
    onPath: (path: { tx: number; ty: number }[]) => void,
  ) {
    const from = this.map.worldToTile(unit.x, unit.y);
    let bestPath: { tx: number; ty: number }[] | null = null;
    let bestCost = Infinity;
    for (const candidate of this.accessTilesAround(target, from.tx, from.ty)) {
      this.path.findPath(from.tx, from.ty, candidate.tx, candidate.ty, (path) => {
        if (!path || path.length < 1) return;
        const cost = this.pathCost(path, unit, reserved);
        if (cost < bestCost) {
          bestPath = path;
          bestCost = cost;
        }
      }, this.dynamicPathOptions(unit, reserved, 0));
    }
    const resolvedPath = bestPath as { tx: number; ty: number }[] | null;
    if (!resolvedPath) return;
    const end = resolvedPath[resolvedPath.length - 1];
    reserved.add(this.tileKey(end.tx, end.ty));
    onPath(resolvedPath);
  }

  private accessTilesAround(
    target: { tx: number; ty: number; size: number },
    fromTx: number,
    fromTy: number,
  ): { tx: number; ty: number }[] {
    const tiles: { tx: number; ty: number }[] = [];
    const minX = target.tx;
    const minY = target.ty;
    const maxX = target.tx + target.size - 1;
    const maxY = target.ty + target.size - 1;
    for (let y = minY - 1; y <= maxY + 1; y++) {
      for (let x = minX - 1; x <= maxX + 1; x++) {
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue;
        tiles.push({ tx: x, ty: y });
      }
    }
    return tiles
      .filter((tile) => this.map.inBounds(tile.tx, tile.ty) && !this.map.isBlocked(tile.tx, tile.ty))
      .sort((a, b) => this.tileDistance(fromTx, fromTy, a.tx, a.ty) - this.tileDistance(fromTx, fromTy, b.tx, b.ty));
  }

  private pathCost(path: { tx: number; ty: number }[], unit?: Unit, reserved?: Set<string>): number {
    let cost = 0;
    for (let i = 1; i < path.length; i++) {
      cost += this.tileDistance(path[i - 1].tx, path[i - 1].ty, path[i].tx, path[i].ty);
      if (unit && reserved && this.isDynamicBlocked(path[i].tx, path[i].ty, unit, reserved)) {
        cost += UNIT_SOFT_BLOCK_COST;
      }
    }
    return cost;
  }

  private isDynamicBlocked(tx: number, ty: number, ignore: Unit, reserved: Set<string>): boolean {
    if (reserved.has(this.tileKey(tx, ty))) return true;
    for (const e of this.getEntities()) {
      if (!(e instanceof Unit) || e.dead || e === ignore) continue;
      const tile = this.map.worldToTile(e.x, e.y);
      if (tile.tx === tx && tile.ty === ty) return true;
    }
    return false;
  }

  private tileKey(tx: number, ty: number): string {
    return `${tx}:${ty}`;
  }

  private tileDistance(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return 10 * (dx + dy) - 6 * Math.min(dx, dy);
  }

  private inRange(u: Unit, target: Entity): boolean {
    const r = (target as any).radius ?? 12;
    const d = Math.hypot(target.x - u.x, target.y - u.y) - r;
    return d <= u.range;
  }

  private onGatherReturn = (unit: Unit, carrying: number, kind: 'gold' | 'wood') => {
    const dropoff = this.findDropoff(unit);
    if (!dropoff) {
      // No dropoff: stash state, wait.
      unit.fsm = { kind: 'idle' };
      unit.setCarrying(null);
      return;
    }
    this.findAccessPath(unit, dropoff, new Set(), (p) => {
      unit.fsm = { kind: 'returning', dropoff, carrying, carryKind: kind, path: p, i: 0 };
    });
  };

  private onGatherDeposit = (unit: Unit, carrying: number, kind: 'gold' | 'wood') => {
    const teamKey = `res:${unit.team}`;
    const reg = this.scene.registry.get(teamKey) ?? { gold: 0, wood: 0 };
    reg[kind] = (reg[kind] ?? 0) + carrying;
    this.scene.registry.set(teamKey, reg);

    if (unit.lastHarvestedNode && !unit.lastHarvestedNode.dead) {
      this.gather([unit], unit.lastHarvestedNode);
    } else {
      // Find next nearest same-kind resource, else idle.
      const next = this.findNearestResourceOfKind(unit, kind === 'gold' ? 'goldmine' : 'tree');
      if (next) this.gather([unit], next);
      else unit.fsm = { kind: 'idle' };
    }
  };

  private onRepairTick = (unit: Unit, target: Building, deltaMs: number) => {
    if (!target || target.dead || !unit || unit.dead) return;
    const dt = deltaMs / 1000;
    const hpToHeal = REPAIR_RATE * dt;
    const goldCost = hpToHeal * REPAIR_COST_PER_HP.gold;
    const woodCost = hpToHeal * REPAIR_COST_PER_HP.wood;
    if (!this.eco.spend(unit.team, goldCost, woodCost)) {
      // Out of resources — stop.
      unit.fsm = { kind: 'idle' };
      return;
    }
    target.heal(hpToHeal);
  };

  private findDropoff(unit: Unit): Building | null {
    let best: Building | null = null;
    let bestDist = Infinity;
    for (const e of this.getEntities()) {
      if (!(e instanceof Building)) continue;
      if (e.team !== unit.team) continue;
      if (!e.acceptsResources) continue;
      if (!e.isBuilt()) continue;
      const d = Phaser.Math.Distance.Between(unit.x, unit.y, e.x, e.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  private findNearestResourceOfKind(unit: Unit, kind: 'tree' | 'goldmine'): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestD = Infinity;
    for (const e of this.getEntities()) {
      if (!(e instanceof ResourceNode) || e.dead || e.kind !== kind) continue;
      const d = Phaser.Math.Distance.Between(unit.x, unit.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private clearAttackChase(unit: Unit) {
    unit.attackChaseTarget = null;
  }
}
