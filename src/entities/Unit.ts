import Phaser from 'phaser';
import { TEAM_COLOR, Team, TILE, UNIT_DEFS, UnitKind } from '../config';
import { Entity } from './Entity';
import { T } from '../i18n';
import { UNIT_ANIMATION_FRAME_COUNTS, unitAnimationFallback, unitAnimationKey, type AnimationDirection, type AnimationState } from '../assets/AssetManifest';
import { UNIT_VISUAL_SCALE } from '../assets/VisualMetrics';
import type { PathPoint } from '../world/Pathfinding';
import type { Building } from './Building';
import type { ResourceNode } from './Resource';

const UNIT_SOFT_BLOCK_COST = 80;

export type UnitState =
  | { kind: 'idle' }
  | { kind: 'hold' }
  | { kind: 'moving'; path: PathPoint[]; i: number; final?: boolean }
  | { kind: 'attackMoving'; path: PathPoint[]; i: number }
  | { kind: 'attacking'; target: Entity }
  | { kind: 'gathering'; resource: ResourceNode; returning: boolean; carrying: number; gatherTicker: number; path?: PathPoint[]; i?: number }
  | { kind: 'returning'; dropoff: Building; carryKind: 'gold' | 'wood'; carrying: number; path?: PathPoint[]; i?: number }
  | { kind: 'building'; target: Building; path?: PathPoint[]; i?: number }
  | { kind: 'repair'; target: Building; path?: PathPoint[]; i?: number }
  | { kind: 'patrol'; pointA: { x: number; y: number }; pointB: { x: number; y: number }; path: PathPoint[]; i: number; toB: boolean }
  | { kind: 'dead' };

export class Unit extends Entity {
  private static nextTrafficId = 1;

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
  attackChaseTarget: Entity | null = null;

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
  private visualFxAccum = 0;
  private actionLoopTimer = 0;
  private hitAnimTimer = 0;
  private animationStateKey = '';
  private animationStateStartedAt = 0;
  private buildQueue: Building[] = [];
  private readonly trafficId = Unit.nextTrafficId++;
  private blockedMoveTimer = 0;
  private lastBlockedTileKey = '';
  private lastPathRequestAt = -10000;
  private stuckWatchX = 0;
  private stuckWatchY = 0;
  private stuckWatchTimer = 0;
  private stuckWatchPathKey = '';

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
    this.radius = kind === 'horseKnight' ? TILE * 0.52
      : kind === 'cavalier' || kind === 'horseArcher' ? TILE * 0.49
        : kind === 'knight' ? TILE * 0.46
          : kind === 'footman' ? TILE * 0.42
            : kind === 'archer' ? TILE * 0.38 : TILE * 0.36;
    this.visualScale = UNIT_VISUAL_SCALE[kind];
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
    this.clearBuildQueue();
    this.resetBlockedMove();
    if (path.length === 0) {
      this.fsm = { kind: 'idle' };
      return;
    }
    this.fsm = { kind: 'moving', path, i: 0, final };
  }

  stop() {
    this.clearBuildQueue();
    this.resetBlockedMove();
    this.fsm = { kind: 'idle' };
    this.setCarrying(null);
    this.attackChaseTarget = null;
  }

  hold() {
    this.clearBuildQueue();
    this.resetBlockedMove();
    this.fsm = { kind: 'hold' };
    this.setCarrying(null);
    this.attackChaseTarget = null;
  }

  isIdle(): boolean {
    return this.fsm.kind === 'idle';
  }

  assignBuildTarget(target: Building) {
    if (this.kind !== 'peasant') return;
    if (this.fsm.kind === 'building') {
      if (this.fsm.target === target || this.buildQueue.includes(target)) return;
      if (this.buildQueue.length < 8) this.buildQueue.push(target);
      return;
    }
    this.buildParticleTimer = 0;
    this.resetBlockedMove();
    this.fsm = { kind: 'building', target };
  }

  clearBuildQueue() {
    this.buildQueue = [];
  }

  buildQueueLength(): number {
    return this.buildQueue.filter((target) => target && !target.dead && !target.isBuilt()).length;
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
        this.tickBuilding(delta);
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
    this.updateStuckWatchdog(delta);
    this.attackAnimTimer = Math.max(0, this.attackAnimTimer - delta);
    this.hitAnimTimer = Math.max(0, this.hitAnimTimer - delta);
    this.updateActionLoop(delta);
    this.updateAnimatedTexture(time);
    this.updateBobbing(time, delta);
    this.updateSelectionPulse(delta);
    this.updateFlash(delta);
    this.visualFxAccum += delta;
    if (this.visualFxAccum >= 66 || this.attackAnimTimer > 0 || this.selected) {
      this.visualFxAccum = 0;
      this.redrawTeamAccent(time);
      this.redrawActionFx(time);
    }
    this.updateIdleAmbientFx(delta);
    this.refreshDepth();
    this.updateDustTrail(delta);
  }

  private isMovingState(): boolean {
    if (this.fsm.kind === 'moving' || this.fsm.kind === 'attackMoving' || this.fsm.kind === 'patrol') return true;
    if (this.fsm.kind === 'gathering') {
      return !this.canInteractWithFootprint(this.fsm.resource);
    }
    if (this.fsm.kind === 'returning') {
      return !this.canInteractWithFootprint(this.fsm.dropoff);
    }
    if (this.fsm.kind === 'building') {
      return !this.canInteractWithFootprint(this.fsm.target);
    }
    if (this.fsm.kind === 'repair') {
      return !this.canInteractWithFootprint(this.fsm.target);
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
      this.bobPhase += delta / 88;
      const stride = Math.sin(this.bobPhase);
      const footfall = Math.abs(stride);
      this.sprite.y = -footfall * 0.55;
      this.sprite.x = Math.sin(this.bobPhase * 0.5) * 0.18;
      this.poseScaleX = 1;
      this.poseScaleY = 1;
      this.poseRotation = 0;
    } else {
      this.bobPhase += delta / 620;
      this.sprite.y = Math.sin(time / 820 + this.accentSeed) * 0.22;
      this.sprite.x *= 0.86;
      this.poseScaleX = 1;
      this.poseScaleY = 1;
      this.poseRotation = 0;
    }
    this.accentGraphic.setPosition(this.sprite.x, this.sprite.y);
    this.actionGraphic.setPosition(this.sprite.x, this.sprite.y);
    this.applyFacingScale();
    this.lastX = this.x;
    this.lastY = this.y;
  }

  private updateAnimatedTexture(time: number) {
    const fallback = unitAnimationFallback(this.kind, this.team);
    let state: AnimationState = 'idle';
    let direction: AnimationDirection = 'right';
    let frameCount = UNIT_ANIMATION_FRAME_COUNTS.idle;
    if (this.hitAnimTimer > 0) {
      state = 'hit';
      frameCount = UNIT_ANIMATION_FRAME_COUNTS.hit;
    } else if (this.fsm.kind === 'attacking') {
      state = 'attack';
      frameCount = UNIT_ANIMATION_FRAME_COUNTS.attack;
    } else if (this.isMovingState()) {
      const ay = Math.sin(this.motionAngle);
      const ax = Math.cos(this.motionAngle);
      if (ay < -0.55 && Math.abs(ay) > Math.abs(ax) * 0.85) {
        direction = 'up';
      } else if (ay > 0.55 && Math.abs(ay) > Math.abs(ax) * 0.85) {
        direction = 'down';
      }
      state = 'walk';
      frameCount = UNIT_ANIMATION_FRAME_COUNTS.walk;
    } else if (this.fsm.kind === 'gathering') {
      state = 'gather';
      frameCount = UNIT_ANIMATION_FRAME_COUNTS.gather;
    } else if (this.fsm.kind === 'building' || this.fsm.kind === 'repair') {
      state = 'build';
      frameCount = UNIT_ANIMATION_FRAME_COUNTS.build;
    } else {
      frameCount = UNIT_ANIMATION_FRAME_COUNTS.idle;
    }
    const stateKey = `${state}:${direction}`;
    if (stateKey !== this.animationStateKey) {
      this.animationStateKey = stateKey;
      this.animationStateStartedAt = time;
    }
    const cycleDuration = ({
      idle: 1360,
      walk: 984,
      attack: 640,
      hit: 350,
      death: 656,
      gather: 768,
      build: 768,
    } satisfies Record<AnimationState, number>)[state];
    const frameRate = cycleDuration / Math.max(1, frameCount);
    const localTime = Math.max(0, time - this.animationStateStartedAt);
    const frame = Math.floor(localTime / frameRate + this.accentSeed * 0.12) % frameCount;
    const key = unitAnimationKey(this.kind, this.team, state, direction, frame);
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
    } else if (this.kind === 'footman' || this.kind === 'knight' || this.kind === 'cavalier' || this.kind === 'horseKnight') {
      const mounted = this.kind === 'cavalier' || this.kind === 'horseKnight';
      const heavy = this.kind === 'knight' || this.kind === 'horseKnight';
      const shieldScale = heavy ? 1.16 : 1;
      const bladeAlpha = heavy ? 0.95 : 0.72;
      if (mounted) {
        g.fillStyle(0x4b2f1a, 0.65).fillEllipse(0, r * 0.38, r * 1.9, r * 0.72);
        g.fillStyle(teamColor, 0.55).fillEllipse(-r * 0.12, r * 0.28, r * 1.15, r * 0.38);
        g.fillStyle(teamLight, pulse * 0.55).fillRect(-r * 0.62, r * 0.1, r * 1.1, 1.1);
      }
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
      g.fillStyle(0xffffff, glintAlpha).fillEllipse(-r * 1.03 + shimmer * 0.25, -0.12, 0.5 * shieldScale, 1.25 * shieldScale);
      g.fillStyle(0xffffff, glintAlpha * bladeAlpha).fillRect(-0.12, -r * 1.24 + shimmer * 1.2, 0.34, heavy ? 2.1 : 1.45);
      if (heavy) {
        g.fillStyle(0xfacc15, 0.78).fillCircle(-r * 1.2, 0.03, 1.0);
        g.fillStyle(0xfffbeb, glintAlpha).fillCircle(-r * 1.34, -0.12, 0.35);
        g.fillStyle(teamColor, 0.72).fillTriangle(-r * 0.35, -r * 1.52, -r * 0.08, -r * 1.08, -r * 0.64, -r * 1.12);
      }
    } else if (this.kind === 'archer' || this.kind === 'horseArcher') {
      const mounted = this.kind === 'horseArcher';
      if (mounted) {
        g.fillStyle(0x4b2f1a, 0.62).fillEllipse(0, r * 0.44, r * 1.88, r * 0.68);
        g.fillStyle(teamColor, 0.5).fillEllipse(-r * 0.08, r * 0.3, r * 1.1, r * 0.34);
      }
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
      const step = Math.sin(time / 120 + this.accentSeed);
      const bx = Math.cos(back) * r * 0.5;
      const by = Math.sin(back) * r * 0.28 + r * 0.55;
      g.lineStyle(1.2, 0xd6c7a1, 0.06 + Math.abs(step) * 0.05);
      g.lineBetween(bx - 4, by, bx + 5, by + 1.5);
      g.lineStyle(1, teamColor, 0.05);
      g.lineBetween(-Math.cos(this.motionAngle) * r * 0.35, r * 0.7, -Math.cos(this.motionAngle) * r * 0.7, r * 0.82);
      return;
    }

    if (this.fsm.kind === 'gathering' || this.fsm.kind === 'building' || this.fsm.kind === 'repair') {
      const pulse = 0.45 + Math.sin(time / 140 + this.accentSeed) * 0.25;
      const toolColor = this.fsm.kind === 'repair' ? 0x86efac : this.fsm.kind === 'building' ? 0xfacc15 : 0xd6a55a;
      g.lineStyle(1.5, toolColor, 0.12 + pulse * 0.12);
      g.lineBetween(r * 0.42, -r * 0.28, r * 1.18, r * 0.42);
      g.lineStyle(1, 0xffffff, 0.08 + pulse * 0.08);
      g.lineBetween(r * 0.5, -r * 0.34, r * 1.05, r * 0.28);
      g.fillStyle(toolColor, 0.14 + pulse * 0.12).fillCircle(r * 1.2, r * 0.45, 1.4);
      return;
    }

    if (this.fsm.kind === 'attacking') {
      const t = this.attackAnimTimer > 0 ? this.attackAnimTimer / 240 : 0.12 + Math.sin(time / 220) * 0.03;
      const alpha = Phaser.Math.Clamp(t, 0.08, 0.38);
      const reach = this.kind === 'archer' ? r * 1.6 : r * 1.15;
      const y = this.kind === 'archer' ? -r * 0.45 : -r * 0.05;
      if (this.kind === 'archer' || this.kind === 'horseArcher') {
        g.lineStyle(1.1, 0xfef3c7, alpha * 0.32);
        g.lineBetween(r * 0.15, y, reach, y - 2);
        g.fillStyle(teamColor, alpha * 0.34).fillCircle(reach, y - 2, 1.2);
      } else {
        g.lineStyle(2.2, teamColor, alpha * 0.28);
        g.beginPath();
        g.arc(r * 0.2, y, reach, -0.5, 0.55, false);
        g.strokePath();
        g.lineStyle(1, 0xffffff, alpha * 0.32);
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
    if (this.dustTimer > 220) {
      this.dustTimer = 0;
      const vfx = (this.scene as any).vfx;
      if (vfx) {
        const side = Math.sin(this.bobPhase) > 0 ? 1 : -1;
        const back = this.motionAngle + Math.PI;
        const x = this.x + Math.cos(back) * this.radius * 0.52 + Math.cos(this.motionAngle + Math.PI / 2) * side * this.radius * 0.18;
        const y = this.y + this.radius * 0.78 + Math.sin(back) * this.radius * 0.18;
        vfx.spawnDustCloud(x, y, 1);
      }
    }
  }

  private interactionRange(): number {
    return this.radius + 10;
  }

  private canInteractWithFootprint(target: { tx: number; ty: number; size: number }): boolean {
    const map = (this.scene as any).map;
    if (map) {
      const tile = map.worldToTile(this.x, this.y);
      const minX = target.tx;
      const minY = target.ty;
      const maxX = target.tx + target.size - 1;
      const maxY = target.ty + target.size - 1;
      const inTarget = tile.tx >= minX && tile.tx <= maxX && tile.ty >= minY && tile.ty <= maxY;
      const nextToTarget = tile.tx >= minX - 1 && tile.tx <= maxX + 1 && tile.ty >= minY - 1 && tile.ty <= maxY + 1;
      if (!inTarget && nextToTarget) return true;
    }

    const left = target.tx * TILE;
    const top = target.ty * TILE;
    const right = (target.tx + target.size) * TILE;
    const bottom = (target.ty + target.size) * TILE;
    const nearestX = Math.max(left, Math.min(this.x, right));
    const nearestY = Math.max(top, Math.min(this.y, bottom));
    return Math.hypot(this.x - nearestX, this.y - nearestY) <= this.interactionRange();
  }

  private moveAlongPathState(
    state: { path?: PathPoint[]; i?: number },
    delta: number,
  ): { status: 'missing' | 'moved' | 'blocked' | 'done'; needsRepath: boolean } {
    if (!state.path || state.i === undefined) return { status: 'missing', needsRepath: false };
    if (state.i >= state.path.length) return { status: 'done', needsRepath: false };
    const node = state.path[state.i];
    const tx = node.tx * TILE + TILE / 2;
    const ty = node.ty * TILE + TILE / 2;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * delta) / 1000;

    if (dist <= step) {
      if (!this.canOccupyTile(node.tx, node.ty)) return this.blockedStepResult(state, node.tx, node.ty, delta);
      this.x = tx;
      this.y = ty;
      state.i += 1;
      this.resetBlockedMove();
      return { status: state.i >= state.path.length ? 'done' : 'moved', needsRepath: false };
    }

    const nx = this.x + (dx / dist) * step;
    const ny = this.y + (dy / dist) * step;
    const map = (this.scene as any).map;
    if (map) {
      const nextTile = map.worldToTile(nx, ny);
      if (!this.canOccupyTile(nextTile.tx, nextTile.ty)) return this.blockedStepResult(state, nextTile.tx, nextTile.ty, delta);
    }
    this.x = nx;
    this.y = ny;
    this.resetBlockedMove();
    return { status: 'moved', needsRepath: false };
  }

  private canOccupyTile(tx: number, ty: number): boolean {
    const map = (this.scene as any).map;
    if (!map) return true;
    const current = map.worldToTile(this.x, this.y);
    if (current.tx === tx && current.ty === ty) return true;
    const sceneTileFree = (this.scene as any).isUnitTileFree;
    if (typeof sceneTileFree === 'function') return sceneTileFree.call(this.scene, tx, ty, this);
    return !map.isBlocked(tx, ty);
  }

  private blockedStepResult(
    state: { path?: PathPoint[]; i?: number },
    tx: number,
    ty: number,
    delta: number,
  ): { status: 'blocked'; needsRepath: boolean } {
    const blocker = this.unitOnTile(tx, ty);
    if (blocker && this.isHeadOnWith(blocker)) {
      const shouldYield = this.trafficId > blocker.trafficId;
      if (shouldYield && this.tryYieldSidestep(state, tx, ty)) return { status: 'blocked', needsRepath: false };
      return this.blockedPathResult(tx, ty, delta, shouldYield, !shouldYield);
    }
    return this.blockedPathResult(tx, ty, delta);
  }

  private tryYieldSidestep(state: { path?: PathPoint[]; i?: number }, blockedTx: number, blockedTy: number): boolean {
    const map = (this.scene as any).map;
    const pathfinder = (this.scene as any).path;
    if (!map || !pathfinder || !state.path || state.path.length === 0) return false;
    const current = map.worldToTile(this.x, this.y);
    const final = state.path[state.path.length - 1];
    const dx = Math.sign(blockedTx - current.tx);
    const dy = Math.sign(blockedTy - current.ty);
    if (dx === 0 && dy === 0) return false;

    const sides = [
      { tx: current.tx - dy, ty: current.ty + dx },
      { tx: current.tx + dy, ty: current.ty - dx },
    ];
    if (this.trafficId % 2 === 0) sides.reverse();

    const isUnitTileFree = (this.scene as any).isUnitTileFree;
    for (const side of sides) {
      if (typeof isUnitTileFree === 'function' && !isUnitTileFree.call(this.scene, side.tx, side.ty, this)) continue;
      if (typeof isUnitTileFree !== 'function' && map.isBlocked(side.tx, side.ty)) continue;

      let tail: PathPoint[] | null = null;
      pathfinder.findPath(side.tx, side.ty, final.tx, final.ty, (p: PathPoint[] | null) => {
        tail = p;
      }, {
        maxTargetRadius: 12,
        softBlocked: (tx: number, ty: number) => (
          typeof isUnitTileFree === 'function'
            ? !isUnitTileFree.call(this.scene, tx, ty, this)
            : false
        ),
        softBlockCost: UNIT_SOFT_BLOCK_COST,
        destinationBlocked: (tx: number, ty: number) => (
          typeof isUnitTileFree === 'function'
            ? !isUnitTileFree.call(this.scene, tx, ty, this)
            : false
        ),
      });
      const resolvedTail = tail as PathPoint[] | null;
      if (!resolvedTail || resolvedTail.length < 1) continue;
      state.path = [{ tx: current.tx, ty: current.ty }, ...resolvedTail];
      state.i = 0;
      this.lastPathRequestAt = this.scene.time.now;
      this.resetBlockedMove();
      return true;
    }
    return false;
  }

  private isHeadOnWith(blocker: Unit): boolean {
    const map = (this.scene as any).map;
    if (!map) return false;
    const current = map.worldToTile(this.x, this.y);
    const blockerState = blocker.fsm;
    if (!('path' in blockerState) || !blockerState.path || blockerState.i === undefined || blockerState.i >= blockerState.path.length) return false;
    const blockerNext = blockerState.path[blockerState.i];
    return blockerNext.tx === current.tx && blockerNext.ty === current.ty;
  }

  private unitOnTile(tx: number, ty: number): Unit | null {
    const map = (this.scene as any).map;
    if (!map) return null;
    const entities = ((this.scene as any).entities ?? []) as Entity[];
    for (const e of entities) {
      if (!(e instanceof Unit) || e.dead || e === this) continue;
      const tile = map.worldToTile(e.x, e.y);
      if (tile.tx === tx && tile.ty === ty) return e;
    }
    return null;
  }

  private blockedPathResult(
    tx: number,
    ty: number,
    delta: number,
    forceRepath = false,
    suppressRepath = false,
  ): { status: 'blocked'; needsRepath: boolean } {
    const key = `${tx}:${ty}`;
    if (key !== this.lastBlockedTileKey) {
      this.lastBlockedTileKey = key;
      this.blockedMoveTimer = 0;
    }
    this.blockedMoveTimer += delta;
    const now = this.scene.time.now;
    const needsRepath = !suppressRepath && (forceRepath || this.blockedMoveTimer >= 350) && now - this.lastPathRequestAt >= 500;
    return { status: 'blocked', needsRepath };
  }

  private resetBlockedMove() {
    this.blockedMoveTimer = 0;
    this.lastBlockedTileKey = '';
  }

  private resetStuckWatch(pathKey = '') {
    this.stuckWatchX = this.x;
    this.stuckWatchY = this.y;
    this.stuckWatchTimer = 0;
    this.stuckWatchPathKey = pathKey;
  }

  private updateStuckWatchdog(delta: number) {
    if (!this.isMovingState()) {
      this.resetStuckWatch();
      return;
    }

    const state = this.currentPathState();
    if (!state?.path || state.i === undefined || state.i >= state.path.length) {
      this.resetStuckWatch();
      return;
    }

    const next = state.path[state.i];
    const end = state.path[state.path.length - 1];
    const pathKey = `${state.i}:${next.tx}:${next.ty}:${end.tx}:${end.ty}`;
    if (this.stuckWatchPathKey !== pathKey) {
      this.resetStuckWatch(pathKey);
      return;
    }

    const moved = Math.hypot(this.x - this.stuckWatchX, this.y - this.stuckWatchY);
    if (moved >= 3) {
      this.resetStuckWatch(pathKey);
      return;
    }

    this.stuckWatchTimer += delta;
    if (this.stuckWatchTimer < 900) return;
    if (this.scene.time.now - this.lastPathRequestAt < 500) return;
    this.stuckWatchTimer = 0;
    this.repathPathState(state);
  }

  private currentPathState(): { path?: PathPoint[]; i?: number } | null {
    switch (this.fsm.kind) {
      case 'moving':
      case 'attackMoving':
      case 'gathering':
      case 'returning':
      case 'building':
      case 'repair':
      case 'patrol':
        return this.fsm;
      default:
        return null;
    }
  }

  private requestPathTo(x: number, y: number, onPath: (path: PathPoint[]) => void): boolean {
    const now = this.scene.time.now;
    if (now - this.lastPathRequestAt < 500) return false;
    this.lastPathRequestAt = now;
    return this.followPathTo(x, y, (path) => {
      this.resetBlockedMove();
      onPath(path);
    });
  }

  private repathPathState(state: { path?: PathPoint[]; i?: number }) {
    if (!state.path || state.path.length === 0) return false;
    const last = state.path[state.path.length - 1];
    const target = { x: last.tx * TILE + TILE / 2, y: last.ty * TILE + TILE / 2 };
    const stateRef = this.fsm;
    return this.requestPathTo(target.x, target.y, (path) => {
      if (this.fsm !== stateRef) return;
      state.path = path;
      state.i = 0;
    });
  }

  private tickMove(delta: number) {
    if (this.fsm.kind !== 'moving' && this.fsm.kind !== 'attackMoving') return;
    const s = this.fsm;
    if (s.i >= s.path.length) {
      this.fsm = { kind: 'idle' };
      return;
    }
    const step = this.moveAlongPathState(s, delta);
    if (step.needsRepath) this.repathPathState(s);
    if (s.i >= s.path.length) this.fsm = { kind: 'idle' };
  }

  private tickAttack(time: number, _delta: number) {
    if (this.fsm.kind !== 'attacking') return;
    const target = this.fsm.target;
    if (!target || target.dead) {
      if (this.attackChaseTarget === target) this.attackChaseTarget = null;
      this.fsm = { kind: 'idle' };
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) - (target as any).radius;
    if (dist > this.range) {
      if (this.attackChaseTarget !== target) {
        this.fsm = { kind: 'idle' };
        return;
      }
      this.facing = dx >= 0 ? 1 : -1;
      this.applyFacingScale();
      const targetRef = target;
      this.requestPathTo(target.x, target.y, (p) => {
        this.fsm = { kind: 'attackMoving', path: p, i: 0 };
        this.attackChaseTarget = targetRef;
      });
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
          if (!this.scene.scene.isActive() || this.dead || !target.active || target.dead) return;
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
    if (!this.canInteractWithFootprint(s.resource)) {
      const step = this.moveAlongPathState(s, delta);
      if ((step.status === 'moved' || step.status === 'blocked') && !step.needsRepath) return;
      this.requestPathTo(s.resource.x, s.resource.y, (p) => {
        s.path = p;
        s.i = 0;
      });
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
    if (!this.canInteractWithFootprint(s.dropoff)) {
      const step = this.moveAlongPathState(s, delta);
      if ((step.status === 'moved' || step.status === 'blocked') && !step.needsRepath) return;
      this.requestPathTo(s.dropoff.x, s.dropoff.y, (p) => {
        s.path = p;
        s.i = 0;
      });
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

  private tickBuilding(delta: number) {
    if (this.fsm.kind !== 'building') return;
    const s = this.fsm;
    if (!s.target || s.target.dead) {
      if (!this.startNextBuildFromQueue()) this.fsm = { kind: 'idle' };
      return;
    }
    if (s.target.isBuilt()) {
      const notif = (this.scene as any).notifications;
      if (notif && this.team === 'player') notif.add(T.buildingComplete, '#22c55e');
      const vfx = (this.scene as any).vfx;
      if (vfx) vfx.spawnRingWave(s.target.x, s.target.y, 5, s.target.radius + 10, 0.5, 0x22c55e, 2);
      if (!this.startNextBuildFromQueue()) this.fsm = { kind: 'idle' };
      return;
    }
    if (!this.canInteractWithFootprint(s.target)) {
      const step = this.moveAlongPathState(s, delta);
      if ((step.status === 'moved' || step.status === 'blocked') && !step.needsRepath) return;
      this.requestPathTo(s.target.x, s.target.y, (p) => {
        s.path = p;
        s.i = 0;
      });
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

  private startNextBuildFromQueue(): boolean {
    while (this.buildQueue.length > 0) {
      const next = this.buildQueue.shift();
      if (!next || next.dead || next.isBuilt()) continue;
      this.buildParticleTimer = 0;
      this.fsm = { kind: 'building', target: next };
      return true;
    }
    return false;
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
    if (!this.canInteractWithFootprint(s.target)) {
      const step = this.moveAlongPathState(s, delta);
      if ((step.status === 'moved' || step.status === 'blocked') && !step.needsRepath) return;
      this.requestPathTo(s.target.x, s.target.y, (p) => {
        s.path = p;
        s.i = 0;
      });
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
      this.followPathTo(target.x, target.y, (p) => {
        s.path = p;
        s.i = 0;
      });
    }
    if (s.i < s.path.length) {
      const step = this.moveAlongPathState(s, delta);
      if (step.needsRepath) this.repathPathState(s);
    }
  }

  private tickHold(_time: number) {
  }

  takeDamage(amount: number, attacker?: Entity) {
    if (this.dead) return;
    this.hitAnimTimer = 240;
    super.takeDamage(amount, attacker);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.fsm = { kind: 'dead' };
    this.attackChaseTarget = null;
    this.setSelected(false);
    this.setCarrying(null);
    this.scene.tweens.killTweensOf([this, this.sprite, this.accentGraphic, this.actionGraphic]);
    this.hpBg.setVisible(false);
    this.hpFg.setVisible(false);
    this.teamRing.setVisible(false);
    this.selectionRing.setVisible(false);
    this.selectionGlow.setVisible(false);
    this.accentGraphic.clear();
    this.actionGraphic.clear();

    const vfx = (this.scene as any).vfx;
    if (vfx) {
      vfx.spawnDeathExplosion(this.x, this.y, TEAM_COLOR[this.team]);
      vfx.spawnDustCloud(this.x, this.y + this.radius, 8);
      vfx.spawnSmokePlume?.(this.x, this.y - this.radius * 0.2, 6, 0.9);
    }
    const snd = (this.scene as any).sound2;
    if (snd) snd.play('death');
    this.scene.events.emit('entity:died', this);

    const frames = UNIT_ANIMATION_FRAME_COUNTS.death;
    for (let frame = 0; frame < frames; frame++) {
      this.scene.time.delayedCall(frame * 62, () => {
        if (!this.active) return;
        const key = unitAnimationKey(this.kind, this.team, 'death', 'right', frame);
        if (this.scene.textures.exists(key)) this.sprite.setTexture(key);
      });
    }
    this.scene.time.delayedCall(frames * 62 + 90, () => {
      if (!this.active) return;
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        scaleX: 0.68,
        scaleY: 0.68,
        duration: 260,
        ease: 'Power2',
        onComplete: () => this.destroy(),
      });
    });
  }

  private updateActionLoop(delta: number) {
    const activeAction = (this.fsm.kind === 'gathering' || this.fsm.kind === 'building' || this.fsm.kind === 'repair') && !this.isMovingState();
    if (!activeAction) {
      this.actionLoopTimer = 0;
      return;
    }
    this.actionLoopTimer += delta;
    if (this.actionLoopTimer < 520) return;
    this.actionLoopTimer = 0;
    this.attackAnimTimer = Math.max(this.attackAnimTimer, 160);
  }

  private followPathTo(x: number, y: number, onPath: (path: PathPoint[]) => void): boolean {
    const map = (this.scene as any).map;
    const path = (this.scene as any).path;
    if (!map || !path) return false;
    const from = map.worldToTile(this.x, this.y);
    const to = map.worldToTile(x, y);
    const isUnitTileFree = (this.scene as any).isUnitTileFree;
    path.findPath(from.tx, from.ty, to.tx, to.ty, (p: PathPoint[] | null) => {
      if (!p || p.length < 1 || this.dead) return;
      onPath(p);
    }, {
      maxTargetRadius: 12,
      softBlocked: (tx: number, ty: number) => (
        typeof isUnitTileFree === 'function'
          ? !isUnitTileFree.call(this.scene, tx, ty, this)
          : false
      ),
      softBlockCost: UNIT_SOFT_BLOCK_COST,
      destinationBlocked: (tx: number, ty: number) => (
        typeof isUnitTileFree === 'function'
          ? !isUnitTileFree.call(this.scene, tx, ty, this)
          : false
      ),
    });
    return true;
  }

}
