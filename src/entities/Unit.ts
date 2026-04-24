import Phaser from 'phaser';
import { TEAM_COLOR, Team, TILE, UNIT_DEFS, UnitKind } from '../config';
import { Entity } from './Entity';
import { T } from '../i18n';
import type { PathPoint } from '../world/Pathfinding';
import type { Building } from './Building';
import type { ResourceNode } from './Resource';

export type UnitState =
  | { kind: 'idle' }
  | { kind: 'hold' }
  | { kind: 'moving'; path: PathPoint[]; i: number; final?: boolean }
  | { kind: 'attackMoving'; path: PathPoint[]; i: number }
  | { kind: 'attacking'; target: Entity }
  | { kind: 'gathering'; resource: ResourceNode; returning: boolean; carrying: number; gatherTicker: number }
  | { kind: 'returning'; dropoff: Building; carryKind: 'gold' | 'wood'; carrying: number }
  | { kind: 'building'; target: Building }
  | { kind: 'repair'; target: Building }
  | { kind: 'patrol'; pointA: { x: number; y: number }; pointB: { x: number; y: number }; path: PathPoint[]; i: number; toB: boolean }
  | { kind: 'dead' };

export class Unit extends Entity {
  kind: UnitKind;
  speed: number;
  attack: number;
  armor: number;
  range: number;
  attackCooldown: number;
  sight: number;

  fsm: UnitState = { kind: 'idle' };

  lastAttackAt = 0;
  autoAcquire = true;
  lastOrderPoint: { x: number; y: number } | null = null;
  lastHarvestedNode: ResourceNode | null = null;

  private buildParticleTimer = 0;
  private gatherParticleTimer = 0;
  private bobPhase = Math.random() * Math.PI * 2;
  private facing: 1 | -1 = 1;
  private lastX: number;
  private lastY: number;
  private dustTimer = 0;
  private attackAnimTimer = 0;
  private accentGraphic: Phaser.GameObjects.Graphics;
  private actionGraphic: Phaser.GameObjects.Graphics;
  private accentSeed = Math.random() * Math.PI * 2;
  private visualScale = 1;
  private poseScaleX = 1;
  private poseScaleY = 1;
  private poseRotation = 0;
  private motionAngle = Math.PI / 2;
  private motionIntensity = 0;
  private idleFxTimer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, team: Team, kind: UnitKind) {
    const def = UNIT_DEFS[kind];
    super(scene, x, y, team, def.maxHp, `unit-${kind}-${team}-d`);
    this.kind = kind;
    this.speed = def.speed;
    this.attack = def.attack;
    this.armor = def.armor;
    this.range = def.range;
    this.attackCooldown = def.attackCooldown;
    this.sight = def.sight;
    this.radius = kind === 'footman' ? TILE * 0.42 : kind === 'archer' ? TILE * 0.38 : TILE * 0.36;
    this.visualScale = kind === 'footman' ? 1.02 : 1;
    this.redrawBaseDecor();
    this.accentGraphic = scene.add.graphics();
    this.addAt(this.accentGraphic, 4);
    this.actionGraphic = scene.add.graphics();
    this.addAt(this.actionGraphic, 5);
    this.applyFacingScale();
    this.redrawTeamAccent(0);
    this.lastX = x;
    this.lastY = y;
  }

  setPath(path: PathPoint[], final = true) {
    if (path.length === 0) {
      this.fsm = { kind: 'idle' };
      return;
    }
    this.fsm = { kind: 'moving', path, i: 0, final };
  }

  stop() {
    this.fsm = { kind: 'idle' };
    this.setCarrying(null);
    (this as any)._attackChaseTarget = null;
  }

  hold() {
    this.fsm = { kind: 'hold' };
    this.setCarrying(null);
    (this as any)._attackChaseTarget = null;
  }

  isIdle(): boolean {
    return this.fsm.kind === 'idle';
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    switch (this.fsm.kind) {
      case 'moving':
      case 'attackMoving':
        this.tickMove(delta);
        break;
      case 'attacking':
        this.tickAttack(time, delta);
        break;
      case 'gathering':
        this.tickGather(time, delta);
        break;
      case 'returning':
        this.tickReturning(delta);
        break;
      case 'building':
        this.tickBuilding(time, delta);
        break;
      case 'repair':
        this.tickRepair(delta);
        break;
      case 'patrol':
        this.tickPatrol(delta);
        break;
      case 'hold':
        this.tickHold(time);
        break;
    }
    this.attackAnimTimer = Math.max(0, this.attackAnimTimer - delta);
    this.updateAnimatedTexture(time);
    this.updateBobbing(time, delta);
    this.updateSelectionPulse(delta);
    this.updateFlash(delta);
    this.redrawTeamAccent(time);
    this.redrawActionFx(time);
    this.updateIdleAmbientFx(delta);
    this.refreshDepth();
    this.updateDustTrail(delta);
  }

  private isMovingState(): boolean {
    if (this.fsm.kind === 'moving' || this.fsm.kind === 'attackMoving' || this.fsm.kind === 'patrol') return true;
    if (this.fsm.kind === 'gathering') {
      return Math.hypot(this.fsm.resource.x - this.x, this.fsm.resource.y - this.y) - this.fsm.resource.radius > 4;
    }
    if (this.fsm.kind === 'returning') {
      return Math.hypot(this.fsm.dropoff.x - this.x, this.fsm.dropoff.y - this.y) - (this.fsm.dropoff as any).radius > 4;
    }
    if (this.fsm.kind === 'building') {
      return Math.hypot(this.fsm.target.x - this.x, this.fsm.target.y - this.y) - (this.fsm.target as any).radius > 4;
    }
    if (this.fsm.kind === 'repair') {
      return Math.hypot(this.fsm.target.x - this.x, this.fsm.target.y - this.y) - (this.fsm.target as any).radius > 4;
    }
    return false;
  }

  private updateBobbing(time: number, delta: number) {
    const moving = this.isMovingState();
    const vx = this.x - this.lastX;
    const vy = this.y - this.lastY;
    const moved = Math.hypot(vx, vy);
    if (moved > 0.05) {
      this.motionAngle = Math.atan2(vy, vx);
      this.motionIntensity = Math.min(1, moved / Math.max(0.01, (this.speed * delta) / 1000));
      if (Math.abs(vx) > 0.08) this.facing = vx > 0 ? 1 : -1;
    } else {
      this.motionIntensity *= 0.82;
    }

    if (moving) {
      this.bobPhase += delta / 65;
      this.sprite.y = Math.sin(this.bobPhase) * 2.0;
      this.sprite.x = Math.sin(this.bobPhase * 0.5) * 0.5;
      const vertical = Math.sin(this.motionAngle);
      this.poseScaleX = 1 + Math.abs(Math.cos(this.motionAngle)) * 0.035;
      this.poseScaleY = 1 + Math.max(0, vertical) * 0.055 - Math.max(0, -vertical) * 0.035;
      this.poseRotation = Math.sin(this.bobPhase) * 0.035 * this.facing;
    } else {
      this.bobPhase += delta / 400;
      const rest = Math.sin(time / 520 + this.accentSeed);
      this.sprite.y = Math.sin(this.bobPhase) * 0.6;
      this.sprite.x *= 0.9;
      this.poseScaleX = 1 - rest * 0.012;
      this.poseScaleY = 1 + rest * 0.018;
      this.poseRotation = rest * 0.015;
    }

    if (this.attackAnimTimer > 0) {
      const t = this.attackAnimTimer / 240;
      const punch = Math.sin((1 - t) * Math.PI);
      this.poseScaleX += punch * 0.12;
      this.poseScaleY -= punch * 0.045;
      this.poseRotation += punch * 0.07 * this.facing;
    }
    this.accentGraphic.setPosition(this.sprite.x, this.sprite.y);
    this.actionGraphic.setPosition(this.sprite.x, this.sprite.y);
    this.applyFacingScale();
    this.lastX = this.x;
    this.lastY = this.y;
  }

  private updateAnimatedTexture(time: number) {
    const fallback = `unit-${this.kind}-${this.team}-d`;
    let key = fallback;
    if (this.fsm.kind === 'attacking') {
      const frame = this.attackAnimTimer > 120 ? 0 : 1;
      key = `unit-${this.kind}-${this.team}-attack-${frame}`;
    } else if (this.isMovingState()) {
      const ay = Math.sin(this.motionAngle);
      const ax = Math.cos(this.motionAngle);
      let dir = 'walk-right';
      let frameCount = 3;
      if (ay < -0.55 && Math.abs(ay) > Math.abs(ax) * 0.85) {
        dir = 'walk-up';
        frameCount = 2;
      } else if (ay > 0.55 && Math.abs(ay) > Math.abs(ax) * 0.85) {
        dir = 'walk-down';
      }
      const frame = Math.floor(time / 130 + this.accentSeed) % frameCount;
      key = `unit-${this.kind}-${this.team}-${dir}-${frame}`;
    } else {
      const frame = Math.floor(time / 620 + this.accentSeed) % 2;
      key = `unit-${this.kind}-${this.team}-idle-${frame}`;
    }
    if (this.scene.textures.exists(key)) {
      if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    } else if (this.sprite.texture.key !== fallback) {
      this.sprite.setTexture(fallback);
    }
  }

  private applyFacingScale() {
    this.sprite.setScale(this.facing * this.visualScale * this.poseScaleX, this.visualScale * this.poseScaleY);
    this.sprite.setRotation(this.poseRotation);
    this.accentGraphic.setScale(this.facing * this.visualScale * this.poseScaleX, this.visualScale * this.poseScaleY);
    this.accentGraphic.setRotation(this.poseRotation);
    this.actionGraphic.setScale(this.facing * this.visualScale, this.visualScale);
  }

  private redrawTeamAccent(time: number) {
    const g = this.accentGraphic;
    const teamColor = TEAM_COLOR[this.team];
    const teamLight = Phaser.Display.Color.IntegerToColor(teamColor).lighten(20).color;
    const teamDark = Phaser.Display.Color.IntegerToColor(teamColor).darken(28).color;
    const pulse = 0.55 + Math.sin(time / 210 + this.accentSeed) * 0.12;
    const clothWave = Math.sin(time / 170 + this.accentSeed) * 0.9;
    const clothWave2 = Math.cos(time / 210 + this.accentSeed * 1.4) * 0.7;
    const shimmer = (Math.sin(time / 290 + this.accentSeed * 0.8) + 1) * 0.5;
    const glintAlpha = 0.16 + shimmer * 0.34;
    const r = this.radius;

    g.clear();
    g.setPosition(this.sprite.x, this.sprite.y);

    if (this.kind === 'peasant') {
      g.fillStyle(teamColor, 0.92).fillRect(-1.8, r * 0.12, 3.6, 1.2);
      g.fillStyle(teamLight, 0.75).fillRect(-1.1, r * 0.12, 0.8, 1.2);
      g.fillStyle(teamColor, 0.8).fillEllipse(-0.6, -r * 1.04, 2.3, 0.95);
      g.fillStyle(teamDark, 0.6).fillRect(r * 0.95, -r * 0.06, 0.9, 4.4);
      g.fillStyle(teamLight, pulse).fillCircle(r * 1.4, -r * 0.04, 0.45);
      g.fillStyle(teamColor, 0.88).fillTriangle(r * 1.8, r * 0.2, r * 2.65 + clothWave, r * 0.46, r * 1.84, r * 0.64 + clothWave2);
      g.fillStyle(teamLight, 0.58).fillTriangle(r * 1.8, r * 0.24, r * 2.28 + clothWave * 0.55, r * 0.42, r * 1.84, r * 0.52 + clothWave2 * 0.4);
      g.fillStyle(0xffffff, glintAlpha).fillCircle(r * 1.1 + shimmer * 0.45, -r * 0.18, 0.38);
    } else if (this.kind === 'footman') {
      g.fillStyle(teamDark, 0.78).fillTriangle(-r * 0.22, -r * 0.3, -r * 1.02, r * 0.56, -r * 0.08, r * 0.82);
      g.fillStyle(teamColor, 0.92).fillTriangle(-r * 0.1, -r * 0.38, -r * 0.82, r * 0.48, -r * 0.02, r * 0.7);
      g.fillStyle(teamLight, 0.7).fillTriangle(-r * 0.14, -r * 0.3, -r * 0.52, r * 0.26, -r * 0.08, r * 0.5);
      g.fillStyle(teamColor, 0.88).fillRect(-0.9, -r * 1.44, 1.8, 4.8);
      g.fillStyle(teamLight, pulse).fillRect(-0.45, -r * 1.44, 0.5, 4.8);
      g.fillStyle(teamColor, 0.96).fillCircle(-r * 1.22, r * 0.02, 1.25);
      g.fillStyle(teamLight, pulse).fillCircle(-r * 1.3, -0.18, 0.45);
      g.fillStyle(teamDark, 0.85).fillRect(-r * 1.42, -0.18, 0.35, 0.55);
      g.fillStyle(teamDark, 0.85).fillRect(-r * 1.48, 0.35, 0.5, 0.34);
      g.fillStyle(teamColor, 0.84).fillTriangle(0.05, -r * 1.38, 0.08, -r * 0.44, 1.25 + clothWave * 0.7, -r * 1.04 + clothWave2);
      g.fillStyle(teamLight, 0.58).fillTriangle(0.02, -r * 1.34, 0.04, -r * 0.62, 0.78 + clothWave * 0.45, -r * 1 + clothWave2 * 0.7);
      g.fillStyle(0xffffff, glintAlpha).fillEllipse(-r * 1.03 + shimmer * 0.25, -0.12, 0.5, 1.25);
      g.fillStyle(0xffffff, glintAlpha * 0.72).fillRect(-0.12, -r * 1.24 + shimmer * 1.2, 0.34, 1.45);
    } else if (this.kind === 'archer') {
      g.fillStyle(teamColor, 0.85).fillEllipse(0, -r * 0.86, r * 1.35, 0.8);
      g.fillStyle(teamLight, pulse).fillEllipse(-r * 0.18, -r * 0.9, r * 0.52, 0.4);
      g.fillStyle(teamColor, 0.92).fillRect(-0.9, r * 0.14, 1.8, 4.6);
      g.fillStyle(teamLight, 0.7).fillRect(-0.45, r * 0.14, 0.5, 4.6);
      g.fillStyle(teamDark, 0.72).fillRect(r * 0.72, -r * 1.04, 0.75, 4.5);
      g.fillStyle(teamColor, 0.92).fillCircle(r * 1.15, -r * 1.02, 0.72);
      g.fillStyle(teamColor, 0.92).fillCircle(r * 1.15, -r * 0.7, 0.72);
      g.fillStyle(teamColor, 0.92).fillCircle(r * 1.15, -r * 0.38, 0.72);
      g.fillStyle(teamLight, pulse).fillCircle(r * 1.04, -r * 0.98, 0.22);
      g.fillStyle(teamColor, 0.84).fillTriangle(0.18, r * 0.24, 0.12, r * 0.94, 1.85 + clothWave, r * 0.7 + clothWave2);
      g.fillStyle(teamLight, 0.6).fillTriangle(0.15, r * 0.28, 0.1, r * 0.78, 1.18 + clothWave * 0.65, r * 0.62 + clothWave2 * 0.55);
      g.fillStyle(0xffffff, glintAlpha * 0.9).fillCircle(r * 1.26, -r * 0.76 + shimmer * 0.2, 0.18);
      g.fillStyle(0xffffff, glintAlpha).fillRect(-0.08, r * 0.26 + shimmer * 0.8, 0.3, 1.3);
    }
  }

  private updateIdleAmbientFx(delta: number) {
    if (this.isMovingState() || this.fsm.kind === 'attacking' || this.fsm.kind === 'attackMoving') {
      this.idleFxTimer = 0;
      return;
    }
    this.idleFxTimer += delta;
    if (this.idleFxTimer < 1100 + Math.random() * 900) return;
    this.idleFxTimer = 0;
    const vfx = (this.scene as any).vfx;
    if (!vfx) return;
    if (this.kind === 'peasant') {
      vfx.spawnDustCloud(this.x - this.facing * 7, this.y + this.radius * 0.45, 1);
    } else if (Math.random() > 0.45) {
      vfx.spawnAmbientMote(this.x - this.facing * 10, this.y - this.radius * 0.25, this.team === 'player' ? 0x93c5fd : 0xfca5a5, 0.7);
    } else {
      vfx.spawnSparks(this.x - this.facing * 12, this.y - this.radius * 0.1, this.team === 'player' ? 0x93c5fd : 0xfca5a5, 1);
    }
  }

  private redrawActionFx(time: number) {
    const g = this.actionGraphic;
    g.clear();

    const teamColor = TEAM_COLOR[this.team];
    const r = this.radius;
    if (this.isMovingState() && this.motionIntensity > 0.08) {
      const back = this.motionAngle + Math.PI;
      const step = Math.sin(time / 85 + this.accentSeed);
      const bx = Math.cos(back) * r * 0.5;
      const by = Math.sin(back) * r * 0.28 + r * 0.55;
      g.lineStyle(1.6, 0xd6c7a1, 0.16 + Math.abs(step) * 0.12);
      g.lineBetween(bx - 4, by, bx + 5, by + 1.5);
      g.lineStyle(1.2, teamColor, 0.12);
      g.lineBetween(-Math.cos(this.motionAngle) * r * 0.35, r * 0.7, -Math.cos(this.motionAngle) * r * 0.7, r * 0.82);
      return;
    }

    if (this.fsm.kind === 'attacking') {
      const t = this.attackAnimTimer > 0 ? this.attackAnimTimer / 240 : 0.18 + Math.sin(time / 160) * 0.05;
      const alpha = Phaser.Math.Clamp(t, 0.15, 0.85);
      const reach = this.kind === 'archer' ? r * 1.6 : r * 1.15;
      const y = this.kind === 'archer' ? -r * 0.45 : -r * 0.05;
      if (this.kind === 'archer') {
        g.lineStyle(1.2, 0xfef3c7, alpha * 0.45);
        g.lineBetween(r * 0.15, y, reach, y - 2);
        g.fillStyle(teamColor, alpha * 0.55).fillCircle(reach, y - 2, 1.5);
      } else {
        g.lineStyle(3.2, teamColor, alpha * 0.45);
        g.beginPath();
        g.arc(r * 0.2, y, reach, -0.5, 0.55, false);
        g.strokePath();
        g.lineStyle(1.2, 0xffffff, alpha * 0.55);
        g.beginPath();
        g.arc(r * 0.2, y, reach * 0.75, -0.3, 0.35, false);
        g.strokePath();
      }
      return;
    }

    if (this.fsm.kind === 'idle' || this.fsm.kind === 'hold') {
      const pulse = 0.5 + Math.sin(time / 700 + this.accentSeed) * 0.5;
      g.fillStyle(teamColor, 0.05 + pulse * 0.035);
      g.fillEllipse(0, r * 0.78, r * 1.25, r * 0.22);
    }
  }

  private updateDustTrail(delta: number) {
    if (!this.isMovingState()) {
      this.dustTimer = 0;
      return;
    }
    this.dustTimer += delta;
    if (this.dustTimer > 180) {
      this.dustTimer = 0;
      const vfx = (this.scene as any).vfx;
      if (vfx) vfx.spawnDustCloud(this.x, this.y + this.radius, 2);
    }
  }

  private tickMove(delta: number) {
    if (this.fsm.kind !== 'moving' && this.fsm.kind !== 'attackMoving') return;
    const s = this.fsm;
    if (s.i >= s.path.length) {
      this.fsm = { kind: 'idle' };
      return;
    }
    const node = s.path[s.i];
    const tx = node.tx * TILE + TILE / 2;
    const ty = node.ty * TILE + TILE / 2;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * delta) / 1000;
    if (dist <= step) {
      this.x = tx; this.y = ty;
      s.i += 1;
      if (s.i >= s.path.length) this.fsm = { kind: 'idle' };
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  private tickAttack(time: number, _delta: number) {
    if (this.fsm.kind !== 'attacking') return;
    const target = this.fsm.target;
    if (!target || target.dead) {
      if ((this as any)._attackChaseTarget === target) (this as any)._attackChaseTarget = null;
      this.fsm = { kind: 'idle' };
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) - (target as any).radius;
    if (dist > this.range) {
      if ((this as any)._attackChaseTarget !== target) {
        this.fsm = { kind: 'idle' };
        return;
      }
      const step = (this.speed * _delta) / 1000;
      const len = Math.hypot(dx, dy);
      if (len > 0.0001) {
        this.facing = dx >= 0 ? 1 : -1;
        this.applyFacingScale();
        this.x += (dx / len) * step;
        this.y += (dy / len) * step;
      }
      return;
    }
    this.facing = dx >= 0 ? 1 : -1;
    this.motionAngle = Math.atan2(dy, dx);
    this.applyFacingScale();
    if (time - this.lastAttackAt >= this.attackCooldown) {
      this.lastAttackAt = time;
      this.attackAnimTimer = 240;
      const snd = (this.scene as any).sound2;
      const vfx = (this.scene as any).vfx;
      if (this.kind === 'archer') {
        if (vfx) {
          const angle = Math.atan2(dy, dx);
          vfx.spawnMuzzleFlash(this.x, this.y - 5, angle);
          vfx.spawnProjectile(this.x, this.y - 5, target.x, target.y, 0x8ee06b, 0xaaff66);
        }
        if (snd) snd.play('bow');
        this.scene.time.delayedCall(150, () => {
          if (!target.dead) {
            target.takeDamage(this.attack, this);
            if (vfx) vfx.spawnImpact(target.x, target.y, 0x8ee06b, false);
          }
        });
      } else {
        if (vfx) {
          const angle = Math.atan2(dy, dx);
          vfx.spawnWeaponTrail(this.x, this.y - 4, angle, this.team === 'player' ? 0x3b82f6 : 0xef4444, 18, 1.4);
        }
        target.takeDamage(this.attack, this);
        if (vfx) vfx.spawnImpact(target.x, target.y, this.team === 'player' ? 0x3b82f6 : 0xef4444, false);
        if (snd) snd.play('melee');
      }
      this.scene.tweens.add({
        targets: [this.sprite, this.accentGraphic],
        scaleX: this.facing * this.visualScale * 1.25,
        scaleY: this.visualScale * 1.2,
        yoyo: true,
        duration: 70,
        ease: 'Power2',
        onComplete: () => this.applyFacingScale(),
      });
    }
  }

  private tickGather(time: number, delta: number) {
    if (this.fsm.kind !== 'gathering') return;
    const s = this.fsm;
    if (!s.resource || s.resource.dead) {
      this.fsm = { kind: 'idle' };
      this.setCarrying(null);
      return;
    }
    const dx = s.resource.x - this.x;
    const dy = s.resource.y - this.y;
    const dist = Math.hypot(dx, dy) - s.resource.radius;
    if (dist > 4) {
      const step = (this.speed * delta) / 1000;
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * step;
      this.y += (dy / len) * step;
    } else {
      s.gatherTicker += delta;
      this.gatherParticleTimer += delta;
      const vfx = (this.scene as any).vfx;
      if (vfx && this.gatherParticleTimer > 350) {
        this.gatherParticleTimer = 0;
        const color = s.resource.kind === 'goldmine' ? 0xffd700 : 0x2a5e1a;
        vfx.spawnGatherParticle(s.resource.x, s.resource.y, color);
      }
      if (s.gatherTicker >= 2000) {
        s.gatherTicker = 0;
        const taken = s.resource.harvest(8);
        s.carrying += taken;
        this.lastHarvestedNode = s.resource;
        this.setCarrying(s.resource.kind === 'goldmine' ? 'gold' : 'wood');
        const snd = (this.scene as any).sound2;
        if (snd) snd.play(s.resource.kind === 'goldmine' ? 'pick' : 'chop');
        if (s.carrying >= 8 || s.resource.dead) {
          this.scene.events.emit('gather:return', this, s.carrying, s.resource.kind === 'goldmine' ? 'gold' : 'wood');
        }
      }
    }
  }

  private tickReturning(delta: number) {
    if (this.fsm.kind !== 'returning') return;
    const s = this.fsm;
    if (!s.dropoff || s.dropoff.dead) {
      this.fsm = { kind: 'idle' };
      this.setCarrying(null);
      return;
    }
    const dx = s.dropoff.x - this.x;
    const dy = s.dropoff.y - this.y;
    const dist = Math.hypot(dx, dy) - (s.dropoff as any).radius;
    if (dist > 4) {
      const step = (this.speed * delta) / 1000;
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * step;
      this.y += (dy / len) * step;
    } else {
      const vfx = (this.scene as any).vfx;
      if (vfx) {
        const color = s.carryKind === 'gold' ? 0xffd700 : 0x8b4513;
        vfx.spawnSparks(this.x, this.y, color, 3);
      }
      this.scene.events.emit('gather:deposit', this, s.carrying, s.carryKind);
      this.setCarrying(null);
    }
  }

  private tickBuilding(_time: number, delta: number) {
    if (this.fsm.kind !== 'building') return;
    const s = this.fsm;
    if (!s.target || s.target.dead) {
      this.fsm = { kind: 'idle' };
      return;
    }
    if (s.target.isBuilt()) {
      const notif = (this.scene as any).notifications;
      if (notif && this.team === 'player') notif.add(T.buildingComplete, '#22c55e');
      const vfx = (this.scene as any).vfx;
      if (vfx) vfx.spawnRingWave(s.target.x, s.target.y, 5, s.target.radius + 10, 0.5, 0x22c55e, 2);
      this.fsm = { kind: 'idle' };
      return;
    }
    const dx = s.target.x - this.x;
    const dy = s.target.y - this.y;
    const dist = Math.hypot(dx, dy) - (s.target as any).radius;
    if (dist > 4) {
      const step = (this.speed * delta) / 1000;
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * step;
      this.y += (dy / len) * step;
    } else {
      s.target.progressBuild(delta);
      this.buildParticleTimer += delta;
      const vfx = (this.scene as any).vfx;
      if (vfx && this.buildParticleTimer > 250) {
        this.buildParticleTimer = 0;
        vfx.spawnBuildParticle(s.target.x, s.target.y);
      }
    }
  }

  private tickRepair(delta: number) {
    if (this.fsm.kind !== 'repair') return;
    const s = this.fsm;
    if (!s.target || s.target.dead) {
      this.fsm = { kind: 'idle' };
      return;
    }
    if (s.target.hp >= s.target.maxHp) {
      this.fsm = { kind: 'idle' };
      return;
    }
    const dx = s.target.x - this.x;
    const dy = s.target.y - this.y;
    const dist = Math.hypot(dx, dy) - (s.target as any).radius;
    if (dist > 4) {
      const step = (this.speed * delta) / 1000;
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * step;
      this.y += (dy / len) * step;
    } else {
      this.scene.events.emit('repair:tick', this, s.target, delta);
      this.buildParticleTimer += delta;
      const vfx = (this.scene as any).vfx;
      if (vfx && this.buildParticleTimer > 250) {
        this.buildParticleTimer = 0;
        vfx.spawnBuildParticle(s.target.x, s.target.y);
        vfx.spawnHeal(s.target.x, s.target.y - s.target.radius);
      }
    }
  }

  private tickPatrol(delta: number) {
    if (this.fsm.kind !== 'patrol') return;
    const s = this.fsm;
    if (s.i >= s.path.length) {
      s.toB = !s.toB;
      const target = s.toB ? s.pointB : s.pointA;
      const from = (this.scene as any).map.worldToTile(this.x, this.y);
      const tgt = (this.scene as any).map.worldToTile(target.x, target.y);
      (this.scene as any).path.findPath(from.tx, from.ty, tgt.tx, tgt.ty, (p: PathPoint[] | null) => {
        if (!p || p.length < 1) return;
        s.path = p;
        s.i = 0;
      });
    }
    if (s.i < s.path.length) {
      const node = s.path[s.i];
      const tx = node.tx * TILE + TILE / 2;
      const ty = node.ty * TILE + TILE / 2;
      const dx = tx - this.x;
      const dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      const step = (this.speed * delta) / 1000;
      if (dist <= step) {
        this.x = tx; this.y = ty;
        s.i += 1;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }
  }

  private tickHold(_time: number) {
  }
}
