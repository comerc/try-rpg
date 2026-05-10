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
  protected selectionGlow!: Phaser.GameObjects.Graphics;
  protected hpBg!: Phaser.GameObjects.Rectangle;
  protected hpFg!: Phaser.GameObjects.Rectangle;
  protected selected = false;
  protected shadow!: Phaser.GameObjects.Graphics;

  radius = 14;

  private selectionPulse = 0;
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

    this.selectionGlow = scene.add.graphics();
    this.selectionGlow.setVisible(false);
    this.add(this.selectionGlow);

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

    this.redrawShadow();

    this.redrawTeamRing(ringRadius);

    this.flashGraphics.clear();
    this.flashGraphics.fillStyle(0xffffff, 1);
    this.flashGraphics.fillCircle(0, 0, this.radius + 2);
    this.flashGraphics.setAlpha(this.flashAlpha);

    this.hpBg.setPosition(0, -this.radius - 12).setSize(this.hpBarWidth + 4, 6);
    this.hpFg.setPosition(-this.hpBarWidth / 2, -this.radius - 12).setSize(this.hpBarWidth, 4);

    if (this.carryKind) this.drawCarryIndicator(this.carryKind);
    this.updateHpBar();
  }

  protected redrawTeamRing(_ringRadius: number) {
    this.teamRing.clear();
  }

  protected redrawShadow() {
    this.shadow.clear();
    this.shadow.fillStyle(0x000000, 0.22);
    this.shadow.fillEllipse(0, this.radius + 4.5, this.radius * 2.2, this.radius * 0.68);
    this.shadow.fillStyle(0x000000, 0.1);
    this.shadow.fillEllipse(0, this.radius + 2.2, this.radius * 1.65, this.radius * 0.38);
    this.shadow.fillStyle(TEAM_COLOR[this.team], 0.05);
    this.shadow.fillEllipse(0, this.radius + 3.3, this.radius * 1.7, this.radius * 0.28);
  }

  setSelected(v: boolean) {
    this.selected = v;
    this.selectionRing.setVisible(v);
    this.selectionGlow.setVisible(false);
    if (v) this.bringSelectionToTop();
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

  protected bringSelectionToTop() {
    this.bringToTop(this.selectionGlow);
    this.bringToTop(this.selectionRing);
    if (this.carryIndicator) this.bringToTop(this.carryIndicator);
    this.bringToTop(this.hpBg);
    this.bringToTop(this.hpFg);
  }

  protected updateSelectionPulse(delta: number) {
    if (!this.selected) return;
    this.selectionPulse += delta / 1000;

    const halfSize = this.radius + 7;
    const corner = Math.max(7, halfSize * 0.36);
    const alpha = 0.42 + Math.sin(this.selectionPulse * 4) * 0.05;
    this.selectionGlow.clear();

    this.selectionRing.clear();
    this.selectionRing.lineStyle(2, 0xffffff, alpha);
    this.selectionRing.lineBetween(-halfSize, -halfSize, -halfSize + corner, -halfSize);
    this.selectionRing.lineBetween(-halfSize, -halfSize, -halfSize, -halfSize + corner);
    this.selectionRing.lineBetween(halfSize, -halfSize, halfSize - corner, -halfSize);
    this.selectionRing.lineBetween(halfSize, -halfSize, halfSize, -halfSize + corner);
    this.selectionRing.lineBetween(-halfSize, halfSize, -halfSize + corner, halfSize);
    this.selectionRing.lineBetween(-halfSize, halfSize, -halfSize, halfSize - corner);
    this.selectionRing.lineBetween(halfSize, halfSize, halfSize - corner, halfSize);
    this.selectionRing.lineBetween(halfSize, halfSize, halfSize, halfSize - corner);
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
