import Phaser from 'phaser';
import { BUILDING_DEFS, Team, TILE } from '../config';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/Resource';
import { EconomySystem } from './EconomySystem';
import { CommandSystem } from './CommandSystem';
import { GameMap } from '../world/GameMap';

export class AIController {
  private nextTick = 0;
  private nextAttack = 25000;
  private attackWaveSize = 3;
  private team: Team = 'enemy';
  private barracksCount = 0;
  private farmCount = 0;
  private towerCount = 0;
  private lastDefendCheck = 0;
  private lastHarass = 0;

  constructor(
    private scene: Phaser.Scene,
    private map: GameMap,
    private eco: EconomySystem,
    private cmd: CommandSystem,
    private getEntities: () => Entity[],
    private spawnBuilding: (tx: number, ty: number, kind: 'townhall' | 'barracks' | 'farm' | 'tower', team: Team, built: boolean) => Building | null,
  ) {}

  update(time: number, _delta: number) {
    if (time < this.nextTick) return;
    this.nextTick = time + 800;

    const myTH = this.findOwn('townhall');
    if (!myTH || myTH.dead) return;

    this.barracksCount = this.ownBuildings('barracks').length;
    this.farmCount = this.ownBuildings('farm').length;
    this.towerCount = this.ownBuildings('tower').length;

    this.tickEconomy();
    this.tickDefense(time);
    this.tickMilitary();
    this.tickHarass(time);
    this.tickAttack(time);
  }

  private tickEconomy() {
    const peasants = this.ownUnits('peasant');
    const goldMiners = peasants.filter(p => p.fsm.kind === 'gathering' && p.fsm.resource.kind === 'goldmine');
    const lumberjacks = peasants.filter(p => p.fsm.kind === 'gathering' && p.fsm.resource.kind === 'tree');

    const myTH = this.findOwn('townhall')!;
    const desiredPeasants = this.barracksCount >= 2 ? 10 : this.barracksCount >= 1 ? 8 : 6;
    if (peasants.length < desiredPeasants && this.eco.canTrain(this.team, 'peasant')) {
      if (myTH.trainQueue.length < 2) {
        this.scene.events.emit('ai:train', myTH, 'peasant');
      }
    }

    for (const p of peasants) {
      if (p.fsm.kind === 'idle') {
        const needGold = goldMiners.length < lumberjacks.length + 2;
        const res = needGold
          ? (this.findNearestResource(p, 'goldmine') ?? this.findNearestResource(p, 'tree'))
          : (this.findNearestResource(p, 'tree') ?? this.findNearestResource(p, 'goldmine'));
        if (res) this.cmd.gather([p], res);
      }
      // Reassign peasants whose target resource died.
      if (p.fsm.kind === 'gathering' && p.fsm.resource.dead) {
        const res = this.findNearestResource(p, p.fsm.resource.kind);
        if (res) this.cmd.gather([p], res);
      }
    }

    const foodBuffer = this.eco.foodCap(this.team) - this.eco.foodUsed(this.team);
    if (foodBuffer <= 2 && this.eco.canBuild(this.team, 'farm')) {
      this.tryBuild('farm', myTH);
    }
  }

  private tickDefense(time: number) {
    if (time - this.lastDefendCheck < 1500) return;
    this.lastDefendCheck = time;

    const myTH = this.findOwn('townhall')!;
    const enemyNearBase = this.getEntities().filter((e): e is Unit =>
      e instanceof Unit && e.team !== this.team && !e.dead &&
      Phaser.Math.Distance.Between(e.x, e.y, myTH.x, myTH.y) < TILE * 14
    );

    if (enemyNearBase.length > 0) {
      const defenders = this.ownMilitary().filter(u => u.fsm.kind !== 'attacking' || Phaser.Math.Distance.Between(u.x, u.y, myTH.x, myTH.y) < TILE * 20);
      if (defenders.length > 0) {
        this.cmd.attackTarget(defenders, enemyNearBase[0]);
      }
    }
  }

  private tickMilitary() {
    const myTH = this.findOwn('townhall')!;

    if (this.barracksCount === 0 && this.eco.canBuild(this.team, 'barracks')) {
      if (this.ownUnits('peasant').length >= 3) this.tryBuild('barracks', myTH);
    }

    if (this.barracksCount === 1 && this.farmCount >= 2 && this.eco.canBuild(this.team, 'barracks')) {
      this.tryBuild('barracks', myTH);
    }

    if (this.towerCount === 0 && this.barracksCount >= 1 && this.eco.canBuild(this.team, 'tower')) {
      this.tryBuild('tower', myTH);
    }

    for (const b of this.ownBuildings('barracks')) {
      if (!b.isBuilt()) continue;
      if (b.trainQueue.length >= 2) continue;

      const military = this.ownMilitary();
      const footmen = military.filter(u => u.kind === 'footman');
      const archers = military.filter(u => u.kind === 'archer');

      let kind: 'footman' | 'archer' = 'footman';
      if (archers.length < Math.floor((footmen.length + 1) / 2) && this.eco.canTrain(this.team, 'archer')) {
        kind = 'archer';
      }

      if (this.eco.canTrain(this.team, kind)) {
        this.scene.events.emit('ai:train', b, kind);
      } else {
        const altKind = kind === 'footman' ? 'archer' : 'footman';
        if (this.eco.canTrain(this.team, altKind)) {
          this.scene.events.emit('ai:train', b, altKind);
        }
      }
    }
  }

  private tickHarass(time: number) {
    if (time < this.lastHarass + 45000) return;
    const military = this.ownMilitary().filter(u => u.fsm.kind === 'idle');
    if (military.length < 2) return;
    this.lastHarass = time;

    const enemyPeasants = this.getEntities().filter((e): e is Unit =>
      e instanceof Unit && e.team !== this.team && !e.dead && e.kind === 'peasant'
    );
    if (enemyPeasants.length === 0) return;
    const target = enemyPeasants[Math.floor(Math.random() * enemyPeasants.length)];
    const squad = military.slice(0, Math.min(3, military.length));
    this.cmd.attackTarget(squad, target);
  }

  private tickAttack(time: number) {
    if (time < this.nextAttack) return;

    const military = this.ownMilitary().filter(u => u.fsm.kind === 'idle');
    if (military.length >= this.attackWaveSize) {
      this.nextAttack = time + 32000;
      this.attackWaveSize = Math.min(this.attackWaveSize + 2, 12);

      const enemyTH = this.findEnemy('townhall');
      const target: Entity | null = enemyTH ?? this.findAnyEnemyBuilding() ?? this.findNearestEnemyUnit();
      if (target) this.cmd.attackTarget(military, target);
    }
  }

  private tryBuild(kind: 'barracks' | 'farm' | 'tower', nearTH: Building) {
    const def = BUILDING_DEFS[kind];
    for (let r = 4; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = nearTH.tx + dx;
          const ty = nearTH.ty + dy;
          if (!this.map.isRectFree(tx, ty, def.size)) continue;
          if (!this.eco.spend(this.team, def.cost.gold, def.cost.wood)) return;
          const b = this.spawnBuilding(tx, ty, kind, this.team, false);
          if (!b) { this.eco.refund(this.team, def.cost.gold, def.cost.wood); return; }
          const p = this.ownUnits('peasant').find((u) => u.fsm.kind === 'gathering' || u.fsm.kind === 'idle');
          if (p) this.cmd.buildWith(p, b);
          return;
        }
      }
    }
  }

  private ownUnits(kind: 'peasant' | 'footman' | 'archer'): Unit[] {
    return this.getEntities().filter((e): e is Unit =>
      e instanceof Unit && e.team === this.team && !e.dead && e.kind === kind);
  }

  private ownMilitary(): Unit[] {
    return this.getEntities().filter((e): e is Unit =>
      e instanceof Unit && e.team === this.team && !e.dead && e.kind !== 'peasant');
  }

  private ownBuildings(kind: 'townhall' | 'barracks' | 'farm' | 'tower'): Building[] {
    return this.getEntities().filter((e): e is Building =>
      e instanceof Building && e.team === this.team && !e.dead && e.kind === kind);
  }

  private findOwn(kind: 'townhall' | 'barracks' | 'farm' | 'tower'): Building | null {
    return this.ownBuildings(kind)[0] ?? null;
  }

  private findEnemy(kind: 'townhall' | 'barracks' | 'farm' | 'tower'): Building | null {
    return this.getEntities().filter((e): e is Building =>
      e instanceof Building && e.team !== this.team && !e.dead && e.kind === kind)[0] ?? null;
  }

  private findAnyEnemyBuilding(): Building | null {
    return this.getEntities().filter((e): e is Building =>
      e instanceof Building && e.team !== this.team && !e.dead)[0] ?? null;
  }

  private findNearestEnemyUnit(): Unit | null {
    const myTH = this.findOwn('townhall');
    if (!myTH) return null;
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const e of this.getEntities()) {
      if (!(e instanceof Unit) || e.team === this.team || e.dead) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, myTH.x, myTH.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private findNearestResource(u: Unit, kind: 'tree' | 'goldmine'): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestD = Infinity;
    for (const e of this.getEntities()) {
      if (!(e instanceof ResourceNode)) continue;
      if (e.dead) continue;
      if (e.kind !== kind) continue;
      const d = Phaser.Math.Distance.Between(u.x, u.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
}
