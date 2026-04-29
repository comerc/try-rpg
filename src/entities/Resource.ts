import Phaser from 'phaser';
import { RESOURCE_STOCK, ResourceKind, TILE } from '../config';

export class ResourceNode extends Phaser.GameObjects.Container {
  kind: ResourceKind;
  stock: number;
  maxStock: number;
  dead = false;
  tx: number; ty: number;
  size: number;
  radius: number;

  protected sprite: Phaser.GameObjects.Sprite;
  private activeChoppers = new Set<object>();

  constructor(scene: Phaser.Scene, tx: number, ty: number, kind: ResourceKind) {
    const size = kind === 'goldmine' ? 2 : 1;
    super(scene, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    this.kind = kind;
    this.stock = RESOURCE_STOCK[kind];
    this.maxStock = RESOURCE_STOCK[kind];
    this.tx = tx; this.ty = ty;
    this.size = size;
    this.radius = kind === 'goldmine' ? 18 : 12;

    this.sprite = scene.add.sprite(0, 0, kind === 'goldmine' ? 'env-mine-f1' : 'env-tree-f1');
    this.sprite.setDisplaySize(kind === 'goldmine' ? TILE * 1.8 : TILE * 1.25, kind === 'goldmine' ? TILE * 1.6 : TILE * 1.35);
    this.add(this.sprite);
    scene.add.existing(this);
    this.setDepth(this.y);
  }

  // Selection-system compatibility stubs. ResourceNode is pushed into
  // GameScene.entities alongside Unit/Building (force-cast to Entity) so it
  // can be picked by clicks, but it doesn't extend Entity. These no-ops keep
  // SelectionSystem.setSelection/clear from crashing on 'e.setSelected'.
  setSelected(_v: boolean) { /* no selection ring for resources */ }
  isSelected(): boolean { return false; }

  startChopping(actor: object) {
    if (this.kind !== 'tree' || this.dead) return;
    this.activeChoppers.add(actor);
    if (!this.sprite.anims.isPlaying) this.sprite.play('res-tree-d');
  }

  stopChopping(actor: object) {
    if (this.kind !== 'tree') return;
    this.activeChoppers.delete(actor);
    if (this.activeChoppers.size === 0 && !this.dead) {
      this.sprite.stop();
      this.sprite.setTexture('env-tree-f1');
      this.sprite.setDisplaySize(TILE * 1.25, TILE * 1.35);
    }
  }

  harvest(amount: number): number {
    const taken = Math.min(amount, this.stock);
    this.stock -= taken;
    if (this.stock <= 0) this.die();
    return taken;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.activeChoppers.clear();
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
      const color = this.kind === 'goldmine' ? 0xffd700 : 0x22c55e;
      vfx.spawnDeathExplosion(this.x, this.y, color);
    }
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 250,
      onComplete: () => this.destroy(),
    });
  }
}
