import Phaser from 'phaser';
import { getGraphicsQuality, MAP_H, MAP_W, TILE, WORLD_H, WORLD_RENDER_PADDING, WORLD_W } from '../config';
import { TERRAIN_ANIMATION_FRAME_COUNT } from '../assets/AssetManifest';

export type TileType = 'grass' | 'dirt' | 'water' | 'stone' | 'grass-rich';

const TEX: Record<TileType, string> = {
  grass: 'tile-grass',
  'grass-rich': 'tile-grass-rich',
  dirt: 'tile-dirt',
  water: 'tile-water',
  stone: 'tile-stone',
};

export class GameMap {
  readonly w = MAP_W;
  readonly h = MAP_H;
  readonly tiles: TileType[][] = [];
  readonly grid: number[][] = [];
  private readonly terrainBlocked: boolean[][] = [];
  private biomeSeed: string;
  private animatedTiles: Array<{
    img: Phaser.GameObjects.Image;
    base: string;
    offset: number;
    frames: number;
    interval: number;
    tint: number;
    tile: TileType;
  }> = [];
  private waterFxCells: Array<{ x: number; y: number; phase: number; variant: number }> = [];
  private grassFxCells: Array<{ x: number; y: number; phase: number; rich: boolean; variant: number }> = [];
  private terrainFx: Phaser.GameObjects.Graphics | null = null;
  private lastTileFrame = -1;
  private lastTerrainFxFrame = -1;
  private readonly proceduralTerrainFx = getGraphicsQuality() !== 'low';

  constructor(private scene: Phaser.Scene) {
    this.biomeSeed = String(Date.now());
    for (let y = 0; y < this.h; y++) {
      this.tiles[y] = [];
      this.grid[y] = [];
      this.terrainBlocked[y] = [];
      for (let x = 0; x < this.w; x++) {
        const nx = x / this.w;
        const ny = y / this.h;
        const meadow = Math.sin((x + 4) * 0.27) * 0.55 + Math.cos((y + 2) * 0.21) * 0.45;
        const moisture = Math.sin((x * 0.15) + (y * 0.09)) * 0.5
          + Math.cos((y * 0.23) - (x * 0.07)) * 0.4
          + Math.sin((x + y) * 0.11) * 0.3;
        const stony = Math.cos((x * 0.24) + 0.8) * 0.55
          + Math.sin((y * 0.31) - 0.6) * 0.4
          + Math.cos((x - y) * 0.17) * 0.25;
        const warmBasin = 1 - Math.min(1, Math.hypot(nx - 0.73, ny - 0.76) / 0.42);
        const coolMarsh = 1 - Math.min(1, Math.hypot(nx - 0.46, ny - 0.42) / 0.33);
        const highland = 1 - Math.min(1, Math.hypot(nx - 0.2, ny - 0.72) / 0.28);

        let t: TileType = 'grass';
        const waterScore = moisture + coolMarsh * 1.15 - warmBasin * 0.35;
        const stoneScore = stony + highland * 1.25 - coolMarsh * 0.25;
        const richScore = meadow + warmBasin * 0.95 - stoneScore * 0.18;
        const dirtScore = warmBasin * 1.1 + Math.sin((x * 0.19) - (y * 0.14)) * 0.25 - moisture * 0.18;

        if (waterScore > 1.15) t = 'water';
        else if (stoneScore > 1.05) t = 'stone';
        else if (dirtScore > 0.95) t = 'dirt';
        else if (richScore > 0.88) t = 'grass-rich';
        this.tiles[y][x] = t;
        this.terrainBlocked[y][x] = this.isImpassableTerrain(t);
        this.grid[y][x] = this.terrainBlocked[y][x] ? 1 : 0;
      }
    }
  }

  render() {
    this.renderBackdrop();

    const rng = new Phaser.Math.RandomDataGenerator([`terrain-${this.biomeSeed}-${this.w}x${this.h}`]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const tile = this.tiles[y][x];
        const tex = this.initialTextureFor(tile, rng);
        const img = this.scene.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, tex)
          .setDepth(-100);
        img.setDisplaySize(TILE, TILE);
        img.setAlpha(0.95 + rng.frac() * 0.08);
        img.setScale(1.01 + rng.frac() * 0.04);
        img.setFlipX(rng.frac() > 0.5);
        img.setFlipY(rng.frac() > 0.78);
        const tint = this.getTileTint(x, y, tile);
        img.setTint(tint);
        if (this.shouldAnimateTile(tile)) {
          this.animatedTiles.push({
            img,
            base: `tile-${tile}`,
            offset: Math.floor(rng.frac() * TERRAIN_ANIMATION_FRAME_COUNT),
            frames: TERRAIN_ANIMATION_FRAME_COUNT,
            interval: this.tileAnimationInterval(tile),
            tint,
            tile,
          });
        }
        this.registerProceduralTerrainFx(x, y, tile, rng);
      }
    }

    this.renderTerrainDetails();
    if (this.proceduralTerrainFx) this.terrainFx = this.scene.add.graphics().setDepth(-88);
  }

  update(time: number) {
    const frameBucket = Math.floor(time / 80);
    if (frameBucket !== this.lastTileFrame) {
      this.lastTileFrame = frameBucket;
      for (const tile of this.animatedTiles) {
        const frame = (Math.floor(time / tile.interval) + tile.offset) % tile.frames;
        const key = `${tile.base}-${frame}`;
        if (this.scene.textures.exists(key) && tile.img.texture.key !== key) {
          tile.img.setTexture(key);
        }
        tile.img.setAlpha(tile.tile === 'water' ? 0.97 : 0.99);
        tile.img.setTint(tile.tint);
      }
    }
    this.updateProceduralTerrainFx(time);
  }

  private initialTextureFor(tile: TileType, rng: Phaser.Math.RandomDataGenerator): string {
    if ((tile === 'water' || tile === 'grass-rich' || tile === 'grass' || tile === 'dirt') && this.scene.textures.exists(`tile-${tile}-0`)) {
      return `tile-${tile}-${Math.floor(rng.frac() * TERRAIN_ANIMATION_FRAME_COUNT)}`;
    }
    return TEX[tile];
  }

  private shouldAnimateTile(tile: TileType): boolean {
    return tile === 'dirt' && this.scene.textures.exists(`tile-${tile}-0`);
  }

  private tileAnimationInterval(tile: TileType): number {
    if (tile === 'water') return 110;
    if (tile === 'dirt') return 720;
    if (tile === 'grass-rich') return 360;
    return 480;
  }

  private registerProceduralTerrainFx(tx: number, ty: number, tile: TileType, rng: Phaser.Math.RandomDataGenerator) {
    if (!this.proceduralTerrainFx) return;
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    if (tile === 'water') {
      this.waterFxCells.push({ x, y, phase: rng.frac() * Math.PI * 2, variant: rng.frac() });
      return;
    }
    if (tile !== 'grass' && tile !== 'grass-rich') return;
    const rich = tile === 'grass-rich';
    const chance = rich ? 0.44 : 0.24;
    if (rng.frac() > chance) return;
    this.grassFxCells.push({ x, y, phase: rng.frac() * Math.PI * 2, rich, variant: rng.frac() });
  }

  private updateProceduralTerrainFx(time: number) {
    if (!this.terrainFx) return;
    const bucket = Math.floor(time / 110);
    if (bucket === this.lastTerrainFxFrame) return;
    this.lastTerrainFxFrame = bucket;

    const g = this.terrainFx;
    g.clear();

    for (const cell of this.waterFxCells) {
      const slow = time / 2200 + cell.phase;
      const slow2 = time / 3100 + cell.phase * 1.7;
      const drift = Math.sin(slow) * 3.4;
      const lift = Math.cos(slow2) * 1.6;
      const alpha = 0.035 + (Math.sin(slow2) + 1) * 0.014;
      const width = 16 + cell.variant * 10;
      g.fillStyle(0x7dd3fc, alpha * 0.38);
      g.fillEllipse(cell.x + drift * 0.5, cell.y + lift, TILE * 0.78, TILE * 0.25);
      g.lineStyle(1.2, 0xdbeafe, alpha);
      g.lineBetween(cell.x - width + drift, cell.y - 7 + lift, cell.x + width * 0.35 + drift, cell.y - 8 + lift + Math.sin(slow) * 1.4);
      g.lineStyle(1, 0xbdeaff, alpha * 0.62);
      g.lineBetween(cell.x - width * 0.5 - drift * 0.35, cell.y + 6 - lift * 0.3, cell.x + width - drift * 0.35, cell.y + 5 + Math.cos(slow) * 1.1);
    }

    for (const cell of this.grassFxCells) {
      const slow = time / (cell.rich ? 2600 : 3200) + cell.phase;
      const sway = Math.sin(slow) * (cell.rich ? 3.1 : 2.2);
      const alpha = (cell.rich ? 0.075 : 0.052) + (Math.cos(slow * 0.8) + 1) * 0.012;
      const bladeColor = cell.rich ? 0xd9f99d : 0x86efac;
      const count = cell.rich ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const local = cell.variant * 19 + i * 8;
        const gx = cell.x - 12 + ((local * 7) % 25);
        const gy = cell.y - 6 + ((local * 5) % 15);
        const height = 5.5 + (i % 2) * 2.5;
        g.lineStyle(1, bladeColor, alpha * (0.82 - i * 0.12));
        g.lineBetween(gx, gy + 4, gx + sway * (0.55 + i * 0.18), gy - height);
      }
    }
  }

  private renderBackdrop() {
    const bg = this.scene.add.graphics().setDepth(-140);
    bg.fillStyle(0x06100d, 1).fillRect(
      -WORLD_RENDER_PADDING,
      -WORLD_RENDER_PADDING,
      WORLD_W + WORLD_RENDER_PADDING * 2,
      WORLD_H + WORLD_RENDER_PADDING * 2,
    );

    const light = this.scene.add.graphics().setDepth(-138);
    light.fillStyle(0x17381f, 0.45).fillEllipse(WORLD_W * 0.25, WORLD_H * 0.22, WORLD_W * 0.55, WORLD_H * 0.42);
    light.fillStyle(0x122d1a, 0.28).fillEllipse(WORLD_W * 0.78, WORLD_H * 0.78, WORLD_W * 0.48, WORLD_H * 0.32);
    light.fillStyle(0x123d52, 0.14).fillEllipse(WORLD_W * 0.58, WORLD_H * 0.4, WORLD_W * 0.42, WORLD_H * 0.24);
    light.fillStyle(0xfbbf24, 0.06).fillEllipse(WORLD_W * 0.12, WORLD_H * 0.1, WORLD_W * 0.22, WORLD_H * 0.16);
    light.fillStyle(0xf59e0b, 0.045).fillEllipse(WORLD_W * 0.76, WORLD_H * 0.8, WORLD_W * 0.42, WORLD_H * 0.28);
    light.fillStyle(0x60a5fa, 0.05).fillEllipse(WORLD_W * 0.46, WORLD_H * 0.4, WORLD_W * 0.26, WORLD_H * 0.2);
  }

  private renderTerrainDetails() {
    const rng = new Phaser.Math.RandomDataGenerator([`terrain-detail-${this.biomeSeed}-${this.w}x${this.h}`]);
    const splashes = this.scene.add.graphics().setDepth(-120);

    for (let i = 0; i < 18; i++) {
      const x = rng.frac() * WORLD_W;
      const y = rng.frac() * WORLD_H;
      const w = 70 + rng.frac() * 180;
      const h = 45 + rng.frac() * 120;
      const color = i % 4 === 0 ? 0x0b1d14 : i % 3 === 0 ? 0x193f28 : 0x8b5a2b;
      const alpha = color === 0x8b5a2b ? 0.05 : 0.08;
      splashes.fillStyle(color, alpha);
      splashes.fillEllipse(x, y, w, h);
    }

    const biomeVeils = this.scene.add.graphics().setDepth(-118);
    biomeVeils.fillStyle(0x0f766e, 0.055).fillEllipse(WORLD_W * 0.47, WORLD_H * 0.42, WORLD_W * 0.24, WORLD_H * 0.18);
    biomeVeils.fillStyle(0xa16207, 0.05).fillEllipse(WORLD_W * 0.73, WORLD_H * 0.76, WORLD_W * 0.3, WORLD_H * 0.22);
    biomeVeils.fillStyle(0x475569, 0.045).fillEllipse(WORLD_W * 0.22, WORLD_H * 0.72, WORLD_W * 0.24, WORLD_H * 0.18);
    biomeVeils.fillStyle(0x4d7c0f, 0.04).fillEllipse(WORLD_W * 0.28, WORLD_H * 0.25, WORLD_W * 0.34, WORLD_H * 0.2);

    const strokes = this.scene.add.graphics().setDepth(-95);
    strokes.lineStyle(1, 0xffffff, 0.03);
    for (let i = 0; i < 50; i++) {
      const x = rng.frac() * WORLD_W;
      const y = rng.frac() * WORLD_H;
      strokes.lineBetween(x, y, x + (rng.frac() - 0.5) * 50, y + (rng.frac() - 0.5) * 24);
    }

    const micro = this.scene.add.graphics().setDepth(-92);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const wx = x * TILE + TILE / 2;
        const wy = y * TILE + TILE / 2;
        const t = this.tiles[y][x];
        if (t === 'water') {
          micro.lineStyle(1, 0xdbeafe, 0.05 + rng.frac() * 0.03);
          micro.lineBetween(wx - 8 + rng.frac() * 4, wy - 4 + rng.frac() * 6, wx + 8 + rng.frac() * 3, wy - 3 + rng.frac() * 6);
          if (rng.frac() > 0.72) {
            micro.fillStyle(0xecfeff, 0.05);
            micro.fillCircle(wx - 4 + rng.frac() * 8, wy - 2 + rng.frac() * 6, 1 + rng.frac());
          }
        } else if (t === 'grass' || t === 'grass-rich') {
          const bladeColor = t === 'grass-rich' ? 0xd9f99d : 0x86efac;
          for (let i = 0; i < (t === 'grass-rich' ? 3 : 2); i++) {
            micro.lineStyle(1, bladeColor, 0.08 + rng.frac() * 0.05);
            const gx = wx - 10 + rng.frac() * 20;
            const gy = wy - 6 + rng.frac() * 12;
            micro.lineBetween(gx, gy + 3, gx + (rng.frac() - 0.5) * 2.6, gy - 2 - rng.frac() * 4);
          }
          if (t === 'grass-rich' && rng.frac() > 0.6) {
            micro.fillStyle(0xfef08a, 0.12);
            micro.fillCircle(wx - 8 + rng.frac() * 16, wy - 6 + rng.frac() * 12, 0.7);
          }
        } else if (t === 'dirt') {
          micro.lineStyle(1, 0x3f2a15, 0.09);
          micro.lineBetween(wx - 9 + rng.frac() * 6, wy - 4 + rng.frac() * 10, wx - 1 + rng.frac() * 7, wy - 5 + rng.frac() * 9);
          if (rng.frac() > 0.7) {
            micro.fillStyle(0xd6b07a, 0.09);
            micro.fillRect(wx - 8 + rng.frac() * 14, wy - 7 + rng.frac() * 12, 1.6, 1.2);
          }
        } else if (t === 'stone') {
          micro.fillStyle(0xe2e8f0, 0.06 + rng.frac() * 0.05);
          micro.fillRect(wx - 9 + rng.frac() * 15, wy - 7 + rng.frac() * 12, 1.5 + rng.frac(), 1.2 + rng.frac());
          micro.fillStyle(0x334155, 0.08);
          micro.fillRect(wx - 7 + rng.frac() * 13, wy - 5 + rng.frac() * 10, 1.2, 1);
        }
      }
    }

    const edgeGlow = this.scene.add.graphics().setDepth(-91);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tiles[y][x] !== 'water') continue;
        const wx = x * TILE;
        const wy = y * TILE;
        const neighbors = [
          this.tileAt(x, y - 1),
          this.tileAt(x + 1, y),
          this.tileAt(x, y + 1),
          this.tileAt(x - 1, y),
        ];
        if (neighbors.some((n) => n && n !== 'water')) {
          edgeGlow.lineStyle(1, 0xdbeafe, 0.05);
          edgeGlow.strokeRect(wx + 1, wy + 1, TILE - 2, TILE - 2);
        }
      }
    }

    const frame = this.scene.add.graphics().setDepth(-70);
    frame.lineStyle(4, 0x08100e, 0.7).strokeRect(0, 0, WORLD_W, WORLD_H);
    frame.lineStyle(2, 0x284235, 0.45).strokeRect(10, 10, WORLD_W - 20, WORLD_H - 20);
  }

  private tileAt(x: number, y: number): TileType | null {
    if (!this.inBounds(x, y)) return null;
    return this.tiles[y][x];
  }

  private isImpassableTerrain(tile: TileType): boolean {
    return tile === 'water' || tile === 'stone';
  }

  private getTileTint(x: number, y: number, tile: TileType): number {
    const nx = x / this.w;
    const ny = y / this.h;
    if (tile === 'water') {
      if (Math.hypot(nx - 0.46, ny - 0.42) < 0.22) return 0x7dd3fc;
      return nx + ny > 1.2 ? 0x4dabd6 : 0x74c0fc;
    }
    if (tile === 'stone') {
      return Math.hypot(nx - 0.2, ny - 0.72) < 0.18 ? 0xcbd5e1 : 0xb0bac5;
    }
    if (tile === 'dirt') {
      return Math.hypot(nx - 0.73, ny - 0.76) < 0.24 ? 0xd6a66b : 0xc18a56;
    }
    if (tile === 'grass-rich') {
      return nx < 0.45 ? 0x9bd77a : 0xb7e07a;
    }
    if (Math.hypot(nx - 0.46, ny - 0.42) < 0.22) return 0x7abf90;
    if (Math.hypot(nx - 0.73, ny - 0.76) < 0.24) return 0x98b86a;
    if (Math.hypot(nx - 0.2, ny - 0.72) < 0.18) return 0x7ea37d;
    return 0x8bb47b;
  }

  setBlocked(tx: number, ty: number, blocked: boolean) {
    if (!this.inBounds(tx, ty)) return;
    this.grid[ty][tx] = blocked || this.terrainBlocked[ty][tx] ? 1 : 0;
  }

  setBlockedRect(tx: number, ty: number, size: number, blocked: boolean) {
    for (let y = ty; y < ty + size; y++) {
      for (let x = tx; x < tx + size; x++) this.setBlocked(x, y, blocked);
    }
  }

  isBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return this.grid[ty][tx] !== 0;
  }

  isTerrainBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return this.terrainBlocked[ty][tx];
  }

  isRectFree(tx: number, ty: number, size: number): boolean {
    for (let y = ty; y < ty + size; y++) {
      for (let x = tx; x < tx + size; x++) {
        if (!this.inBounds(x, y) || this.grid[y][x] !== 0) return false;
      }
    }
    return true;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  worldToTile(wx: number, wy: number): { tx: number; ty: number } {
    return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE) };
  }

  tileCenter(tx: number, ty: number): { x: number; y: number } {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  findNearestFree(tx: number, ty: number, radius = 8): { tx: number; ty: number } | null {
    if (!this.isBlocked(tx, ty)) return { tx, ty };
    for (let r = 1; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          if (this.inBounds(nx, ny) && !this.isBlocked(nx, ny)) return { tx: nx, ty: ny };
        }
      }
    }
    return null;
  }
}
