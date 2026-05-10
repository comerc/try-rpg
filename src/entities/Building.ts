import Phaser from 'phaser';
import {
  BUILDING_DEFS,
  BuildingKind,
  BuildingUpgradeDef,
  TEAM_COLOR,
  Team,
  TILE,
  UnitKind,
  buildingAvailableTrains,
  buildingRuntimeStats,
  nextBuildingUpgrade,
} from '../config';
import { Entity } from './Entity';
import { T, unitName } from '../i18n';
import { buildingImageFit } from '../assets/VisualMetrics';
import { BUILDING_CONSTRUCTION_FRAME_COUNT, BUILDING_DESTRUCTION_FRAME_COUNT, BUILDING_SURFACE_FRAME_COUNT } from '../assets/AssetManifest';

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
  level = 1;

  trainQueue: TrainOrder[] = [];
  rallyPoint: { x: number; y: number } | null = null;
  deploymentPoint: { x: number; y: number } | null = null;
  upgradeTimeLeft = 0;
  upgradeTimeTotal = 0;
  private upgradeTargetLevel = 1;

  acceptsResources: boolean;
  foodProvided: number;

  attack: number;
  range: number;
  attackCooldown: number;
  sight: number;
  private lastAttackAt = 0;

  private rallyPointGraphic: Phaser.GameObjects.Graphics | null = null;
  private deploymentPointGraphic: Phaser.GameObjects.Graphics | null = null;
  private rallyPointPulse = 0;
  private deploymentPointPulse = 0;
  private smokeTimer = 0;
  private facadeGraphic: Phaser.GameObjects.Graphics;
  private selectionBeacon: Phaser.GameObjects.Graphics;
  private surfaceOverlay: Phaser.GameObjects.Image;
  private facadeSeed = Math.random() * Math.PI * 2;
  private ambientFxTimer = 0;
  private facadeRedrawTimer = 0;
  private lastSurfaceKey = '';

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
    this.foodProvided = 0;
    this.attack = 0;
    this.range = 0;
    this.attackCooldown = 1500;
    this.sight = 0;
    this.redrawBaseDecor();
    this.surfaceOverlay = scene.add.image(0, 0, this.sprite.texture.key);
    this.surfaceOverlay.setVisible(false);
    this.addAt(this.surfaceOverlay, 6);
    this.facadeGraphic = scene.add.graphics();
    this.addAt(this.facadeGraphic, 4);
    this.selectionBeacon = scene.add.graphics();
    this.selectionBeacon.setVisible(false);
    this.add(this.selectionBeacon);
    this.bringToTop(this.hpBg);
    this.bringToTop(this.hpFg);
    this.applyLevelStats(false);
    this.hp = startBuilt ? this.maxHp : Math.max(1, Math.floor(this.maxHp * 0.1));
    this.updateHpBar();
    this.updateBuildingSurface();
    this.redrawFacadeDetails(0);
  }

  protected redrawShadow() {
    this.shadow.clear();
  }

  protected redrawTeamRing(_ringRadius: number) {
    this.teamRing.clear();
  }

  setRallyPoint(x: number, y: number) {
    this.rallyPoint = { x, y };
  }

  setDeploymentPoint(x: number, y: number) {
    this.deploymentPoint = { x, y };
  }

  progressBuild(deltaMs: number) {
    if (this.buildProgress >= this.buildTime) return;
    const wasBuilt = this.isBuilt();
    this.buildProgress = Math.min(this.buildTime, this.buildProgress + deltaMs);
    const def = buildingRuntimeStats(this.kind, this.level);
    const ratio = this.buildProgress / this.buildTime;
    this.hp = Math.max(this.hp, Math.floor(def.maxHp * ratio));
    this.maxHp = def.maxHp;
    this.updateHpBar();
    this.updateBuildingSurface();
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
    if (!this.availableTrainKinds().includes(kind)) return false;
    if (this.trainQueue.length >= 5) return false;
    this.trainQueue.push({ kind, timeLeft: 0, total: 0 });
    this.scene.events.emit('train:enqueued', this, kind);
    return true;
  }

  applyTrainTime(kind: UnitKind, timeMs: number) {
    const order = this.trainQueue.find((o) => o.kind === kind && o.total === 0);
    if (order) { order.timeLeft = timeMs; order.total = timeMs; }
  }

  availableTrainKinds(): UnitKind[] {
    return buildingAvailableTrains(this.kind, this.level);
  }

  trainTimeMultiplier(): number {
    return buildingRuntimeStats(this.kind, this.level).trainTimeMultiplier;
  }

  nextUpgradeDef(): BuildingUpgradeDef | null {
    return nextBuildingUpgrade(this.kind, this.level);
  }

  canUpgrade(): boolean {
    return this.isBuilt() && !this.isUpgrading() && this.nextUpgradeDef() !== null;
  }

  isUpgrading(): boolean {
    return this.upgradeTimeLeft > 0 && this.upgradeTimeTotal > 0;
  }

  startUpgrade(): boolean {
    const upgrade = this.nextUpgradeDef();
    if (!upgrade || !this.isBuilt() || this.isUpgrading()) return false;
    this.upgradeTargetLevel = upgrade.level;
    this.upgradeTimeLeft = upgrade.time;
    this.upgradeTimeTotal = upgrade.time;
    this.scene.events.emit('building:upgrade-started', this, upgrade);
    return true;
  }

  upgradeProgress(): number {
    if (!this.isUpgrading()) return 0;
    return 1 - this.upgradeTimeLeft / this.upgradeTimeTotal;
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    this.updateSelectionPulse(delta);
    this.updateFlash(delta);
    this.updateRallyPointGraphic(delta);
    this.updateDeploymentPointGraphic(delta);
    this.updateSmokeWhenDamaged(delta);
    this.facadeRedrawTimer += delta;
    if (this.selected || this.isUpgrading() || !this.isBuilt() || this.facadeRedrawTimer > 360) {
      this.facadeRedrawTimer = 0;
      this.redrawFacadeDetails(time);
      this.redrawSelectionBeacon(time);
    }
    this.updateBuildingSurface(time);
    this.updateAmbientBuildingFx(delta);
    this.refreshDepth();
    if (!this.isBuilt()) return;

    this.tickUpgrade(delta);

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

  private tickUpgrade(delta: number) {
    if (!this.isUpgrading()) return;
    this.upgradeTimeLeft = Math.max(0, this.upgradeTimeLeft - delta);
    if (this.upgradeTimeLeft > 0) return;

    const completedUpgrade = this.nextUpgradeDef();
    this.level = this.upgradeTargetLevel;
    this.upgradeTimeLeft = 0;
    this.upgradeTimeTotal = 0;
    this.applyLevelStats(true);
    this.updateBuildingSurface();
    this.redrawFacadeDetails(this.scene.time.now);
    this.scene.events.emit('building:upgraded', this, completedUpgrade);

    const snd = (this.scene as any).sound2;
    if (snd) snd.play('build');
    const vfx = (this.scene as any).vfx;
    if (vfx) {
      vfx.spawnRingWave(this.x, this.y, 8, this.radius + 24, 0.75, TEAM_COLOR[this.team], 3);
      vfx.spawnSparks(this.x, this.y - this.radius * 0.25, TEAM_COLOR[this.team], 14);
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
        if (!this.scene.scene.isActive() || this.dead || !target.active || target.dead) return;
        target.takeDamage(this.attack);
        if (vfx) vfx.spawnImpact(target.x, target.y, 0xffaa33, true);
      });
    }
  }

  currentProgress(): number {
    const o = this.trainQueue[0];
    if (!o || o.total <= 0) return 0;
    return 1 - o.timeLeft / o.total;
  }

  override setSelected(v: boolean) {
    super.setSelected(v);
    this.selectionBeacon.clear();
    this.selectionBeacon.setVisible(false);
    this.bringToTop(this.hpBg);
    this.bringToTop(this.hpFg);
  }

  buildRatio(): number {
    return Phaser.Math.Clamp(this.buildProgress / this.buildTime, 0, 1);
  }

  private updateBuildingSurface(time = this.scene.time.now) {
    const ratio = this.buildRatio();
    const damage = 1 - this.hp / this.maxHp;
    const upgradePulse = this.isUpgrading()
      ? Math.sin(time / 960 + this.facadeSeed) * 0.01 + this.upgradeProgress() * 0.015
      : 0;
    const baseScale = 1 + (this.level - 1) * 0.035 + upgradePulse;
    let stage: 'foundation' | 'scaffold' | 'shell' | 'ready' | 'damaged';
    if (!this.isBuilt()) {
      stage = ratio < 0.34 ? 'foundation' : ratio < 0.72 ? 'scaffold' : 'shell';
      const alpha = 0.22 + ratio * 0.78;
      const scale = baseScale * (0.88 + ratio * 0.12);
      const tint = ratio < 0.34 ? 0x7c6f58 : ratio < 0.7 ? 0xb59d74 : 0xd8c9a8;
      const frame = Math.min(BUILDING_CONSTRUCTION_FRAME_COUNT - 1, Math.floor(ratio * BUILDING_CONSTRUCTION_FRAME_COUNT));
      this.applySurface(stage, alpha, scale, tint, `bld-${this.kind}-${this.team}-build-${frame}`);
      return;
    }
    stage = damage > 0.32 ? 'damaged' : 'ready';
    const tint = damage > 0.68 ? 0x6f625c : damage > 0.38 ? 0xa89484 : damage > 0.16 ? 0xd0bda5 : 0;
    const frameMs = stage === 'damaged' ? 980 : 860;
    const frame = Math.floor((time + this.facadeSeed * 1000) / frameMs) % BUILDING_SURFACE_FRAME_COUNT;
    const levelTag = this.level > 1 ? '-level2' : '';
    this.applySurface(stage, 1, baseScale, tint, `bld-${this.kind}-${this.team}${levelTag}-${stage}-${frame}`);
  }

  private applySurface(stage: 'foundation' | 'scaffold' | 'shell' | 'ready' | 'damaged', alpha: number, constructionScale: number, tint: number, textureKey?: string) {
    const key = `${stage}:${textureKey ?? ''}:${alpha.toFixed(2)}:${constructionScale.toFixed(2)}:${tint}`;
    if (key === this.lastSurfaceKey) return;
    this.lastSurfaceKey = key;
    this.applyStageTexture(stage, textureKey);
    this.sprite.setAlpha(alpha);
    this.fitBuildingSprite(constructionScale);
    if (tint) this.sprite.setTint(tint);
    else this.sprite.clearTint();
  }

  private fitBuildingSprite(constructionScale = 1) {
    const sourceWidth = (this.sprite.frame as any).realWidth ?? this.sprite.frame.width ?? this.sprite.width;
    const sourceHeight = (this.sprite.frame as any).realHeight ?? this.sprite.frame.height ?? this.sprite.height;
    const fit = buildingImageFit(this.kind, sourceWidth, sourceHeight, constructionScale);
    this.sprite.setScale(fit.scale);
    this.sprite.y = fit.y;
  }

  private applyLevelStats(healAddedHp: boolean) {
    const oldMaxHp = this.maxHp;
    const stats = buildingRuntimeStats(this.kind, this.level);
    this.maxHp = stats.maxHp;
    this.foodProvided = stats.foodProvided;
    this.attack = stats.attack;
    this.range = stats.range;
    this.attackCooldown = stats.attackCooldown;
    this.sight = stats.sight;
    if (healAddedHp && this.maxHp > oldMaxHp) this.hp += this.maxHp - oldMaxHp;
    this.hp = Math.min(this.hp, this.maxHp);
    this.updateHpBar();
  }

  private applyStageTexture(stage: 'foundation' | 'scaffold' | 'shell' | 'ready' | 'damaged', textureKey?: string) {
    const key = `bld-${this.kind}-${this.team}-${stage}`;
    const fallback = `bld-${this.kind}-${this.team}-d`;
    const next = textureKey && this.scene.textures.exists(textureKey)
      ? textureKey
      : this.scene.textures.exists(key) ? key : fallback;
    if (this.sprite.texture.key !== next) this.crossfadeSurfaceTexture(next);
  }

  private crossfadeSurfaceTexture(next: string) {
    const previous = this.sprite.texture.key;
    if (previous && this.scene.textures.exists(previous) && this.isBuilt()) {
      this.surfaceOverlay.setTexture(previous);
      this.surfaceOverlay.setPosition(this.sprite.x, this.sprite.y);
      this.surfaceOverlay.setScale(this.sprite.scaleX, this.sprite.scaleY);
      this.surfaceOverlay.setAlpha(this.sprite.alpha);
      const spriteAny = this.sprite as any;
      if (spriteAny.isTinted) this.surfaceOverlay.setTint(spriteAny.tintTopLeft);
      else this.surfaceOverlay.clearTint();
      this.surfaceOverlay.setVisible(true);
      this.scene.tweens.killTweensOf(this.surfaceOverlay);
      this.scene.tweens.add({
        targets: this.surfaceOverlay,
        alpha: 0,
        duration: 520,
        ease: 'Sine.easeInOut',
        onComplete: () => this.surfaceOverlay.setVisible(false),
      });
    }
    this.sprite.setTexture(next);
  }

  private redrawFacadeDetails(time: number) {
    const g = this.facadeGraphic;
    g.clear();

    const ratio = this.buildRatio();
    if (ratio < 1) return;

    const w = this.size * TILE;
    const h = this.size * TILE;
    const left = -w / 2;
    const right = w / 2;
    const top = -h / 2;
    const bottom = h / 2;
    const damage = 1 - this.hp / this.maxHp;
    const teamColor = TEAM_COLOR[this.team];
    const teamLight = Phaser.Display.Color.IntegerToColor(teamColor).lighten(22).color;
    const teamDark = Phaser.Display.Color.IntegerToColor(teamColor).darken(28).color;
    const wave = Math.sin(time / 980 + this.facadeSeed);
    const wave2 = Math.cos(time / 1240 + this.facadeSeed * 1.7);
    const shimmer = (Math.sin(time / 1460 + this.facadeSeed * 0.9) + 1) * 0.5;
    const glintAlpha = 0.08 + shimmer * 0.18;
    const bannerAlpha = 0.5 + ratio * 0.5;
    const upgradeAlpha = Phaser.Math.Clamp(this.level > 1 ? 1 : this.upgradeProgress(), 0, 1);

    const drawFlag = (poleX: number, poleY: number, width: number, height: number, side: 1 | -1) => {
      const clothTip = poleX + side * (width + wave * 1.8);
      const clothTail = clothTip + side * (2.2 + wave2 * 0.9);
      g.fillStyle(0x2a1a0e, 0.95).fillRect(poleX - 0.8, poleY - height * 0.9, 1.6, height + 1);
      g.fillStyle(teamColor, bannerAlpha).fillTriangle(poleX, poleY - height, clothTip, poleY - height * 0.78, poleX, poleY - height * 0.45);
      g.fillStyle(teamLight, bannerAlpha * 0.55).fillTriangle(poleX, poleY - height, poleX + side * (width * 0.55), poleY - height * 0.86, poleX, poleY - height * 0.58);
      g.fillStyle(teamDark, bannerAlpha * 0.78).fillTriangle(poleX, poleY - height * 0.45, clothTip, poleY - height * 0.78, clothTail, poleY - height * 0.6);
      g.fillStyle(teamDark, bannerAlpha * 0.65).fillRect(Math.min(poleX, clothTip), poleY - height * 0.46, Math.abs(clothTip - poleX), 0.9);
      g.fillStyle(0xffffff, glintAlpha * 0.85).fillCircle(poleX + side * (width * (0.3 + shimmer * 0.35)), poleY - height * 0.76, 0.5);
      g.fillStyle(0xfacc15, bannerAlpha).fillCircle(poleX, poleY - height - 1.4, 1.1);
    };

    if (ratio > 0.28) {
      if (this.kind === 'tower') {
        drawFlag(0, top + 12, 11, 14, 1);
        drawFlag(-6, top + 20, 8, 10, -1);
      } else if (this.kind === 'farm') {
        drawFlag(w * 0.12, top + 18, 7, 9, 1);
      } else {
        drawFlag(-w * 0.2, top + 20, 10, 12, -1);
        drawFlag(w * 0.16, top + 14, 12, 15, 1);
      }
    }

    if (ratio > 0.55) {
      if (this.kind === 'townhall') {
        g.fillStyle(teamColor, 0.18).fillRoundedRect(left + 10, top + 18, w - 20, 7, 2);
        g.fillStyle(teamLight, 0.16).fillRoundedRect(left + 11, top + 18, w * 0.22, 3, 1.5);
        for (const side of [-1, 1] as const) {
          const pennantX = side * (w * 0.32);
          g.fillStyle(teamDark, 0.92).fillRect(pennantX - 0.5, top + 22, 1, 12);
          g.fillStyle(teamColor, 0.86).fillTriangle(pennantX, top + 23, pennantX + side * (7 + wave * 1.1), top + 26, pennantX, top + 31 + wave2 * 0.7);
          g.fillStyle(teamLight, 0.54).fillTriangle(pennantX, top + 23.5, pennantX + side * (4.5 + wave * 0.6), top + 26.5, pennantX, top + 28.5 + wave2 * 0.4);
        }
        for (const x of [-w * 0.22, w * 0.22]) {
          g.fillStyle(teamDark, 0.95).fillRoundedRect(x - 4.6, -h * 0.02, 9.2, 12, 2);
          g.fillStyle(teamColor, 0.95).fillCircle(x, h * 0.03, 2.7);
          g.fillStyle(teamLight, 0.8).fillCircle(x - 0.8, h * 0.01, 0.85);
          g.fillStyle(0xffffff, glintAlpha).fillCircle(x + shimmer * 0.7 - 0.35, h * 0.03 - 0.55, 0.45);
        }
      } else if (this.kind === 'barracks') {
        for (const x of [-w * 0.23, w * 0.23]) {
          g.fillStyle(teamDark, 0.92).fillRoundedRect(x - 4.8, -1, 9.6, 11, 2);
          g.fillStyle(teamColor, 0.95).fillTriangle(x, 1.2, x + 2.8, 5.8, x, 10);
          g.fillStyle(teamLight, 0.72).fillTriangle(x, 1.2, x + 1.55, 4.2, x, 7.2);
          g.lineStyle(1.1, 0xf8fafc, 0.75);
          g.lineBetween(x - 1.8, 4.2, x + 1.8, 7.4);
          g.lineBetween(x + 1.8, 4.2, x - 1.8, 7.4);
          g.fillStyle(0xffffff, glintAlpha).fillRect(x - 0.2, 2 + shimmer * 3.2, 0.45, 1.25);
        }
        for (const side of [-1, 1] as const) {
          const ribbonX = side * (w * 0.34);
          g.fillStyle(teamColor, 0.82).fillTriangle(ribbonX, top + 25, ribbonX + side * (6 + wave), top + 28, ribbonX, top + 33 + wave2 * 0.6);
          g.fillStyle(teamLight, 0.5).fillTriangle(ribbonX, top + 25.5, ribbonX + side * (3.8 + wave * 0.5), top + 28.2, ribbonX, top + 30.5 + wave2 * 0.35);
        }
      } else if (this.kind === 'farm') {
        g.fillStyle(teamColor, 0.84).fillRect(w * 0.23, h * 0.1, 10, 2.3);
        g.fillStyle(teamLight, 0.68).fillRect(w * 0.23, h * 0.1, 5.5, 0.8);
        g.fillStyle(teamDark, 0.8).fillTriangle(w * 0.23, h * 0.1, w * 0.3, h * 0.18, w * 0.23, h * 0.23);
        g.fillStyle(teamColor, 0.84).fillTriangle(w * 0.33, h * 0.08, w * 0.42 + wave * 0.8, h * 0.11, w * 0.33, h * 0.17 + wave2 * 0.5);
        g.fillStyle(teamLight, glintAlpha * 1.3).fillCircle(w * 0.26 + shimmer * 1.2, h * 0.12, 0.35);
      } else if (this.kind === 'tower') {
        g.fillStyle(teamColor, 0.22).fillRoundedRect(-5.5, top + 17, 11, 5, 2);
        g.fillStyle(teamLight, 0.78).fillCircle(0, top + 19.7, 1.4);
        g.fillStyle(teamDark, 0.88).fillRect(-0.35, top + 18.2, 0.7, 3.2);
        g.fillStyle(teamDark, 0.88).fillRect(-1.6, top + 19.3, 3.2, 0.7);
        g.fillStyle(0xffffff, glintAlpha * 1.2).fillCircle(shimmer * 1.6 - 0.8, top + 19.15, 0.45);
        g.fillStyle(teamColor, 0.8).fillTriangle(4, top + 21, 9 + wave, top + 22.6, 4, top + 26 + wave2 * 0.4);
        g.fillStyle(teamLight, 0.52).fillTriangle(4, top + 21.2, 6.8 + wave * 0.45, top + 22.4, 4, top + 24.2 + wave2 * 0.3);
      }
    }

    if (ratio > 0.9 && damage < 0.4) {
      if (this.kind === 'townhall' || this.kind === 'barracks') {
        g.fillStyle(0xffffff, glintAlpha * 0.85).fillEllipse(-w * 0.2 + shimmer * 2.5, -h * 0.07, 1.8, 0.7);
        g.fillStyle(0xffffff, glintAlpha * 0.7).fillEllipse(w * 0.16 - shimmer * 2.1, -h * 0.02, 1.5, 0.6);
      } else if (this.kind === 'tower') {
        g.fillStyle(0xffffff, glintAlpha * 0.9).fillEllipse(0, -h * 0.16 + shimmer * 1.2, 1.6, 0.55);
      }
    }

    if (upgradeAlpha > 0) {
      const gold = 0xfacc15;
      const goldDark = 0xa16207;
      const pulse = 0.45 + Math.sin(time / 1180 + this.facadeSeed) * 0.18;

      if (this.kind === 'barracks') {
        g.fillStyle(goldDark, upgradeAlpha * 0.9).fillRoundedRect(-w * 0.08, top + h * 0.17, w * 0.16, h * 0.08, 2);
        g.fillStyle(gold, upgradeAlpha * 0.9).fillTriangle(0, top + h * 0.12, -w * 0.12, top + h * 0.23, w * 0.12, top + h * 0.23);
        g.lineStyle(1.2, 0xfffbeb, upgradeAlpha * 0.55);
        g.lineBetween(-w * 0.07, top + h * 0.22, w * 0.07, top + h * 0.22);
      } else if (this.kind === 'farm') {
        for (const x of [-w * 0.22, 0, w * 0.22]) {
          g.fillStyle(0xfef08a, upgradeAlpha * (0.42 + pulse * 0.18));
          g.fillEllipse(x, h * 0.25, w * 0.09, h * 0.05);
        }
      } else if (this.kind === 'tower') {
        g.fillStyle(gold, upgradeAlpha * 0.78).fillCircle(0, top + h * 0.16, 4.2);
        g.fillStyle(0xfffbeb, upgradeAlpha * 0.6).fillCircle(-1.1, top + h * 0.145, 1.3);
      } else if (this.kind === 'townhall') {
        g.fillStyle(goldDark, upgradeAlpha * 0.82).fillRoundedRect(-w * 0.18, top + h * 0.16, w * 0.36, h * 0.055, 2);
        g.fillStyle(gold, upgradeAlpha * 0.85).fillRect(-w * 0.16, top + h * 0.17, w * 0.32, 2.2);
      }
    }

    if (damage > 0.12) {
      const crackColor = damage > 0.45 ? 0x22110a : 0x2e1a0f;
      g.lineStyle(1.6, crackColor, 0.28 + damage * 0.42);
      g.beginPath();
      g.moveTo(left + w * 0.2, top + h * 0.28);
      g.lineTo(left + w * 0.35, top + h * 0.44);
      g.lineTo(left + w * 0.28, top + h * 0.56);
      g.lineTo(left + w * 0.4, top + h * 0.72);
      g.strokePath();

      g.beginPath();
      g.moveTo(right - w * 0.22, top + h * 0.18);
      g.lineTo(right - w * 0.3, top + h * 0.34);
      g.lineTo(right - w * 0.24, top + h * 0.5);
      g.lineTo(right - w * 0.34, top + h * 0.66);
      g.strokePath();

      g.fillStyle(0x000000, 0.08 + damage * 0.16);
      g.fillEllipse(-w * 0.16, -h * 0.05, w * 0.18, h * 0.12);
      g.fillEllipse(w * 0.2, h * 0.02, w * 0.14, h * 0.1);
      if (damage > 0.3) {
        g.fillStyle(0x15110d, 0.1 + damage * 0.2);
        g.fillRect(left + w * 0.18, top + h * 0.68, w * 0.64, h * 0.08);
        g.lineStyle(2.6, 0x1f160f, 0.2 + damage * 0.28);
        g.lineBetween(left + w * 0.12, top + h * 0.78, right - w * 0.16, top + h * 0.72);
      }
    }

    if (damage > 0.45) {
      const ember = 0.55 + Math.sin(time / 120 + this.facadeSeed * 1.7) * 0.2;
      const emberY = this.kind === 'tower' ? top + h * 0.1 : top + h * 0.18;
      g.fillStyle(0xf97316, ember * 0.28).fillEllipse(-w * 0.1, emberY + 6, 7, 4);
      g.fillStyle(0xfacc15, ember * 0.6).fillCircle(-w * 0.1, emberY + 5.2, 1.4);
      g.fillStyle(0xfffbeb, ember * 0.7).fillCircle(-w * 0.32, top + h * 0.34, 0.7);
      g.fillStyle(0xfffbeb, ember * 0.6).fillCircle(w * 0.18, top + h * 0.48, 0.6);
    }
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

  private redrawSelectionBeacon(time: number) {
    void time;
    this.selectionBeacon.clear();
    this.selectionBeacon.setVisible(false);
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

  private updateDeploymentPointGraphic(delta: number) {
    if (this.kind !== 'barracks' || !this.deploymentPoint || !this.selected) {
      if (this.deploymentPointGraphic) {
        this.deploymentPointGraphic.destroy();
        this.deploymentPointGraphic = null;
      }
      return;
    }
    this.deploymentPointPulse += delta / 1000;
    if (!this.deploymentPointGraphic) {
      this.deploymentPointGraphic = this.scene.add.graphics().setDepth(8001);
    }
    const p = this.deploymentPoint;
    const alpha = 0.52 + Math.sin(this.deploymentPointPulse * 2.2) * 0.2;
    this.deploymentPointGraphic.clear();
    this.deploymentPointGraphic.fillStyle(0xfacc15, 0.16);
    this.deploymentPointGraphic.fillCircle(p.x, p.y, 13);
    this.deploymentPointGraphic.lineStyle(2.2, 0xfacc15, alpha);
    this.deploymentPointGraphic.strokeCircle(p.x, p.y, 13);
    this.deploymentPointGraphic.lineStyle(1.2, 0xfffbeb, alpha * 0.45);
    this.deploymentPointGraphic.lineBetween(this.x, this.y + this.radius * 0.38, p.x, p.y);
    this.deploymentPointGraphic.fillStyle(0xfffbeb, alpha);
    this.deploymentPointGraphic.fillTriangle(p.x, p.y - 5, p.x + 5, p.y + 3, p.x - 5, p.y + 3);
  }

  die() {
    if (this.dead) return;
    this.rallyPointGraphic?.destroy();
    this.rallyPointGraphic = null;
    this.deploymentPointGraphic?.destroy();
    this.deploymentPointGraphic = null;
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
    if (!this.spawnDestructionAnimation()) this.spawnRubble();
    super.die();
  }

  private spawnDestructionAnimation(): boolean {
    const keys = Array.from({ length: BUILDING_DESTRUCTION_FRAME_COUNT }, (_, i) => `bld-${this.kind}-${this.team}-destroy-${i}`);
    if (!keys.every((key) => this.scene.textures.exists(key))) return false;

    const scene = this.scene;
    const { x, y, kind, team, size } = this;
    const img = scene.add.image(x, y, keys[0]).setDepth(y - 0.5);
    const sourceWidth = (img.frame as any).realWidth ?? img.frame.width ?? img.width;
    const sourceHeight = (img.frame as any).realHeight ?? img.frame.height ?? img.height;
    const fit = buildingImageFit(kind, sourceWidth, sourceHeight);
    img.setScale(fit.scale);
    img.y = y + fit.y;

    let frame = 0;
    scene.time.addEvent({
      delay: 90,
      repeat: BUILDING_DESTRUCTION_FRAME_COUNT - 2,
      callback: () => {
        frame += 1;
        img.setTexture(keys[frame]);
      },
    });
    scene.time.delayedCall(90 * BUILDING_DESTRUCTION_FRAME_COUNT, () => {
      img.destroy();
      this.spawnRubble(scene, x, y, kind, team, size);
    });
    return true;
  }

  private spawnRubble(
    scene = this.scene,
    x = this.x,
    y = this.y,
    kind = this.kind,
    team = this.team,
    size = this.size,
  ) {
    const ruinsKey = `bld-${kind}-${team}-ruins`;
    if (scene.textures.exists(ruinsKey)) {
      const img = scene.add.image(x, y, ruinsKey).setDepth(y - 1);
      const sourceWidth = (img.frame as any).realWidth ?? img.frame.width ?? img.width;
      const sourceHeight = (img.frame as any).realHeight ?? img.frame.height ?? img.height;
      const fit = buildingImageFit(kind, sourceWidth, sourceHeight);
      img.setScale(fit.scale);
      img.y = y + fit.y;
      img.setAlpha(0.96);
      scene.tweens.add({
        targets: img,
        alpha: 0,
        delay: 14000,
        duration: 2500,
        onComplete: () => img.destroy(),
      });
      return;
    }

    const rubble = scene.add.graphics().setDepth(y - 1);
    const w = size * TILE;
    const h = size * TILE;
    const baseY = y + h * 0.22;
    rubble.fillStyle(0x000000, 0.32).fillEllipse(x, baseY, w * 0.92, h * 0.28);
    rubble.fillStyle(0x4a3a2b, 0.9).fillEllipse(x, baseY - 4, w * 0.72, h * 0.18);
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * w * 0.36;
      const px = x + Math.cos(a) * d;
      const py = baseY + Math.sin(a) * d * 0.32 - Math.random() * 10;
      const color = i % 5 === 0 ? TEAM_COLOR[team] : i % 3 === 0 ? 0x8b7358 : 0x5f5247;
      rubble.fillStyle(color, i % 5 === 0 ? 0.7 : 0.88);
      rubble.fillRoundedRect(px - 3, py - 2, 5 + Math.random() * 9, 3 + Math.random() * 6, 1.5);
    }
    rubble.lineStyle(1.2, 0xc7b299, 0.24).strokeEllipse(x, baseY - 4, w * 0.68, h * 0.16);
    scene.tweens.add({
      targets: rubble,
      alpha: 0,
      delay: 12000,
      duration: 2500,
      onComplete: () => rubble.destroy(),
    });
  }

  destroy(fromScene?: boolean) {
    this.rallyPointGraphic?.destroy();
    this.rallyPointGraphic = null;
    this.facadeGraphic?.destroy();
    this.selectionBeacon?.destroy();
    super.destroy(fromScene);
  }
}
