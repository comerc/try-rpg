import Phaser from 'phaser';
import { Team, TILE, UNIT_DEFS, UnitKind } from '../config';
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
  private dustTimer = 0;
  private attackAnimTimer = 0;
  private visualScale = 1;
  private idleFxTimer = 0;
  private choppingResource: ResourceNode | null = null;
  private usesPeasantAtlas = false;

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
    this.radius = kind === 'footman' ? 12 : kind === 'archer' ? 11 : 10;
    this.visualScale = kind === 'footman' ? 0.7 : 0.66;
    this.usesPeasantAtlas = kind === 'peasant' && team === 'player';
    if (this.usesPeasantAtlas) {
      this.sprite.setTexture('unit-peasant-player-f1');
      this.visualScale = 0.25;
    }
    this.redrawBaseDecor();
    this.applyFacingScale();
    this.lastX = x;
  }

  setPath(path: PathPoint[], final = true) {
    this.setChoppingResource(null);
    if (path.length === 0) {
      this.fsm = { kind: 'idle' };
      return;
    }
    this.fsm = { kind: 'moving', path, i: 0, final };
  }

  stop() {
    this.setChoppingResource(null);
    this.fsm = { kind: 'idle' };
    this.setCarrying(null);
    (this as any)._attackChaseTarget = null;
  }

  hold() {
    this.setChoppingResource(null);
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
    this.updateBobbing(delta);
    this.updateSelectionPulse(delta);
    this.updateFlash(delta);
    this.updateIdleAmbientFx(delta);
    this.updatePeasantAnimation();
    this.refreshDepth();
    this.updateDustTrail(delta);
    if (this.fsm.kind !== 'gathering') this.setChoppingResource(null);
  }

  die() {
    this.setChoppingResource(null);
    super.die();
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
      const spot = this.buildStandSpot(this.fsm.target);
      return Math.hypot(spot.x - this.x, spot.y - this.y) > 4;
    }
    if (this.fsm.kind === 'repair') {
      return this.distanceToBuildingRect(this.fsm.target) > 4;
    }
    return false;
  }

  private updateBobbing(delta: number) {
    const moving = this.isMovingState();
    if (moving) {
      this.bobPhase += delta / 65;
      this.sprite.y = Math.sin(this.bobPhase) * 2.0;
      this.sprite.x = Math.sin(this.bobPhase * 0.5) * 0.5;
    } else {
      this.bobPhase += delta / 400;
      this.sprite.y = Math.sin(this.bobPhase) * 0.6;
      this.sprite.x *= 0.9;
    }
    if (Math.abs(this.x - this.lastX) > 0.3) {
      const newFacing = this.x > this.lastX ? 1 : -1;
      if (newFacing !== this.facing) {
        this.facing = newFacing;
        this.applyFacingScale();
      }
    }
    this.lastX = this.x;
  }

  private applyFacingScale() {
    this.sprite.setScale(this.facing * this.visualScale, this.visualScale);
  }

  protected refreshDepth() {
    if (this.fsm.kind === 'gathering' && this.fsm.resource.kind === 'tree') {
      this.setDepth(this.fsm.resource.y + 1);
      return;
    }
    super.refreshDepth();
  }

  private updatePeasantAnimation() {
    if (!this.usesPeasantAtlas) return;
    if (this.isPeasantInteracting()) {
      this.playPeasantAnimation('unit-peasant-player-interact');
      return;
    }
    if (this.isMovingState()) {
      this.playPeasantAnimation('unit-peasant-player-walk');
      return;
    }
    this.stopPeasantAnimation('unit-peasant-player-f1');
  }

  private isPeasantInteracting(): boolean {
    if (this.fsm.kind === 'gathering') {
      return Math.hypot(this.fsm.resource.x - this.x, this.fsm.resource.y - this.y) - this.fsm.resource.radius <= 4;
    }
    if (this.fsm.kind === 'building') {
      const spot = this.buildStandSpot(this.fsm.target);
      return Math.hypot(spot.x - this.x, spot.y - this.y) <= 4;
    }
    if (this.fsm.kind === 'repair') {
      return this.distanceToBuildingRect(this.fsm.target) <= 4;
    }
    return false;
  }

  private playPeasantAnimation(key: string) {
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) {
      this.sprite.play(key);
      this.applyFacingScale();
    }
  }

  private stopPeasantAnimation(textureKey: string) {
    if (this.sprite.anims.isPlaying) this.sprite.stop();
    if (this.sprite.texture.key !== textureKey) this.sprite.setTexture(textureKey);
    this.applyFacingScale();
  }

  private updateIdleAmbientFx(delta: number) {
    if (this.kind !== 'footman') return;
    if (this.isMovingState() || this.fsm.kind === 'attacking' || this.fsm.kind === 'attackMoving') {
      this.idleFxTimer = 0;
      return;
    }
    this.idleFxTimer += delta;
    if (this.idleFxTimer < 850 + Math.random() * 650) return;
    this.idleFxTimer = 0;
    const vfx = (this.scene as any).vfx;
    if (!vfx) return;
    if (Math.random() > 0.45) {
      vfx.spawnAmbientMote(this.x - this.facing * 10, this.y - this.radius * 0.25, this.team === 'player' ? 0x93c5fd : 0xfca5a5, 0.7);
    } else {
      vfx.spawnSparks(this.x - this.facing * 12, this.y - this.radius * 0.1, this.team === 'player' ? 0x93c5fd : 0xfca5a5, 1);
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
    this.applyFacingScale();
    if (time - this.lastAttackAt >= this.attackCooldown) {
      this.lastAttackAt = time;
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
        targets: this.sprite,
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
      this.setChoppingResource(null);
      this.fsm = { kind: 'idle' };
      this.setCarrying(null);
      return;
    }
    const dx = s.resource.x - this.x;
    const dy = s.resource.y - this.y;
    const dist = Math.hypot(dx, dy) - s.resource.radius;
    if (dist > 4) {
      this.setChoppingResource(null);
      const step = (this.speed * delta) / 1000;
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * step;
      this.y += (dy / len) * step;
    } else {
      this.setChoppingResource(s.resource.kind === 'tree' ? s.resource : null);
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

  private setChoppingResource(resource: ResourceNode | null) {
    if (this.choppingResource === resource) return;
    this.choppingResource?.stopChopping(this);
    this.choppingResource = resource;
    this.choppingResource?.startChopping(this);
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
    const spot = this.buildStandSpot(s.target);
    const dx = spot.x - this.x;
    const dy = spot.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const step = (this.speed * delta) / 1000;
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
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
    const dist = this.distanceToBuildingRect(s.target);
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

  private distanceToBuildingRect(b: Building): number {
    const half = (b.size * TILE) / 2;
    const dx = Math.max(b.x - half - this.x, 0, this.x - (b.x + half));
    const dy = Math.max(b.y - half - this.y, 0, this.y - (b.y + half));
    return Math.hypot(dx, dy);
  }

  private buildStandSpot(b: Building): { x: number; y: number } {
    const half = (b.size * TILE) / 2;
    return { x: b.x, y: b.y + half + 10 };
  }
}
