import Phaser from 'phaser';
import { Team, FOOD_BASE_CAP, BUILDING_DEFS, UNIT_DEFS, UnitKind, BuildingKind, START_RESOURCES } from '../config';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';

export interface TeamResources {
  gold: number;
  wood: number;
}

export class EconomySystem {
  constructor(
    private scene: Phaser.Scene,
    private getEntities: () => Entity[],
  ) {
    for (const t of ['player', 'enemy'] as Team[]) {
      this.scene.registry.set(`res:${t}`, { gold: START_RESOURCES.gold, wood: START_RESOURCES.wood });
    }
  }

  get(team: Team): TeamResources {
    return this.scene.registry.get(`res:${team}`) ?? { gold: 0, wood: 0 };
  }

  spend(team: Team, gold: number, wood: number): boolean {
    const r = this.get(team);
    if (r.gold < gold || r.wood < wood) return false;
    this.scene.registry.set(`res:${team}`, { gold: r.gold - gold, wood: r.wood - wood });
    return true;
  }

  refund(team: Team, gold: number, wood: number) {
    const r = this.get(team);
    this.scene.registry.set(`res:${team}`, { gold: r.gold + gold, wood: r.wood + wood });
  }

  /** Текущая еда: сумма от зданий + ратуши. */
  foodCap(team: Team): number {
    let cap = FOOD_BASE_CAP;
    for (const e of this.getEntities()) {
      if (e instanceof Building && e.team === team && e.isBuilt()) {
        if (e.kind === 'farm') cap += e.foodProvided;
        else if (e.kind === 'townhall') cap += e.foodProvided;
      }
    }
    return cap;
  }

  foodUsed(team: Team): number {
    let used = 0;
    for (const e of this.getEntities()) {
      if (e instanceof Unit && e.team === team && !e.dead) {
        used += UNIT_DEFS[e.kind].cost.food;
      }
    }
    return used;
  }

  canAfford(team: Team, gold: number, wood: number, food = 0): boolean {
    const r = this.get(team);
    if (r.gold < gold || r.wood < wood) return false;
    if (food > 0 && this.foodUsed(team) + food > this.foodCap(team)) return false;
    return true;
  }

  canTrain(team: Team, kind: UnitKind): boolean {
    const def = UNIT_DEFS[kind];
    return this.canAfford(team, def.cost.gold, def.cost.wood, def.cost.food);
  }

  canBuild(team: Team, kind: BuildingKind): boolean {
    const def = BUILDING_DEFS[kind];
    return this.canAfford(team, def.cost.gold, def.cost.wood, 0);
  }
}
