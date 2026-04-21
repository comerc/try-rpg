import Phaser from 'phaser';
import { TEAM_COLOR, Team } from '../config';

export abstract class Entity extends Phaser.GameObjects.Container {
  hp: number;
  maxHp: number;
  team: Team;
  dead = false;

  protected sprite!: Phaser.GameObjects.Image;
  protected teamRing!: Phaser.GameObjects.Graphics;
  protected selectionRing!: Phaser.GameObjects.Graphics;
  protected hpBg!: Phaser.GameObjects.Rectangle;
  protected hpFg!: Phaser.GameObjects.Rectangle;
  protected selected = false;
  protected shadow!: Phaser.GameObjects.Graphics;

  radius = 14;

  private selectionPulse = 0;
  private selectionAngle = 0;
  private carryIndicator: Phaser.GameObjects.Graphics | null = null;
  private carryKind: 'gold' | 'wood' | null = null;
  private flashGraphics!: Phaser.GameObjects.Graphics;
  private flashAlpha = 0;
  private hpBarWidth = 34;

  lastDamagedAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, team: Team, maxHp: number, texture: string) {
    super(scene, x, y);
    this.team = team;
    this.maxHp = maxHp;
    this.hp = maxHp;

    this.shadow = scene.add.graphics();
    this.add(this.shadow);

    this.teamRing = scene.add.graphics();
    this.add(this.teamRing);

    this.selectionRing = scene.add.graphics();
    this.selectionRing.setVisible(false);
    this.add(this.selectionRing);

    this.sprite = scene.add.image(0, 0, texture);
    this.add(this.sprite);

    this.flashGraphics = scene.add.graphics();
    this.flashGraphics.setVisible(false);
    this.add(this.flashGraphics);

    this.hpBg = scene.add.rectangle(0, 0, 34, 6, 0x000000, 0.75).setOrigin(0.5, 0.5);
    this.hpFg = scene.add.rectangle(0, 0, 34, 4, 0x22c55e).setOrigin(0, 0.5);
    this.add(this.hpBg);
    this.add(this.hpFg);

    this.redrawBaseDecor();
    scene.add.existing(this);
    this.setDepth(y);
  }

  protected redrawBaseDecor() {
    const ringRadius = this.radius + 2.5;
    this.hpBarWidth = Math.max(30, this.radius * 2.55);

    this.shadow.clear();
    this.shadow.fillStyle(0x000000, 0.22);
    this.shadow.fillEllipse(0, this.radius + 4.5, this.radius * 2.2, this.radius * 0.68);
    this.shadow.fillStyle(0x000000, 0.1);
    this.shadow.fillEllipse(0, this.radius + 2.2, this.radius * 1.65, this.radius * 0.38);
    this.shadow.fillStyle(TEAM_COLOR[this.team], 0.05);
    this.shadow.fillEllipse(0, this.radius + 3.3, this.radius * 1.7, this.radius * 0.28);

    this.teamRing.clear();
    this.teamRing.lineStyle(6, TEAM_COLOR[this.team], 0.12);
    this.teamRing.strokeCircle(0, 0, ringRadius + 1.9);
    this.teamRing.lineStyle(2.4, TEAM_COLOR[this.team], 0.88);
    this.teamRing.strokeCircle(0, 0, ringRadius);
    this.teamRing.lineStyle(1.1, 0xffffff, 0.1);
    this.teamRing.strokeCircle(0, 0, ringRadius - 2);
    this.teamRing.lineStyle(0.8, 0x000000, 0.18);
    this.teamRing.strokeCircle(0, 0, ringRadius + 3.2);

    this.flashGraphics.clear();
    this.flashGraphics.fillStyle(0xffffff, 1);
    this.flashGraphics.fillCircle(0, 0, this.radius + 2);
    this.flashGraphics.setAlpha(this.flashAlpha);

    this.hpBg.setPosition(0, -this.radius - 12).setSize(this.hpBarWidth + 4, 6);
    this.hpFg.setPosition(-this.hpBarWidth / 2, -this.radius - 12).setSize(this.hpBarWidth, 4);

    if (this.carryKind) this.drawCarryIndicator(this.carryKind);
    this.updateHpBar();
  }

  setSelected(v: boolean) {
    this.selected = v;
    this.selectionRing.setVisible(v);
    if (!v) this.selectionPulse = 0;
  }

  isSelected() { return this.selected; }

  setCarrying(kind: 'gold' | 'wood' | null) {
    this.carryKind = kind;
    if (kind && !this.carryIndicator) {
      this.carryIndicator = this.scene.add.graphics();
      this.add(this.carryIndicator);
    }
    if (this.carryIndicator) {
      this.carryIndicator.clear();
      if (kind) this.drawCarryIndicator(kind);
    }
  }

  private drawCarryIndicator(kind: 'gold' | 'wood') {
    if (!this.carryIndicator) return;
    const color = kind === 'gold' ? 0xffd700 : 0xa16207;
    const accent = kind === 'gold' ? 0xfff3a3 : 0xd6a55a;
    const x = this.radius * 0.52;
    const y = -this.radius - 3;
    this.carryIndicator.fillStyle(color, 0.2);
    this.carryIndicator.fillCircle(x, y, 6);
    this.carryIndicator.fillStyle(color, 1);
    this.carryIndicator.fillCircle(x, y, 4.2);
    this.carryIndicator.fillStyle(accent, 0.8);
    this.carryIndicator.fillCircle(x - 1.2, y - 1.3, 1.3);
    this.carryIndicator.lineStyle(1, 0x000000, 0.5);
    this.carryIndicator.strokeCircle(x, y, 4.2);
  }

  getCarrying(): 'gold' | 'wood' | null { return this.carryKind; }

  protected updateHpBar() {
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpFg.width = this.hpBarWidth * ratio;
    this.hpFg.fillColor = ratio > 0.55 ? 0x22c55e : ratio > 0.28 ? 0xf59e0b : 0xef4444;
    const show = this.hp < this.maxHp || this.selected;
    this.hpBg.setVisible(show);
    this.hpFg.setVisible(show);
  }

  heal(amount: number) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.updateHpBar();
  }

  takeDamage(amount: number, attacker?: Entity) {
    if (this.dead) return;
    const actualDmg = Math.max(1, amount - ((this as { armor?: number }).armor ?? 0));
    this.hp = Math.max(0, this.hp - actualDmg);
    this.lastDamagedAt = this.scene.time?.now ?? 0;
    this.updateHpBar();

    this.flashAlpha = 1;
    this.flashGraphics.setVisible(true);
    this.flashGraphics.setAlpha(1);

    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.3,
      yoyo: true,
      duration: 60,
      repeat: 1,
      onComplete: () => this.sprite.setAlpha(1),
    });

    const vfx = (this.scene as { vfx?: { spawnSparks(x: number, y: number, color: number, count?: number): void; spawnBlood(x: number, y: number): void; spawnDamageNumber(x: number, y: number, amount: number): void } }).vfx;
    if (vfx) {
      vfx.spawnSparks(this.x, this.y, TEAM_COLOR[this.team], 5);
      vfx.spawnBlood(this.x, this.y);
      vfx.spawnDamageNumber(this.x, this.y, actualDmg);
    }

    this.scene.events.emit('entity:damaged', this, attacker);

    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.setSelected(false);
    const vfx = (this.scene as { vfx?: { spawnDeathExplosion(x: number, y: number, color: number): void; spawnDustCloud(x: number, y: number, count?: number): void; spawnSmokePlume?(x: number, y: number, count?: number, scale?: number): void } }).vfx;
    if (vfx) {
      vfx.spawnDeathExplosion(this.x, this.y, TEAM_COLOR[this.team]);
      vfx.spawnDustCloud(this.x, this.y + this.radius, 8);
      vfx.spawnSmokePlume?.(this.x, this.y - this.radius * 0.2, 7, 1.1);
    }
    const snd = (this.scene as { sound2?: { play(key: string): void } }).sound2;
    if (snd) snd.play('death');
    this.scene.events.emit('entity:died', this);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 0.6,
      scaleY: 0.6,
      duration: 300,
      ease: 'Power2',
      onComplete: () => this.destroy(),
    });
  }

  abstract update(time: number, delta: number): void;

  protected refreshDepth() {
    this.setDepth(this.y);
  }

  protected updateSelectionPulse(delta: number) {
    if (!this.selected) return;
    this.selectionPulse += delta / 1000;
    this.selectionAngle += delta / 1000 * 2.2;

    const scale = 1 + Math.sin(this.selectionPulse * 4) * 0.08;
    const r = (this.radius + 6) * scale;
    const pulseAlpha = 0.7 + Math.sin(this.selectionPulse * 4) * 0.18;
    this.selectionRing.clear();

    this.selectionRing.lineStyle(6, TEAM_COLOR[this.team], 0.08);
    this.selectionRing.strokeCircle(0, 0, r + 1.5);

    const segments = 4;
    const gapAngle = 0.26;
    const segAngle = (Math.PI * 2 / segments) - gapAngle;
    for (let i = 0; i < segments; i++) {
      const startA = this.selectionAngle + (i * (Math.PI * 2 / segments));
      this.selectionRing.lineStyle(2.5, 0xffffff, pulseAlpha);
      this.selectionRing.beginPath();
      this.selectionRing.arc(0, 0, r, startA, startA + segAngle, false);
      this.selectionRing.strokePath();
    }

    this.selectionRing.fillStyle(0xffffff, 0.18);
    for (let i = 0; i < 4; i++) {
      const a = this.selectionAngle + i * (Math.PI / 2);
      this.selectionRing.fillCircle(Math.cos(a) * r, Math.sin(a) * r, 1.5);
    }

    this.selectionRing.lineStyle(1, 0xffffff, 0.14 + Math.sin(this.selectionPulse * 3) * 0.08);
    this.selectionRing.strokeCircle(0, 0, r + 2.5);
  }

  protected updateFlash(delta: number) {
    if (this.flashAlpha > 0) {
      this.flashAlpha -= delta / 1000 * 6;
      if (this.flashAlpha <= 0) {
        this.flashAlpha = 0;
        this.flashGraphics.setVisible(false);
      } else {
        this.flashGraphics.setAlpha(this.flashAlpha);
      }
    }
  }
}
