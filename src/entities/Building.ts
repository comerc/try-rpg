import Phaser from 'phaser';
import { BUILDING_DEFS, BuildingKind, TEAM_COLOR, Team, TILE, UnitKind } from '../config';
import { Entity } from './Entity';
import { T, unitName } from '../i18n';

export interface TrainOrder {
  kind: UnitKind;
  timeLeft: number;
  total: number;
}

export class Building extends Entity {
  kind: BuildingKind;
  size: number;
  tx: number;
  ty: number;

  buildProgress: number;
  buildTime: number;

  trainQueue: TrainOrder[] = [];
  rallyPoint: { x: number; y: number } | null = null;

  acceptsResources: boolean;
  foodProvided: number;

  attack: number;
  range: number;
  attackCooldown: number;
  sight: number;
  private lastAttackAt = 0;

  private rallyPointGraphic: Phaser.GameObjects.Graphics | null = null;
  private rallyPointPulse = 0;
  private smokeTimer = 0;
  private facadeGraphic: Phaser.GameObjects.Graphics;
  private ambientFxTimer = 0;

  constructor(
    scene: Phaser.Scene, tx: number, ty: number, team: Team, kind: BuildingKind,
    startBuilt: boolean,
  ) {
    const def = BUILDING_DEFS[kind];
    const cx = tx * TILE + (def.size * TILE) / 2;
    const cy = ty * TILE + (def.size * TILE) / 2;
    super(scene, cx, cy, team, def.maxHp, `bld-${kind}-${team}-d`);
    this.kind = kind;
    this.size = def.size;
    this.tx = tx; this.ty = ty;
    this.buildTime = def.buildTime;
    this.buildProgress = startBuilt ? def.buildTime : 0;
    this.radius = (def.size * TILE) / 2 - 2;
    this.acceptsResources = def.acceptsResources ?? false;
    this.foodProvided = def.provides?.food ?? 0;
    this.attack = def.attack ?? 0;
    this.range = def.range ?? 0;
    this.attackCooldown = def.attackCooldown ?? 1500;
    this.sight = def.sight;
    this.redrawBaseDecor();
    this.shadow.clear();
    this.facadeGraphic = scene.add.graphics();
    this.addAt(this.facadeGraphic, 4);
    this.sprite.setDisplaySize(def.size * TILE, def.size * TILE);
    this.hp = startBuilt ? def.maxHp : Math.max(1, Math.floor(def.maxHp * 0.1));
    this.updateHpBar();
    if (!startBuilt) this.sprite.setAlpha(0.5);
    this.redrawFacadeDetails();
  }

  setRallyPoint(x: number, y: number) {
    this.rallyPoint = { x, y };
  }

  progressBuild(deltaMs: number) {
    if (this.buildProgress >= this.buildTime) return;
    const wasBuilt = this.isBuilt();
    this.buildProgress = Math.min(this.buildTime, this.buildProgress + deltaMs);
    const ratio = this.buildProgress / this.buildTime;
    this.sprite.setAlpha(0.5 + 0.5 * ratio);
    const def = BUILDING_DEFS[this.kind];
    this.hp = Math.max(this.hp, Math.floor(def.maxHp * ratio));
    this.maxHp = def.maxHp;
    this.updateHpBar();
    if (!wasBuilt && this.isBuilt()) {
      const snd = (this.scene as any).sound2;
      if (snd) snd.play('build');
      const vfx = (this.scene as any).vfx;
      if (vfx) {
        vfx.spawnRingWave(this.x, this.y, 5, this.radius + 15, 0.5, TEAM_COLOR[this.team], 2.5);
        vfx.spawnSparks(this.x, this.y, TEAM_COLOR[this.team], 8);
      }
    }
  }

  isBuilt(): boolean {
    return this.buildProgress >= this.buildTime;
  }

  enqueue(kind: UnitKind) {
    const def = BUILDING_DEFS[this.kind];
    if (!def.trains?.includes(kind)) return false;
    if (this.trainQueue.length >= 5) return false;
    this.trainQueue.push({ kind, timeLeft: 0, total: 0 });
    this.scene.events.emit('train:enqueued', this, kind);
    return true;
  }

  applyTrainTime(kind: UnitKind, timeMs: number) {
    const order = this.trainQueue.find((o) => o.kind === kind && o.total === 0);
    if (order) { order.timeLeft = timeMs; order.total = timeMs; }
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    this.updateSelectionPulse(delta);
    this.updateFlash(delta);
    this.updateRallyPointGraphic(delta);
    this.updateSmokeWhenDamaged(delta);
    this.redrawFacadeDetails();
    this.updateAmbientBuildingFx(delta);
    this.refreshDepth();
    if (!this.isBuilt()) return;

    if (this.attack > 0 && this.range > 0) this.tickTowerAttack(time);

    if (this.trainQueue.length > 0) {
      const order = this.trainQueue[0];
      if (order.total > 0) {
        order.timeLeft -= delta;
        if (order.timeLeft <= 0) {
          const finished = this.trainQueue.shift()!;
          this.scene.events.emit('train:completed', this, finished.kind);
          const notif = (this.scene as any).notifications;
          if (notif && this.team === 'player') notif.add(`${unitName(finished.kind)} ${T.trainedNotif}`, '#60a5fa');
        }
      }
    }
  }

  private updateSmokeWhenDamaged(delta: number) {
    if (this.hp >= this.maxHp * 0.7 || this.dead) return;
    this.smokeTimer += delta;
    const interval = this.hp < this.maxHp * 0.3 ? 400 : 800;
    if (this.smokeTimer >= interval) {
      this.smokeTimer = 0;
      const vfx = (this.scene as any).vfx;
      if (vfx) {
        const color = this.hp < this.maxHp * 0.3 ? 0x444444 : 0x888888;
        vfx.spawnSmokePlume?.(this.x + (Math.random() - 0.5) * this.radius * 0.7, this.y - this.radius * 0.45, this.hp < this.maxHp * 0.3 ? 4 : 2, this.hp < this.maxHp * 0.3 ? 1.1 : 0.8);
        vfx.spawnSparks(this.x + (Math.random() - 0.5) * this.radius, this.y - this.radius * 0.5, color, 2);
      }
    }
  }

  private tickTowerAttack(time: number) {
    if (time - this.lastAttackAt < this.attackCooldown) return;
    const ents = ((this.scene as any).entities ?? []) as Entity[];
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of ents) {
      if (e.dead) continue;
      if ((e as any).team === undefined || (e as any).team === this.team) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y) - ((e as any).radius ?? 12);
      if (d <= this.range && d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      this.lastAttackAt = time;
      const vfx = (this.scene as any).vfx;
      const dx = best.x - this.x;
      const dy = best.y - this.y;
      const angle = Math.atan2(dy, dx);
      if (vfx) {
        vfx.spawnProjectile(this.x, this.y - 12, best.x, best.y, 0xffaa33, 0xff6622);
        vfx.spawnMuzzleFlash(this.x, this.y - 12, angle);
      }
      const target = best;
      this.scene.time.delayedCall(160, () => {
        if (!target.dead) {
          target.takeDamage(this.attack);
          if (vfx) vfx.spawnImpact(target.x, target.y, 0xffaa33, true);
        }
      });
    }
  }

  currentProgress(): number {
    const o = this.trainQueue[0];
    if (!o || o.total <= 0) return 0;
    return 1 - o.timeLeft / o.total;
  }

  buildRatio(): number {
    return Phaser.Math.Clamp(this.buildProgress / this.buildTime, 0, 1);
  }

  private redrawFacadeDetails() {
    this.facadeGraphic.clear();
  }

  private updateAmbientBuildingFx(delta: number) {
    if (!this.isBuilt() || this.dead || this.hp < this.maxHp * 0.45) {
      this.ambientFxTimer = 0;
      return;
    }
    this.ambientFxTimer += delta;
    if (this.ambientFxTimer < 520 + Math.random() * 520) return;
    this.ambientFxTimer = 0;
    const vfx = (this.scene as any).vfx;
    if (!vfx) return;

    if (this.kind === 'townhall') {
      if (Math.random() > 0.35) vfx.spawnEmber(this.x + (Math.random() - 0.5) * 22, this.y - this.radius * 0.48, 0xfacc15, 0.7);
      else vfx.spawnAmbientMote(this.x + (Math.random() - 0.5) * 30, this.y - this.radius * 0.32, TEAM_COLOR[this.team], 0.75);
    } else if (this.kind === 'barracks') {
      if (Math.random() > 0.5) vfx.spawnEmber(this.x + (Math.random() - 0.5) * 26, this.y - this.radius * 0.22, 0xf97316, 0.8);
      else vfx.spawnAmbientMote(this.x + (Math.random() - 0.5) * 18, this.y - this.radius * 0.18, TEAM_COLOR[this.team], 0.65);
    } else if (this.kind === 'farm') {
      if (Math.random() > 0.55) vfx.spawnAmbientMote(this.x + (Math.random() - 0.5) * 20, this.y - this.radius * 0.1, 0xfef3c7, 0.6);
      else vfx.spawnDustCloud(this.x + (Math.random() - 0.5) * 18, this.y + this.radius * 0.2, 1);
    } else if (this.kind === 'tower') {
      if (Math.random() > 0.45) vfx.spawnAmbientMote(this.x + (Math.random() - 0.5) * 10, this.y - this.radius * 0.7, TEAM_COLOR[this.team], 0.7);
      else vfx.spawnEmber(this.x + (Math.random() - 0.5) * 8, this.y - this.radius * 0.55, 0xfacc15, 0.65);
    }
  }

  private updateRallyPointGraphic(delta: number) {
    if (!this.rallyPoint || !this.selected) {
      if (this.rallyPointGraphic) {
        this.rallyPointGraphic.destroy();
        this.rallyPointGraphic = null;
      }
      return;
    }
    this.rallyPointPulse += delta / 1000;
    if (!this.rallyPointGraphic) {
      this.rallyPointGraphic = this.scene.add.graphics().setDepth(8000);
    }
    this.rallyPointGraphic.clear();
    const alpha = 0.5 + Math.sin(this.rallyPointPulse * 3) * 0.3;
    this.rallyPointGraphic.fillStyle(0x00ff00, 0.25);
    this.rallyPointGraphic.fillCircle(this.rallyPoint.x, this.rallyPoint.y, 7);
    this.rallyPointGraphic.lineStyle(2, 0x00ff00, alpha);
    this.rallyPointGraphic.strokeCircle(this.rallyPoint.x, this.rallyPoint.y, 7);
    this.rallyPointGraphic.lineStyle(1.5, 0x00ff00, alpha * 0.4);
    this.rallyPointGraphic.lineBetween(this.x, this.y, this.rallyPoint.x, this.rallyPoint.y);
    this.rallyPointGraphic.fillStyle(0x00ff00, alpha * 0.6);
    this.rallyPointGraphic.fillCircle(this.rallyPoint.x, this.rallyPoint.y, 2);
  }

  die() {
    if (this.dead) return;
    const map = (this.scene as any).map;
    const path = (this.scene as any).path;
    if (map) {
      for (let dy = 0; dy < this.size; dy++) {
        for (let dx = 0; dx < this.size; dx++) {
          map.setBlocked(this.tx + dx, this.ty + dy, false);
        }
      }
      path?.markDirty?.();
    }
    const vfx = (this.scene as any).vfx;
    if (vfx) {
      vfx.spawnFireBurst(this.x, this.y, 12);
      vfx.spawnDustCloud(this.x, this.y, 10);
      vfx.spawnSmokePlume?.(this.x, this.y - this.radius * 0.25, 12, 1.5);
      vfx.shake(6, 200);
    }
    super.die();
  }

  destroy(fromScene?: boolean) {
    this.rallyPointGraphic?.destroy();
    this.rallyPointGraphic = null;
    this.facadeGraphic?.destroy();
    super.destroy(fromScene);
  }
}
