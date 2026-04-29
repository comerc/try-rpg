import Phaser from 'phaser';
import { TILE } from '../config';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.image('bld-townhall-player-d', 'assets/generated/townhall-player.png');
    this.load.image('bld-townhall-enemy-d', 'assets/generated/townhall-enemy.png');
    this.load.image('bld-barracks-player-d', 'assets/generated/barracks-player.png');
    this.load.image('bld-barracks-enemy-d', 'assets/generated/barracks-enemy.png');
    this.load.image('bld-farm-player-d', 'assets/generated/farm-player.png');
    this.load.image('bld-farm-enemy-d', 'assets/generated/farm-enemy.png');
    this.load.image('bld-tower-player-d', 'assets/generated/tower-player.png');
    this.load.image('bld-tower-enemy-d', 'assets/generated/tower-enemy.png');
    this.load.image('unit-peasant-player-d', 'assets/generated/peasant-player.png');
    this.load.image('unit-peasant-enemy-d', 'assets/generated/peasant-enemy.png');
    this.load.image('unit-footman-player-d', 'assets/generated/footman-player.png');
    this.load.image('unit-footman-enemy-d', 'assets/generated/footman-enemy.png');
    this.load.image('unit-archer-player-d', 'assets/generated/archer-player.png');
    this.load.image('unit-archer-enemy-d', 'assets/generated/archer-enemy.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#08110f');

    this.makeTile('tile-grass', 0x315f35, 0x1e4124, 0x5b9962, 14);
    this.makeTile('tile-dirt', 0x7e5b35, 0x5a3d1f, 0xb58a5e, 10);
    this.makeTile('tile-water', 0x1f5d8b, 0x123c62, 0x67b6e9, 14);
    this.makeTile('tile-stone', 0x59626a, 0x353c44, 0x9ba6af, 9);
    this.makeTile('tile-grass-rich', 0x28592f, 0x17371d, 0x70b46d, 16);

    this.makeRect('res-tree', 28, 28, 0x2f5f28, 0x183115);
    this.makeRect('res-goldmine', 30, 30, 0xe6b800, 0x8a6a00);

    this.makeRect('pixel', 1, 1, 0xffffff, 0xffffff);

    this.makeDetailedTree('res-tree-d', 0x265c28, 0x5a3a1a);
    this.makeDetailedGoldmine('res-goldmine-d', 0xf5c93b, 0x665246);

    this.scene.start('Game');
    this.scene.launch('UI');
  }

  private makeTile(key: string, fill: number, stroke: number, highlight: number, detailCount: number) {
    const g = this.add.graphics();
    const rng = new Phaser.Math.RandomDataGenerator([key]);
    const dark = Phaser.Display.Color.IntegerToColor(stroke).darken(15).color;
    const light = Phaser.Display.Color.IntegerToColor(highlight).lighten(10).color;

    g.fillStyle(fill, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(highlight, 0.1).fillRect(0, 0, TILE, 8);
    g.fillStyle(dark, 0.18).fillRect(0, TILE - 6, TILE, 6);
    g.lineStyle(1, stroke, 0.25).strokeRect(0.5, 0.5, TILE - 1, TILE - 1);

    for (let i = 0; i < detailCount; i++) {
      const dx = rng.frac() * (TILE - 6) + 3;
      const dy = rng.frac() * (TILE - 6) + 3;
      const w = 1 + Math.floor(rng.frac() * 3);
      const h = 1 + Math.floor(rng.frac() * 3);
      g.fillStyle(i % 3 === 0 ? light : stroke, i % 3 === 0 ? 0.14 : 0.1);
      g.fillRect(dx, dy, w, h);
    }

    if (key === 'tile-water') {
      for (let i = 0; i < 6; i++) {
        const y = 4 + i * 4 + rng.frac() * 2;
        const x = 2 + rng.frac() * 6;
        g.lineStyle(1.5, 0xffffff, 0.08 + rng.frac() * 0.05);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 8, y - 1);
        g.lineTo(x + 16, y + 1);
        g.lineTo(x + 24, y);
        g.strokePath();
      }
      for (let i = 0; i < 4; i++) {
        g.fillStyle(0xffffff, 0.05 + rng.frac() * 0.06);
        g.fillCircle(5 + rng.frac() * 22, 5 + rng.frac() * 22, 1.5 + rng.frac() * 1.5);
      }
    } else if (key === 'tile-dirt') {
      for (let i = 0; i < 5; i++) {
        const x = 4 + rng.frac() * 22;
        const y = 4 + rng.frac() * 22;
        g.lineStyle(1, dark, 0.18);
        g.lineBetween(x, y, x + 3 + rng.frac() * 4, y + (rng.frac() - 0.5) * 6);
      }
    } else if (key === 'tile-stone') {
      for (let i = 0; i < 7; i++) {
        const x = 3 + rng.frac() * 24;
        const y = 3 + rng.frac() * 24;
        const s = 2 + rng.frac() * 3;
        g.fillStyle(light, 0.12);
        g.fillRect(x, y, s, s);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const x = 3 + rng.frac() * 24;
        const y = 4 + rng.frac() * 22;
        g.lineStyle(1, highlight, 0.18 + rng.frac() * 0.08);
        g.lineBetween(x, y, x + (rng.frac() - 0.5) * 3, y - 3 - rng.frac() * 5);
      }
      if (key === 'tile-grass-rich') {
        for (let i = 0; i < 3; i++) {
          g.fillStyle(0xf6e27a, 0.18);
          g.fillCircle(5 + rng.frac() * 22, 5 + rng.frac() * 22, 1);
        }
      }
    }

    g.fillStyle(0xffffff, 0.03).fillEllipse(TILE * 0.35, TILE * 0.3, TILE * 0.7, TILE * 0.4);
    g.generateTexture(key, TILE, TILE);
    g.destroy();
  }

  private makeRect(key: string, w: number, h: number, fill: number, stroke: number) {
    const g = this.add.graphics();
    g.fillStyle(fill, 1).fillRect(0, 0, w, h);
    if (w > 6 && h > 6) {
      g.fillStyle(0x000000, 0.2).fillRect(3, h - 3, w - 6, 3);
      g.fillStyle(0xffffff, 0.08).fillRect(2, 2, w - 4, Math.max(2, h * 0.2));
      g.fillStyle(0x000000, 0.12).fillRect(w * 0.55, 0, w * 0.45, h);
    }
    if (w > 2 && h > 2) {
      g.lineStyle(2, stroke, 0.95).strokeRect(1, 1, w - 2, h - 2);
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private makeDetailedTree(key: string, leafColor: number, trunkColor: number) {
    const g = this.add.graphics();
    const cx = 18, cy = 13;

    g.fillStyle(0x000000, 0.3).fillEllipse(cx, 31, 22, 6);
    g.fillStyle(0x000000, 0.18).fillEllipse(cx, 30, 14, 3);

    g.fillStyle(0x2a1a0a, 1).fillRect(cx - 3.2, 15, 6.4, 16);
    g.fillStyle(trunkColor, 1).fillRect(cx - 3, 15, 6, 16);
    g.fillStyle(0x3a2412, 1).fillRect(cx - 3, 15, 2, 16);
    g.fillStyle(0x8c5e2c, 0.7).fillRect(cx + 1, 15, 1.5, 16);
    g.lineStyle(0.7, 0x22140a, 0.75);
    g.lineBetween(cx - 1, 18, cx + 1.5, 23);
    g.lineBetween(cx - 2, 25, cx + 0.5, 30);
    g.lineBetween(cx + 1, 20, cx - 0.5, 26);
    g.fillStyle(0x22140a, 0.8).fillEllipse(cx - 1, 22, 2, 1.2);
    g.fillStyle(0x22140a, 1).fillEllipse(cx, 30.5, 7, 2);
    g.fillStyle(trunkColor, 1).fillEllipse(cx, 30.5, 5, 1.4);

    const leafDark = Phaser.Display.Color.IntegerToColor(leafColor).darken(32).color;
    const leafLight = Phaser.Display.Color.IntegerToColor(leafColor).lighten(22).color;
    const leafMid = Phaser.Display.Color.IntegerToColor(leafColor).lighten(8).color;

    g.fillStyle(leafDark, 0.7).fillCircle(cx + 2, cy + 3, 13);
    g.fillStyle(leafColor, 1).fillCircle(cx, cy, 12);
    g.fillStyle(leafDark, 0.55).fillCircle(cx + 5, cy + 2, 9);
    g.fillStyle(leafMid, 1).fillCircle(cx - 6, cy - 1, 7.5);
    g.fillStyle(leafMid, 1).fillCircle(cx + 6, cy - 3, 7);
    g.fillStyle(leafColor, 1).fillCircle(cx - 1, cy - 6, 7);
    g.fillStyle(leafLight, 0.9).fillCircle(cx - 4, cy - 6, 5);
    g.fillStyle(leafLight, 0.75).fillCircle(cx + 4, cy - 7, 4);
    g.fillStyle(leafLight, 0.6).fillCircle(cx - 2, cy - 9, 3);

    g.fillStyle(leafDark, 0.55).fillEllipse(cx + 3, cy + 7, 14, 5);

    g.fillStyle(0xffffff, 0.32).fillEllipse(cx - 5, cy - 7, 4, 2.5);
    g.fillStyle(0xffffff, 0.2).fillEllipse(cx + 2, cy - 8, 3, 1.6);

    g.fillStyle(0xb91c1c, 0.85).fillCircle(cx - 7, cy + 1, 0.9);
    g.fillStyle(0xb91c1c, 0.85).fillCircle(cx + 7, cy - 4, 0.9);
    g.fillStyle(0xb91c1c, 0.85).fillCircle(cx + 2, cy - 2, 0.9);
    g.fillStyle(0xef4444, 0.6).fillCircle(cx - 7.2, cy + 0.7, 0.4);

    g.lineStyle(0.8, 0x0d1f0a, 0.3).strokeCircle(cx, cy, 12.3);
    g.lineStyle(0.6, 0x0d1f0a, 0.25).strokeCircle(cx + 6, cy - 3, 7.2);
    g.lineStyle(0.6, 0x0d1f0a, 0.25).strokeCircle(cx - 6, cy - 1, 7.7);
    g.generateTexture(key, 36, 34);
    g.destroy();
  }

  private makeDetailedGoldmine(key: string, goldColor: number, rockColor: number) {
    const g = this.add.graphics();

    g.fillStyle(0x000000, 0.36).fillEllipse(19, 32, 34, 6);

    const rockDark = Phaser.Display.Color.IntegerToColor(rockColor).darken(25).color;
    const rockLight = Phaser.Display.Color.IntegerToColor(rockColor).lighten(18).color;

    g.fillStyle(rockDark, 1).fillRoundedRect(0, 4, 38, 28, { tl: 10, tr: 10, bl: 3, br: 3 });
    g.fillStyle(rockColor, 1).fillRoundedRect(1, 5, 36, 26, { tl: 9, tr: 9, bl: 2, br: 2 });
    g.fillStyle(rockDark, 0.85).fillRoundedRect(20, 5, 17, 26, { tl: 0, tr: 9, bl: 0, br: 2 });
    g.fillStyle(rockLight, 0.35).fillRoundedRect(2, 6, 14, 9, { tl: 8, tr: 4, bl: 0, br: 0 });
    g.fillStyle(0xffffff, 0.12).fillEllipse(9, 9, 10, 4);

    g.lineStyle(0.8, 0x1a0e06, 0.65);
    g.lineBetween(7, 6, 10, 13);
    g.lineBetween(28, 7, 25, 15);
    g.lineBetween(32, 17, 29, 24);
    g.lineBetween(5, 19, 8, 25);

    g.fillStyle(rockLight, 0.3).fillCircle(10, 8, 2.5);
    g.fillStyle(rockLight, 0.3).fillCircle(26, 10, 3);
    g.fillStyle(rockDark, 0.6).fillCircle(33, 13, 2.5);
    g.fillStyle(rockDark, 0.6).fillCircle(6, 22, 2);

    const cex = 19, cey = 22;
    g.fillStyle(0x080604, 1).fillRoundedRect(cex - 10, cey - 6, 20, 18, { tl: 9, tr: 9, bl: 0, br: 0 });
    g.fillStyle(0x1a1208, 1).fillRoundedRect(cex - 9, cey - 5, 18, 17, { tl: 8, tr: 8, bl: 0, br: 0 });
    g.fillStyle(0xfff1a8, 0.14).fillEllipse(cex, cey + 3, 14, 9);
    g.fillStyle(0xfff1a8, 0.22).fillEllipse(cex, cey + 6, 10, 5);
    g.fillStyle(0xfacc15, 0.15).fillEllipse(cex, cey + 5, 7, 3);

    g.fillStyle(0x3a2412, 1).fillRect(cex - 11, cey - 6, 3, 18);
    g.fillStyle(0x6e4a1e, 1).fillRect(cex - 11, cey - 6, 2, 18);
    g.fillStyle(0x4a2f1a, 0.8).fillRect(cex - 9, cey - 6, 0.8, 18);
    g.fillStyle(0x3a2412, 1).fillRect(cex + 8, cey - 6, 3, 18);
    g.fillStyle(0x6e4a1e, 1).fillRect(cex + 9, cey - 6, 2, 18);
    g.fillStyle(0x3a2412, 1).fillRect(cex - 12, cey - 8, 24, 3);
    g.fillStyle(0x6e4a1e, 1).fillRect(cex - 12, cey - 8, 24, 1.5);
    g.fillStyle(0x22140a, 1).fillRect(cex - 12, cey - 5.5, 24, 0.8);
    g.fillStyle(0x2a1a0e, 1).fillCircle(cex - 10, cey - 6.5, 1.2);
    g.fillStyle(0x2a1a0e, 1).fillCircle(cex + 10, cey - 6.5, 1.2);
    g.fillStyle(0x2a1a0e, 1).fillCircle(cex - 10, cey + 10, 1);
    g.fillStyle(0x2a1a0e, 1).fillCircle(cex + 10, cey + 10, 1);

    g.fillStyle(0xca8a04, 1).fillRect(cex - 7, cey + 10, 14, 2);
    g.fillStyle(0xfacc15, 1).fillCircle(cex - 4.5, cey + 9, 2.5);
    g.fillStyle(0xfacc15, 1).fillCircle(cex + 0.5, cey + 9.5, 2.8);
    g.fillStyle(0xfacc15, 1).fillCircle(cex + 5, cey + 9, 2.2);
    g.fillStyle(goldColor, 1).fillCircle(cex - 4.5, cey + 9, 1.8);
    g.fillStyle(goldColor, 1).fillCircle(cex + 0.5, cey + 9.5, 2.1);
    g.fillStyle(goldColor, 1).fillCircle(cex + 5, cey + 9, 1.6);
    g.fillStyle(0xfff1a8, 0.85).fillCircle(cex - 5.2, cey + 8.3, 0.8);
    g.fillStyle(0xfff1a8, 0.85).fillCircle(cex - 0.3, cey + 8.8, 0.9);
    g.fillStyle(0xfff1a8, 0.7).fillCircle(cex + 4.4, cey + 8.4, 0.7);

    g.fillStyle(goldColor, 0.9).fillRect(5, 10, 4, 1.4);
    g.fillStyle(0xfff1a8, 0.7).fillRect(5, 10, 4, 0.5);
    g.fillStyle(goldColor, 0.75).fillRect(10, 9, 2.5, 1);
    g.fillStyle(goldColor, 0.9).fillRect(28, 12, 4, 1.4);
    g.fillStyle(0xfff1a8, 0.7).fillRect(28, 12, 4, 0.5);
    g.fillStyle(goldColor, 0.7).fillRect(31, 18, 3, 1);
    g.fillStyle(goldColor, 0.65).fillRect(14, 6, 2, 1);
    g.fillStyle(goldColor, 0.7).fillRect(4, 24, 2, 1);

    g.fillStyle(0x4a2f1a, 1).fillRect(cex + 11, cey + 3, 1.5, 9);
    g.fillStyle(0x6e4a1e, 0.8).fillRect(cex + 11, cey + 3, 0.6, 9);
    g.fillStyle(0x9aa6b3, 1).fillRect(cex + 8, cey + 1, 7, 2);
    g.fillStyle(0xc8d2dc, 0.85).fillRect(cex + 8, cey + 1, 7, 0.8);
    g.fillStyle(0x4f5a64, 0.7).fillRect(cex + 8, cey + 2.5, 7, 0.5);
    g.fillStyle(0x2a3038, 1).fillTriangle(cex + 7.5, cey + 0.8, cex + 7.5, cey + 3, cex + 5.5, cey + 1.9);

    g.fillStyle(0xffffff, 0.9).fillCircle(cex - 3, cey + 4, 0.6);
    g.fillStyle(0xffffff, 0.75).fillCircle(cex + 3, cey + 6, 0.5);
    g.fillStyle(0xffffff, 0.6).fillCircle(cex + 6, cey + 3, 0.4);
    g.fillStyle(0xffe39e, 0.85).fillCircle(cex - 1, cey + 7, 0.5);

    g.lineStyle(1.2, 0x22140a, 0.85).strokeRoundedRect(1, 5, 36, 26, { tl: 9, tr: 9, bl: 2, br: 2 });
    g.generateTexture(key, 38, 36);
    g.destroy();
  }
}
