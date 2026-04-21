import Phaser from 'phaser';
import { TILE, REPAIR_RATE, REPAIR_COST_PER_HP } from '../config';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/Resource';
import { GameMap } from '../world/GameMap';
import { Pathfinding } from '../world/Pathfinding';
import { EconomySystem } from './EconomySystem';

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
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      this.clearAttackChase(u);
      const ox = offsets[i].x;
      const oy = offsets[i].y;
      u.lastOrderPoint = { x: wx + ox, y: wy + oy };
      const from = this.map.worldToTile(u.x, u.y);
      const destTx = this.map.worldToTile(wx + ox, wy + oy);
      this.path.findPath(from.tx, from.ty, destTx.tx, destTx.ty, (p) => {
        if (!p || p.length < 1) return;
        u.setPath(p);
      });
    }
  }

  attackMove(units: Unit[], wx: number, wy: number) {
    const tgt = this.map.worldToTile(wx, wy);
    for (const u of units) {
      this.clearAttackChase(u);
      u.lastOrderPoint = { x: wx, y: wy };
      const from = this.map.worldToTile(u.x, u.y);
      this.path.findPath(from.tx, from.ty, tgt.tx, tgt.ty, (p) => {
        if (!p || p.length < 1) return;
        u.fsm = { kind: 'attackMoving', path: p, i: 0 };
      });
    }
  }

  attackTarget(units: Unit[], target: Entity) {
    for (const u of units) {
      if (this.inRange(u, target)) {
        (u as any)._attackChaseTarget = target;
        u.fsm = { kind: 'attacking', target };
      } else {
        const tgt = this.map.worldToTile(target.x, target.y);
        const from = this.map.worldToTile(u.x, u.y);
        this.path.findPath(from.tx, from.ty, tgt.tx, tgt.ty, (p) => {
          if (!p || p.length < 1) return;
          u.fsm = { kind: 'attackMoving', path: p, i: 0 };
          (u as any)._attackChaseTarget = target;
        });
      }
    }
  }

  gather(units: Unit[], resource: ResourceNode) {
    for (const u of units) {
      if (u.kind !== 'peasant') continue;
      this.clearAttackChase(u);
      u.fsm = { kind: 'gathering', resource, returning: false, carrying: 0, gatherTicker: 0 };
    }
  }

  stop(units: Unit[]) { for (const u of units) u.stop(); }
  hold(units: Unit[]) { for (const u of units) u.hold(); }

  patrol(units: Unit[], pointA: { x: number; y: number }, pointB: { x: number; y: number }) {
    for (const u of units) {
      this.clearAttackChase(u);
      const from = this.map.worldToTile(u.x, u.y);
      const tgt = this.map.worldToTile(pointB.x, pointB.y);
      this.path.findPath(from.tx, from.ty, tgt.tx, tgt.ty, (p) => {
        if (!p || p.length < 1) return;
        u.fsm = { kind: 'patrol', pointA, pointB, path: p, i: 0, toB: true };
      });
    }
  }

  buildWith(unit: Unit, target: Building) {
    this.clearAttackChase(unit);
    unit.fsm = { kind: 'building', target };
  }

  repair(units: Unit[], target: Building) {
    for (const u of units) {
      if (u.kind !== 'peasant') continue;
      if (target.team !== u.team) continue;
      if (!target.isBuilt() || target.hp >= target.maxHp) continue;
      this.clearAttackChase(u);
      u.fsm = { kind: 'repair', target };
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
    const spacing = 28;
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
    const from = this.map.worldToTile(unit.x, unit.y);
    const tgt = this.map.worldToTile(dropoff.x, dropoff.y);
    this.path.findPath(from.tx, from.ty, tgt.tx, tgt.ty, (p) => {
      if (p && p.length > 0) unit.setPath(p);
      unit.fsm = { kind: 'returning', dropoff, carrying, carryKind: kind };
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
    (unit as any)._attackChaseTarget = null;
  }
}
