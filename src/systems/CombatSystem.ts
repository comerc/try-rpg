import Phaser from 'phaser';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';

export class CombatSystem {
  constructor(private getEntities: () => Entity[]) {}

  update(_time: number, _delta: number) {
    const ents = this.getEntities();
    for (const e of ents) {
      if (!(e instanceof Unit)) continue;
      if (e.dead) continue;

      const chase = (e as any)._attackChaseTarget as Entity | undefined;
      if (chase) {
        if (chase.dead) {
          (e as any)._attackChaseTarget = null;
          if (e.fsm.kind !== 'idle') e.fsm = { kind: 'idle' };
          continue;
        }
        const r = (chase as any).radius ?? 12;
        const d = Math.hypot(chase.x - e.x, chase.y - e.y) - r;
        if (d <= e.range) {
          e.fsm = { kind: 'attacking', target: chase };
        }
      }

      if ((e.fsm.kind === 'idle' || e.fsm.kind === 'hold' || e.fsm.kind === 'moving' || e.fsm.kind === 'patrol') && e.autoAcquire && e.kind !== 'peasant') {
        const target = this.findEnemyInSight(e, ents);
        if (target) {
          const d = Math.hypot(target.x - e.x, target.y - e.y) - ((target as any).radius ?? 12);
          if (d <= e.range) {
            e.fsm = { kind: 'attacking', target };
          } else if (e.fsm.kind === 'idle') {
            (e as any)._attackChaseTarget = target;
            e.fsm = { kind: 'attacking', target };
          }
        }
      }
    }
  }

  private findEnemyInSight(u: Unit, ents: Entity[]): Entity | null {
    let best: Entity | null = null;
    let bestDist = Infinity;
    for (const o of ents) {
      if (o.dead) continue;
      if (!(o instanceof Unit || o instanceof Building)) continue;
      if (o.team === u.team) continue;
      const d = Phaser.Math.Distance.Between(u.x, u.y, o.x, o.y);
      if (d <= u.sight && d < bestDist) { bestDist = d; best = o; }
    }
    return best;
  }
}
