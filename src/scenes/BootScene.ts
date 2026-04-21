import Phaser from 'phaser';
import { TILE } from '../config';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    this.cameras.main.setBackgroundColor('#08110f');

    this.makeTile('tile-grass', 0x315f35, 0x1e4124, 0x5b9962, 14);
    this.makeTile('tile-dirt', 0x7e5b35, 0x5a3d1f, 0xb58a5e, 10);
    this.makeTile('tile-water', 0x1f5d8b, 0x123c62, 0x67b6e9, 14);
    this.makeTile('tile-stone', 0x59626a, 0x353c44, 0x9ba6af, 9);
    this.makeTile('tile-grass-rich', 0x28592f, 0x17371d, 0x70b46d, 16);

    this.makeCircle('unit-peasant', 10, 0xf5d76e, 0xffffff);
    this.makeCircle('unit-footman', 12, 0xc0c0c0, 0xffffff);
    this.makeCircle('unit-archer', 11, 0x8ee06b, 0xffffff);

    this.makeRect('res-tree', 28, 28, 0x2f5f28, 0x183115);
    this.makeRect('res-goldmine', 30, 30, 0xe6b800, 0x8a6a00);

    this.makeRect('bld-townhall', TILE * 3 - 4, TILE * 3 - 4, 0xb89b6b, 0x5c4a2a);
    this.makeRect('bld-barracks', TILE * 3 - 4, TILE * 3 - 4, 0x9a6a4a, 0x4a2f1a);
    this.makeRect('bld-farm', TILE * 2 - 4, TILE * 2 - 4, 0xd6b76a, 0x7a5f2a);
    this.makeRect('bld-tower', TILE * 2 - 4, TILE * 2 - 4, 0x8e9eab, 0x4a556a);

    this.makeRect('pixel', 1, 1, 0xffffff, 0xffffff);

    this.makeDetailedBuilding('bld-townhall-player-d', TILE * 3, TILE * 3, 0xcab89a, 0x576ea7, 0x2a3b68);
    this.makeDetailedBuilding('bld-townhall-enemy-d', TILE * 3, TILE * 3, 0xbe9784, 0x8b4335, 0x4d1f1a);
    this.makeDetailedBuilding('bld-barracks-player-d', TILE * 3, TILE * 3, 0xa5afb8, 0x4d6897, 0x29385b);
    this.makeDetailedBuilding('bld-barracks-enemy-d', TILE * 3, TILE * 3, 0x9b7a69, 0x7b3227, 0x391813);
    this.makeDetailedBuilding('bld-farm-player-d', TILE * 2, TILE * 2, 0xd9c793, 0xb79a38, 0x6c5629);
    this.makeDetailedBuilding('bld-farm-enemy-d', TILE * 2, TILE * 2, 0xc6a178, 0x9a672f, 0x573116);
    this.makeDetailedTower('bld-tower-player-d', TILE * 2, TILE * 2, 0x72839b, 0x35518a);
    this.makeDetailedTower('bld-tower-enemy-d', TILE * 2, TILE * 2, 0x7d6e66, 0x8a352e);

    this.makeDetailedUnit('unit-peasant-player-d', 10, 0xdfc978, 0x82714b, 0xffffff);
    this.makeDetailedUnit('unit-peasant-enemy-d', 10, 0xcf9669, 0x7a4330, 0xffffff);
    this.makeDetailedUnit('unit-footman-player-d', 12, 0xcfd8e4, 0x5a6f95, 0xffffff);
    this.makeDetailedUnit('unit-footman-enemy-d', 12, 0x9aa1ac, 0x5d3131, 0xffffff);
    this.makeDetailedUnit('unit-archer-player-d', 11, 0x7fc78e, 0x2f5a64, 0xffffff);
    this.makeDetailedUnit('unit-archer-enemy-d', 11, 0x98a65c, 0x5f2e2e, 0xffffff);

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

  private makeCircle(key: string, r: number, fill: number, stroke: number) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.2).fillEllipse(r + 1, r * 2 + 1, r * 1.6, r * 0.5);
    g.fillStyle(fill, 1).fillCircle(r + 1, r + 1, r);
    g.fillStyle(0xffffff, 0.12).fillCircle(r - 1, r - 1, r * 0.45);
    g.lineStyle(2, stroke, 1).strokeCircle(r + 1, r + 1, r);
    g.generateTexture(key, (r + 1) * 2, (r + 1) * 2 + 6);
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

  private makeDetailedBuilding(key: string, w: number, h: number, wallColor: number, roofColor: number, borderColor: number) {
    const g = this.add.graphics();
    const isFarm = key.includes('farm');
    const isBarracks = key.includes('barracks');
    const isTownhall = key.includes('townhall');
    const isPlayerVariant = key.includes('-player-');
    const factionColor = isPlayerVariant ? 0x3b82f6 : 0xef4444;
    const factionLight = Phaser.Display.Color.IntegerToColor(factionColor).lighten(20).color;
    const factionDark = Phaser.Display.Color.IntegerToColor(factionColor).darken(24).color;

    const wallDark = Phaser.Display.Color.IntegerToColor(wallColor).darken(22).color;
    const wallLight = Phaser.Display.Color.IntegerToColor(wallColor).lighten(14).color;
    const roofDark = Phaser.Display.Color.IntegerToColor(roofColor).darken(28).color;
    const roofLight = Phaser.Display.Color.IntegerToColor(roofColor).lighten(12).color;

    g.fillStyle(0x000000, 0.38).fillEllipse(w * 0.5, h - 2, w * 0.96, 11);

    const foundationY = h * 0.78;
    const foundationH = h * 0.15;
    g.fillStyle(0x3e4148, 1).fillRect(2, foundationY, w - 4, foundationH);
    g.fillStyle(0x5b6069, 1).fillRect(2, foundationY, w - 4, 3);
    g.fillStyle(0x26282d, 0.6).fillRect(2, foundationY + foundationH - 2.5, w - 4, 2.5);
    for (let row = 0; row < 2; row++) {
      const y = foundationY + 3 + row * (foundationH - 3) * 0.5;
      const offset = (row % 2) * (w / 10);
      g.lineStyle(1, 0x22252a, 0.7);
      for (let c = 0; c <= 6; c++) {
        const bx = 2 + offset + c * (w - 4) / 6;
        if (bx > 2 && bx < w - 2) g.lineBetween(bx, y, bx, y + (foundationH - 3) * 0.5);
      }
      g.lineBetween(2, y, w - 2, y);
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0x8a919a, 0.3);
      g.fillRect(4 + (i * (w - 8) / 6) + 1, foundationY + 2, 2, 1);
    }

    const wallTop = h * 0.34;
    const wallH = foundationY - wallTop;
    g.fillStyle(wallColor, 1).fillRect(4, wallTop, w - 8, wallH);
    g.fillStyle(wallLight, 0.25).fillRect(4, wallTop, w - 8, wallH * 0.2);
    g.fillStyle(0xffffff, 0.05).fillRect(6, wallTop + 2, w * 0.24, wallH * 0.72);
    g.fillStyle(0x000000, 0.22).fillRect(w * 0.62, wallTop, w * 0.38, wallH);
    g.fillStyle(0x000000, 0.12).fillRect(4, wallTop + wallH * 0.72, w - 8, wallH * 0.28);
    const plankW = w < 80 ? 6 : 7;
    const plankCount = Math.floor((w - 8) / plankW);
    for (let i = 1; i < plankCount; i++) {
      g.lineStyle(1, wallDark, 0.55);
      g.lineBetween(4 + i * plankW, wallTop + 1, 4 + i * plankW, foundationY - 1);
    }
    for (let i = 0; i < plankCount; i += 2) {
      const x = 4 + i * plankW + 1;
      g.fillStyle(0xffffff, 0.06).fillRect(x, wallTop + wallH * 0.3, plankW - 2, 1);
    }

    if (isTownhall || isBarracks) {
      const beam = 0x3a2411;
      g.fillStyle(beam, 1).fillRect(4, wallTop, w - 8, 3);
      g.fillStyle(beam, 1).fillRect(4, wallTop + wallH - 4, w - 8, 3);
      g.fillStyle(beam, 1).fillRect(4, wallTop, 3, wallH);
      g.fillStyle(beam, 1).fillRect(w - 7, wallTop, 3, wallH);
      g.fillStyle(beam, 1).fillRect(w * 0.5 - 1.5, wallTop, 3, wallH);
      g.fillStyle(0x6a4420, 0.5).fillRect(4, wallTop, w - 8, 1);
      g.fillStyle(0x6a4420, 0.5).fillRect(4, wallTop, 1, wallH);
      for (let i = 0; i < 4; i++) {
        const braceX = 7 + i * ((w - 14) / 3);
        g.lineStyle(1, 0x6a4420, 0.45);
        g.lineBetween(braceX, wallTop + 4, braceX + 3, wallTop + 10);
      }
    }

    const doorW = isFarm ? w * 0.22 : w * 0.18;
    const doorH = wallH * 0.6;
    const doorX = w * 0.5 - doorW * 0.5;
    const doorY = foundationY - doorH;
    g.fillStyle(0x22160a, 1).fillRect(doorX - 1, doorY - 1, doorW + 2, doorH + 1);
    g.fillStyle(0x6b4222, 1).fillRoundedRect(doorX, doorY, doorW, doorH, { tl: Math.min(6, doorW * 0.35), tr: Math.min(6, doorW * 0.35), bl: 0, br: 0 });
    g.fillStyle(0x8b5a2b, 0.7).fillRoundedRect(doorX + 1, doorY + 1, doorW - 2, doorH * 0.35, { tl: 4, tr: 4, bl: 0, br: 0 });
    g.fillStyle(0x22160a, 0.75).fillRect(doorX + doorW * 0.5 - 0.4, doorY + 2, 0.8, doorH - 2);
    for (let i = 1; i < 3; i++) {
      g.fillStyle(0x22160a, 0.55);
      g.fillRect(doorX + (doorW / 3) * i, doorY + 3, 0.7, doorH - 3);
    }
    g.fillStyle(0x2a1a0e, 1).fillRect(doorX, doorY + doorH * 0.48, doorW, 1.2);
    g.fillStyle(0xfacc15, 1).fillCircle(doorX + doorW - 2.5, doorY + doorH * 0.62, 1.3);
    g.fillStyle(0xb45309, 1).fillCircle(doorX + doorW - 2.5, doorY + doorH * 0.62, 0.7);
    g.fillStyle(0x2a1a0e, 0.6).fillRect(doorX - 1, doorY + doorH - 1.5, doorW + 2, 1.5);

    if (!isFarm) {
      const winY = wallTop + wallH * 0.28;
      const winW = w * 0.14;
      const winH = wallH * 0.3;
      for (const side of [-1, 1]) {
        const wx = w * 0.5 + side * w * 0.28 - winW * 0.5;
        g.fillStyle(0x2a1a0e, 1).fillRect(wx - 1.5, winY - 1.5, winW + 3, winH + 3);
        g.fillStyle(0x4a2f1a, 1).fillRect(wx - 1, winY - 1, winW + 2, winH + 2);
        g.fillStyle(0x1a2030, 1).fillRect(wx, winY, winW, winH);
        g.fillStyle(0xffec9c, 0.95).fillRect(wx, winY, winW, winH);
        g.fillStyle(0xfff5c5, 0.55).fillRect(wx, winY, winW, winH * 0.4);
        g.fillStyle(0x2a1a0e, 1).fillRect(wx + winW * 0.5 - 0.5, winY, 1, winH);
        g.fillStyle(0x2a1a0e, 1).fillRect(wx, winY + winH * 0.5 - 0.5, winW, 1);
        g.fillStyle(0x8b5a2b, 1).fillRect(wx - 2.5, winY - 0.5, 1.8, winH + 1);
        g.fillStyle(0x8b5a2b, 1).fillRect(wx + winW + 0.7, winY - 0.5, 1.8, winH + 1);
        g.lineStyle(0.6, 0x4a2f1a, 0.8);
        g.lineBetween(wx - 2.5, winY + winH * 0.3, wx - 0.7, winY + winH * 0.3);
        g.lineBetween(wx + winW + 0.7, winY + winH * 0.3, wx + winW + 2.5, winY + winH * 0.3);
        g.fillStyle(0x3a2412, 1).fillRect(wx - 2, winY + winH + 1, winW + 4, 1.4);
      }
    }

    g.fillStyle(0x2a1a0e, 0.85).fillRect(4, wallTop - 1, w - 8, 2);
    for (let i = 0; i < 7; i++) {
      const rafterX = 8 + i * ((w - 16) / 6);
      g.fillStyle(0x4a2f1a, 0.95).fillRect(rafterX, wallTop - 1, 2, 5);
      g.fillStyle(0x6e4a1e, 0.45).fillRect(rafterX, wallTop - 1, 1, 5);
    }

    const roofPeakY = 2;
    const roofBaseY = wallTop + 1;
    const roofSpan = roofBaseY - roofPeakY;
    g.fillStyle(roofDark, 1).fillTriangle(-1, roofBaseY + 1, w / 2, roofPeakY - 1, w + 1, roofBaseY + 1);
    g.fillStyle(roofColor, 1).fillTriangle(1, roofBaseY, w / 2, roofPeakY, w - 1, roofBaseY);
    g.fillStyle(roofDark, 0.88).fillTriangle(w / 2, roofPeakY, w - 1, roofBaseY, w * 0.5, roofBaseY);
    g.fillStyle(roofLight, 0.28).fillTriangle(1, roofBaseY, w / 2, roofPeakY + 2, w * 0.32, roofBaseY);
    const tileRows = Math.max(3, Math.floor(roofSpan / 6));
    for (let i = 1; i < tileRows; i++) {
      const t = i / tileRows;
      const y = roofBaseY - roofSpan * t;
      const xL = (w / 2) * t + 1;
      const xR = w - (w / 2) * t - 1;
      g.lineStyle(0.9, 0x1a0e06, 0.45);
      g.lineBetween(xL, y, xR, y);
      g.lineStyle(0.6, roofLight, 0.3);
      g.lineBetween(xL, y - 0.7, xR, y - 0.7);
      const tilesPerRow = Math.floor((xR - xL) / 6);
      for (let j = 0; j < tilesPerRow; j++) {
        const tx = xL + j * 6 + ((i % 2) * 3);
        if (tx > xL && tx < xR) {
          g.lineStyle(0.5, 0x1a0e06, 0.35);
          g.lineBetween(tx, y, tx, y - roofSpan / tileRows);
        }
      }
    }
    g.fillStyle(0x22160a, 1).fillRect(0, roofBaseY - 1, w, 2);
    g.fillStyle(0x4a2f1a, 1).fillRect(0, roofBaseY + 1, w, 1);
    g.fillStyle(0xffffff, 0.08).fillEllipse(w * 0.34, roofBaseY - roofSpan * 0.42, w * 0.18, roofSpan * 0.28);
    g.fillStyle(0x000000, 0.1).fillEllipse(w * 0.68, roofBaseY - roofSpan * 0.2, w * 0.22, roofSpan * 0.3);

    if (isTownhall) {
      g.fillStyle(0x4a2f1a, 1).fillRect(w * 0.17, foundationY - 12, 5, 12);
      g.fillStyle(0x6e4a1e, 0.55).fillRect(w * 0.17, foundationY - 12, 1.5, 12);
      g.fillStyle(0x4a2f1a, 1).fillRect(w * 0.78, foundationY - 12, 5, 12);
      g.fillStyle(0x6e4a1e, 0.55).fillRect(w * 0.78, foundationY - 12, 1.5, 12);
      g.fillStyle(0x3a2412, 1).fillRect(w * 0.32, foundationY + 1, w * 0.36, 3);
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0x8a919a, 0.85).fillRect(w * 0.34 + i * (w * 0.1), foundationY + 1, w * 0.08, 1.2);
      }

      g.fillStyle(0x4a4a4a, 1).fillRect(w * 0.18, roofBaseY - 8, 6, 10);
      g.fillStyle(0x2a2a2a, 1).fillRect(w * 0.18, roofBaseY - 8, 6, 1.5);
      g.fillStyle(0x6a6a6a, 1).fillRect(w * 0.18 + 0.5, roofBaseY - 8, 1.5, 10);
      g.fillStyle(0xc0c0c0, 0.55).fillCircle(w * 0.21, roofBaseY - 11, 2.6);
      g.fillStyle(0xc0c0c0, 0.38).fillCircle(w * 0.19, roofBaseY - 15, 3.2);
      g.fillStyle(0xc0c0c0, 0.22).fillCircle(w * 0.23, roofBaseY - 19, 3.8);

      g.fillStyle(0x2a1a0e, 1).fillRect(w / 2 - 0.6, roofPeakY - 10, 1.2, 7);
      g.fillStyle(0xfacc15, 1).fillCircle(w / 2, roofPeakY - 11, 2.4);
      g.fillStyle(0xb45309, 0.9).fillCircle(w / 2, roofPeakY - 11, 1.2);
      g.fillStyle(factionLight, 0.95).fillTriangle(w / 2, roofPeakY - 9, w / 2 + 10, roofPeakY - 7, w / 2, roofPeakY - 4);
      g.fillStyle(0xffffff, 0.32).fillTriangle(w / 2, roofPeakY - 9, w / 2 + 6, roofPeakY - 8, w / 2, roofPeakY - 6);
      g.fillStyle(factionDark, 0.7).fillRect(w / 2, roofPeakY - 4.5, 10, 0.6);

      g.fillStyle(0x2a1a0e, 1).fillTriangle(w * 0.5 - 6, doorY - 1, w * 0.5 + 6, doorY - 1, w * 0.5, doorY - 8);
      g.fillStyle(0xfacc15, 1).fillTriangle(w * 0.5 - 4.5, doorY - 1.5, w * 0.5 + 4.5, doorY - 1.5, w * 0.5, doorY - 6.5);
      g.fillStyle(0xb45309, 1).fillCircle(w * 0.5, doorY - 3.5, 1.4);
      g.fillStyle(0xfff1a8, 0.8).fillCircle(w * 0.5 - 0.5, doorY - 4, 0.6);
      for (const side of [-1, 1]) {
        const torchX = w * 0.5 + side * doorW * 0.95;
        g.fillStyle(0x4a2f1a, 1).fillRect(torchX - 0.7, doorY + 3, 1.4, 5);
        g.fillStyle(0xf97316, 1).fillCircle(torchX, doorY + 2.2, 1.8);
        g.fillStyle(0xfacc15, 1).fillCircle(torchX, doorY + 2.4, 1.05);
        g.fillStyle(0xfffbeb, 0.7).fillCircle(torchX - 0.25, doorY + 1.9, 0.45);
      }
    }

    if (isBarracks) {
      g.fillStyle(0x2a1a0e, 1).fillRect(w * 0.5 - 8, doorY - 8, 16, 3);
      g.fillStyle(0x5b3a26, 1).fillRect(w * 0.5 - 7.5, doorY - 7.7, 15, 2.2);
      g.lineStyle(2, 0xc8d2dc, 1);
      g.lineBetween(w * 0.5 - 6, doorY - 4, w * 0.5 + 6, doorY + 2);
      g.lineBetween(w * 0.5 + 6, doorY - 4, w * 0.5 - 6, doorY + 2);
      g.lineStyle(1, 0x6a7682, 1);
      g.lineBetween(w * 0.5 - 6, doorY - 4, w * 0.5 + 6, doorY + 2);
      g.lineBetween(w * 0.5 + 6, doorY - 4, w * 0.5 - 6, doorY + 2);
      g.fillStyle(0x4a2f1a, 1).fillCircle(w * 0.5 - 6, doorY + 2, 1.4);
      g.fillStyle(0x4a2f1a, 1).fillCircle(w * 0.5 + 6, doorY + 2, 1.4);

      g.fillStyle(0x2a1a0e, 1).fillRect(w / 2 - 0.6, roofPeakY - 10, 1.2, 7);
      g.fillStyle(factionLight, 0.95).fillTriangle(w / 2, roofPeakY - 9, w / 2 + 10, roofPeakY - 7, w / 2, roofPeakY - 4);
      g.fillStyle(0xffffff, 0.3).fillTriangle(w / 2, roofPeakY - 9, w / 2 + 6, roofPeakY - 8, w / 2, roofPeakY - 6);
      g.fillStyle(0xfacc15, 1).fillCircle(w / 2, roofPeakY - 11, 1.6);

      for (const side of [-1, 1]) {
        const tx = w * 0.5 + side * doorW * 1.3;
        g.fillStyle(0x4a2f1a, 1).fillRect(tx - 0.8, doorY + 2, 1.6, doorH * 0.65);
        g.fillStyle(0x6e4a1e, 1).fillRect(tx - 1.5, doorY + doorH * 0.1, 3, 2);
        g.fillStyle(0xf97316, 1).fillCircle(tx, doorY + doorH * 0.05, 2.2);
        g.fillStyle(0xfacc15, 1).fillCircle(tx, doorY + doorH * 0.08, 1.3);
        g.fillStyle(0xfffbbf, 0.8).fillCircle(tx, doorY + doorH * 0.1, 0.6);
      }
      for (const side of [-1, 1]) {
        const rackX = w * 0.5 + side * w * 0.27;
        g.fillStyle(0x4a2f1a, 1).fillRect(rackX - 1, foundationY - 10, 2, 10);
        g.fillStyle(0x6e4a1e, 0.65).fillRect(rackX - 1, foundationY - 10, 0.8, 10);
        g.fillStyle(0x4a2f1a, 1).fillRect(rackX - 5, foundationY - 7, 10, 1.5);
        g.lineStyle(1.2, 0xc8d2dc, 1);
        g.lineBetween(rackX - 4, foundationY - 7, rackX - 1.5, foundationY - 1);
        g.lineBetween(rackX, foundationY - 7, rackX + 2.5, foundationY - 1);
        g.fillStyle(0x8b5a2b, 1).fillEllipse(rackX + side * 2.8, foundationY - 4.5, 4, 5.5);
        g.fillStyle(0xfacc15, 1).fillCircle(rackX + side * 2.8, foundationY - 4.5, 0.8);
      }
    }

    if (isFarm) {
      g.fillStyle(0xd4a03a, 1).fillEllipse(w * 0.22, foundationY - 4, 11, 7);
      g.fillStyle(0xa67826, 0.55).fillEllipse(w * 0.23, foundationY - 3, 9, 5.5);
      g.fillStyle(0xe6bb4c, 1).fillEllipse(w * 0.22, foundationY - 5.5, 9, 5);
      g.lineStyle(0.5, 0x8c5e1a, 0.8);
      for (let i = 0; i < 4; i++) {
        g.lineBetween(w * 0.22 - 5, foundationY - 6 + i * 1.4, w * 0.22 + 5, foundationY - 6 + i * 1.4);
      }
      g.fillStyle(0x8c5e1a, 1).fillRect(w * 0.22 - 5.5, foundationY - 7, 11, 0.9);
      g.fillStyle(0x8c5e1a, 1).fillRect(w * 0.22 - 5.5, foundationY - 1.5, 11, 0.9);

      g.fillStyle(0x4a2f1a, 1).fillRect(w * 0.82, foundationY - 14, 1.3, 14);
      g.fillStyle(0x6e4a1e, 1).fillRect(w * 0.82, foundationY - 14, 0.6, 14);
      g.fillStyle(0xc8d2dc, 1).fillTriangle(w * 0.82 - 2, foundationY - 16, w * 0.82 + 3, foundationY - 16, w * 0.82 + 0.5, foundationY - 13);
      g.fillStyle(0x6a7682, 0.6).fillTriangle(w * 0.82 + 0.5, foundationY - 15.5, w * 0.82 + 3, foundationY - 16, w * 0.82 + 0.5, foundationY - 13);
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0xc8d2dc, 1).fillRect(w * 0.82 - 1.5 + i * 1.5, foundationY - 16, 0.7, 2);
      }

      g.lineStyle(1, 0xca8a04, 0.9);
      for (let i = 0; i < 6; i++) {
        const sx = w * 0.5 + (i - 2.5) * 3.2;
        const bend = (i % 2 ? -1 : 1);
        g.lineBetween(sx, foundationY - 1, sx + bend, foundationY - 8);
        g.fillStyle(0xfde047, 1).fillCircle(sx + bend * 0.5, foundationY - 9, 1.4);
        g.fillStyle(0xfef9a3, 0.7).fillCircle(sx + bend * 0.5 - 0.3, foundationY - 9.3, 0.7);
      }

      g.fillStyle(0xffffff, 1).fillCircle(w * 0.62, foundationY - 4, 2.8);
      g.fillStyle(0xffe39e, 1).fillRect(w * 0.62 + 1.5, foundationY - 4.5, 2, 1.2);
      g.fillStyle(0xd97706, 1).fillTriangle(w * 0.62 + 3.5, foundationY - 4.3, w * 0.62 + 5, foundationY - 4, w * 0.62 + 3.5, foundationY - 3.7);
      g.fillStyle(0xef4444, 1).fillRect(w * 0.62 - 1.2, foundationY - 2.8, 1, 1.3);

      g.fillStyle(0x2a1a0e, 1).fillRect(w / 2 - 0.4, roofPeakY - 6, 0.8, 4);
      g.fillStyle(0x6e4a1e, 1).fillTriangle(w / 2, roofPeakY - 6, w / 2 + 6, roofPeakY - 4.5, w / 2, roofPeakY - 3);
      const plotX = w * 0.14;
      const plotY = foundationY - 1;
      g.fillStyle(0x6b4a1f, 1).fillRect(plotX, plotY, 12, 6);
      for (let i = 0; i < 4; i++) {
        g.lineStyle(0.7, 0x8c5e1a, 0.85);
        g.lineBetween(plotX + 1 + i * 3, plotY + 0.4, plotX + 1 + i * 3, plotY + 5.5);
      }
      g.lineStyle(0.7, 0x2a1a0e, 0.8);
      g.lineBetween(plotX, plotY + 1.5, plotX + 12, plotY + 1.5);
      g.lineBetween(plotX, plotY + 4, plotX + 12, plotY + 4);
      g.fillStyle(0xc9a86a, 1).fillEllipse(w * 0.78, foundationY - 3.2, 6, 4.5);
      g.fillStyle(0xe7c487, 0.7).fillEllipse(w * 0.75, foundationY - 3.8, 3, 2);
    }

    g.lineStyle(1.2, 0xffffff, 0.05).strokeRect(3.5, 3.5, w - 7, h - 7);
    g.lineStyle(1.8, borderColor, 0.95).strokeRect(2, 2, w - 4, h - 4);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private makeDetailedTower(key: string, w: number, h: number, stoneBase: number, factionColor: number) {
    const g = this.add.graphics();
    const stoneDark = Phaser.Display.Color.IntegerToColor(stoneBase).darken(22).color;
    const stoneMid = stoneBase;
    const stoneShade = Phaser.Display.Color.IntegerToColor(stoneBase).darken(10).color;
    const stoneLight = Phaser.Display.Color.IntegerToColor(stoneBase).lighten(18).color;
    const factionLight = Phaser.Display.Color.IntegerToColor(factionColor).lighten(18).color;
    const factionDark = Phaser.Display.Color.IntegerToColor(factionColor).darken(24).color;

    g.fillStyle(0x000000, 0.42).fillEllipse(w * 0.5, h - 2, w * 0.8, 9);

    const bx = w * 0.18;
    const bw = w * 0.64;
    const by = h * 0.82;
    const bh = h * 0.12;
    g.fillStyle(stoneDark, 1).fillRect(bx, by, bw, bh);
    g.fillStyle(stoneShade, 1).fillRect(bx, by, bw, 2);
    g.fillStyle(0x1e2024, 0.7).fillRect(bx, by + bh - 1.5, bw, 1.5);
    g.lineStyle(0.8, 0x1e2024, 0.75);
    for (let i = 1; i < 5; i++) {
      g.lineBetween(bx + i * bw / 5, by + 2, bx + i * bw / 5, by + bh);
    }

    const tx = w * 0.24;
    const tw = w * 0.52;
    const ty = h * 0.22;
    const th = by - ty;
    g.fillStyle(stoneMid, 1).fillRect(tx, ty, tw, th);
    g.fillStyle(stoneShade, 1).fillRect(tx + tw * 0.6, ty, tw * 0.4, th);
    g.fillStyle(stoneLight, 0.3).fillRect(tx, ty, tw * 0.3, th);
    g.fillStyle(0x3d454c, 0.6).fillRect(tx + tw - 3, ty, 3, th);

    const brickH = 4.5;
    const brickRows = Math.floor(th / brickH);
    for (let r = 0; r < brickRows; r++) {
      const y = ty + r * brickH;
      g.lineStyle(0.7, 0x2a3038, 0.75);
      g.lineBetween(tx, y, tx + tw, y);
      const offset = (r % 2) * (tw / 8);
      for (let c = 0; c <= 5; c++) {
        const bricX = tx + offset + c * (tw / 4);
        if (bricX > tx + 0.5 && bricX < tx + tw - 0.5) {
          g.lineBetween(bricX, y, bricX, y + brickH);
        }
      }
      for (let c = 0; c < 4; c++) {
        const bricX = tx + offset + c * (tw / 4) + (tw / 8);
        if (bricX < tx + tw) {
          g.fillStyle(0xffffff, 0.05).fillRect(bricX, y + 0.8, 1, 0.6);
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const sx = tx + tw * 0.32 + i * tw * 0.26;
      const sy = ty + th * 0.25;
      g.fillStyle(0x0d0f12, 1).fillRect(sx, sy, 2, th * 0.2);
      g.fillStyle(0x0d0f12, 1).fillCircle(sx + 1, sy, 1.2);
      g.fillStyle(0x4a2f1a, 0.6).fillRect(sx - 0.5, sy - 1.5, 3, 1);
    }

    const doorW = tw * 0.28;
    const doorH = th * 0.22;
    const doorX = tx + (tw - doorW) * 0.5;
    const doorY = ty + th - doorH;
    g.fillStyle(0x22160a, 1).fillRect(doorX - 1, doorY - 1, doorW + 2, doorH + 1);
    g.fillStyle(0x5b3a26, 1).fillRoundedRect(doorX, doorY, doorW, doorH, { tl: 3, tr: 3, bl: 0, br: 0 });
    g.fillStyle(0x2a1a0e, 0.8).fillRect(doorX + doorW * 0.5 - 0.4, doorY + 1, 0.8, doorH - 1);
    g.fillStyle(0xfacc15, 1).fillCircle(doorX + doorW - 2, doorY + doorH * 0.5, 0.9);

    const merlonW = tw / 5;
    const merlonH = 5;
    g.fillStyle(0x3a3d42, 1).fillRect(tx - 2, ty - 1, tw + 4, 2);
    g.fillStyle(stoneMid, 1).fillRect(tx - 2, ty - 3, tw + 4, 2);
    g.fillStyle(stoneLight, 0.15).fillRect(tx - 2, ty - 3, tw * 0.38, 2);
    for (let i = 0; i < 5; i++) {
      const mx = tx - 2 + i * (tw + 4) / 5;
      const mw = (tw + 4) / 5 * 0.55;
      g.fillStyle(stoneLight, 1).fillRect(mx, ty - 3 - merlonH, mw, merlonH);
      g.fillStyle(stoneShade, 0.6).fillRect(mx + mw * 0.6, ty - 3 - merlonH, mw * 0.4, merlonH);
      g.fillStyle(0xffffff, 0.18).fillRect(mx, ty - 3 - merlonH, mw * 0.4, 1);
      g.lineStyle(0.6, 0x2a3038, 0.6);
      g.lineBetween(mx, ty - 3 - merlonH + merlonH * 0.5, mx + mw, ty - 3 - merlonH + merlonH * 0.5);
    }

    g.fillStyle(0x4a2f1a, 1).fillRect(tx, ty + th * 0.6, tw, 1.5);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(0x6e4a1e, 1).fillRect(tx + i * tw / 5, ty + th * 0.6, 1, 3);
    }
    g.fillStyle(0x4a2f1a, 1).fillRect(tx - 4, ty + th * 0.46, 4, 2.6);
    g.fillStyle(0x6e4a1e, 0.7).fillRect(tx - 4, ty + th * 0.46, 4, 0.8);
    g.fillStyle(0x4a2f1a, 1).fillRect(tx + tw, ty + th * 0.46, 4, 2.6);
    g.fillStyle(0x6e4a1e, 0.7).fillRect(tx + tw, ty + th * 0.46, 4, 0.8);
    g.lineStyle(1, 0x8b5a2b, 0.85);
    g.lineBetween(tx - 4, ty + th * 0.46, tx - 6, ty + th * 0.32);
    g.lineBetween(tx + tw + 4, ty + th * 0.46, tx + tw + 6, ty + th * 0.32);
    g.fillStyle(0xf97316, 1).fillCircle(tx - 5.6, ty + th * 0.29, 1.2);
    g.fillStyle(0xfacc15, 1).fillCircle(tx - 5.6, ty + th * 0.29, 0.7);
    g.fillStyle(0xf97316, 1).fillCircle(tx + tw + 5.6, ty + th * 0.29, 1.2);
    g.fillStyle(0xfacc15, 1).fillCircle(tx + tw + 5.6, ty + th * 0.29, 0.7);

    g.fillStyle(0x2a1a0e, 1).fillRect(w * 0.5 - 0.6, 2, 1.2, ty - 5);
    g.fillStyle(0xfacc15, 1).fillCircle(w * 0.5, 2, 1.4);
    g.fillStyle(factionLight, 0.95).fillTriangle(w * 0.5, 3, w * 0.5 + 9, 5, w * 0.5, 8);
    g.fillStyle(0xffffff, 0.28).fillTriangle(w * 0.5, 3, w * 0.5 + 5, 4, w * 0.5, 6);
    g.fillStyle(factionDark, 0.8).fillRect(w * 0.5, 7.5, 9, 0.6);

    g.lineStyle(1.4, 0x2a3038, 0.9).strokeRect(tx, ty, tw, th);
    g.lineStyle(1, 0x2a3038, 0.9).strokeRect(bx, by, bw, bh);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private makeDetailedUnit(key: string, r: number, bodyColor: number, darkColor: number, strokeColor: number) {
    const size = (r + 1) * 2 + 8;
    const cx = size / 2;
    const cy = size / 2;
    const g = this.add.graphics();

    const skin = 0xf2c79b;
    const skinShade = 0xc99a6f;
    const isPeasant = key.includes('peasant');
    const isFootman = key.includes('footman');
    const isArcher = key.includes('archer');
    const isPlayerVariant = key.includes('-player-');
    const factionColor = isPlayerVariant ? 0x3b82f6 : 0xef4444;
    const factionLight = Phaser.Display.Color.IntegerToColor(factionColor).lighten(20).color;
    const factionDark = Phaser.Display.Color.IntegerToColor(factionColor).darken(24).color;

    g.fillStyle(0x000000, 0.32).fillEllipse(cx, cy + r + 2.8, r * 2.0, r * 0.55);
    g.fillStyle(0xffffff, 0.05).fillEllipse(cx - r * 0.15, cy + 1.2, r * 1.35, r * 0.8);

    g.fillStyle(bodyColor, 1).fillEllipse(cx, cy + 2, r * 1.75, r * 1.9);
    g.fillStyle(darkColor, 0.55).fillEllipse(cx + r * 0.3, cy + 2.4, r * 1.3, r * 1.7);
    g.fillStyle(0xffffff, 0.22).fillEllipse(cx - r * 0.35, cy - r * 0.35, r * 0.9, r * 0.55);
    g.fillStyle(0x000000, 0.3).fillEllipse(cx, cy + r * 0.85, r * 1.55, r * 0.45);

    g.fillStyle(0x22160a, 0.9).fillRect(cx - r * 0.9, cy + r * 0.35, r * 1.8, 2.2);
    g.fillStyle(0xc7a45e, 1).fillRect(cx - 2.2, cy + r * 0.35, 4.4, 2.2);
    g.fillStyle(0x6a4420, 1).fillRect(cx - 1.6, cy + r * 0.38, 3.2, 1.5);
    g.fillStyle(0x4a2f1a, 1).fillRect(cx - r * 0.56, cy + r * 0.9, 1.6, r * 0.72);
    g.fillStyle(0x4a2f1a, 1).fillRect(cx + r * 0.2, cy + r * 0.9, 1.6, r * 0.72);
    g.fillStyle(0x2a1a0e, 0.7).fillRect(cx - r * 0.6, cy + r * 1.48, 2, 1.1);
    g.fillStyle(0x2a1a0e, 0.7).fillRect(cx + r * 0.16, cy + r * 1.48, 2, 1.1);

    const headR = r * 0.55;
    const headY = cy - r * 0.85;
    g.fillStyle(skin, 1).fillCircle(cx, headY, headR);
    g.fillStyle(skinShade, 0.55).fillCircle(cx + headR * 0.42, headY + headR * 0.25, headR * 0.75);
    g.fillStyle(0xffffff, 0.25).fillCircle(cx - headR * 0.3, headY - headR * 0.3, headR * 0.35);

    if (isPeasant) {
      const hatY = headY - headR * 0.55;
      g.fillStyle(0x6e4a1e, 1).fillEllipse(cx, hatY + 1, headR * 2.4, headR * 0.7);
      g.fillStyle(0xc59342, 1).fillEllipse(cx, hatY, headR * 2.2, headR * 0.55);
      g.fillStyle(0x7a5420, 0.5).fillEllipse(cx + headR * 0.3, hatY + 0.2, headR * 1.4, headR * 0.4);
      g.fillStyle(0xe6b76a, 1).fillEllipse(cx, hatY - headR * 0.45, headR * 1.1, headR * 0.55);
      g.fillStyle(0xa97228, 0.5).fillEllipse(cx + headR * 0.15, hatY - headR * 0.35, headR * 0.7, headR * 0.35);
      g.lineStyle(0.5, 0x6e4a1e, 0.75);
      for (let i = 0; i < 5; i++) {
        const sx = cx - headR * 1.0 + i * headR * 0.5;
        g.lineBetween(sx, hatY - 0.5, sx + 0.5, hatY + 0.8);
      }

      g.fillStyle(0x111111, 1).fillRect(cx - headR * 0.45, headY - 0.5, 1.5, 1.5);
      g.fillStyle(0x111111, 1).fillRect(cx + headR * 0.15, headY - 0.5, 1.5, 1.5);
      g.fillStyle(0x4a2412, 0.7).fillRect(cx - 0.8, headY + headR * 0.35, 1.6, 0.7);

      g.fillStyle(0xa56a2f, 0.8).fillEllipse(cx, cy + r * 0.05, r * 1.45, r * 0.65);
      g.fillStyle(0x6e4a1e, 0.5).fillRect(cx - r * 0.55, cy + r * 0.05, r * 1.1, 0.8);
      g.fillStyle(factionColor, 0.9).fillRect(cx - 1.1, cy + r * 0.12, 2.2, 1);
      g.fillStyle(factionLight, 0.8).fillRect(cx - 0.8, cy + r * 0.12, 0.8, 1);

      const pX = cx + r * 1.05;
      const pY = cy - r * 0.25;
      g.fillStyle(0x4a2f1a, 1).fillRect(pX - 0.9, pY, 1.8, r * 1.15);
      g.fillStyle(0x6e4a1e, 0.7).fillRect(pX - 0.9, pY, 0.6, r * 1.15);
      g.fillStyle(0x9aa6b3, 1).fillRect(pX - 4.5, pY - 2.3, 10, 3.2);
      g.fillStyle(0xc8d2dc, 0.8).fillRect(pX - 4.5, pY - 2.3, 10, 1);
      g.fillStyle(0x4f5a64, 0.6).fillRect(pX - 4.5, pY + 0.5, 10, 0.7);
      g.fillStyle(0x2a3038, 1).fillTriangle(pX - 4.8, pY - 2.5, pX - 4.8, pY + 0.9, pX - 6.5, pY - 0.8);
      g.fillStyle(0x6a4420, 1).fillRect(pX + 4.5, pY - 2.3, 2, 3.2);

      g.fillStyle(0x8c6225, 1).fillEllipse(cx - r * 0.95, cy + r * 0.35, r * 0.55, r * 0.7);
      g.fillStyle(0x2a1a0e, 0.55).fillEllipse(cx - r * 0.85, cy + r * 0.6, r * 0.42, r * 0.22);
      g.fillStyle(0x4a2f1a, 0.9).fillRect(cx - r * 1.1, cy + r * 0.0, r * 0.3, 1.5);
      g.fillStyle(0xffe0b0, 1).fillCircle(cx - r * 0.85, cy - r * 0.2, r * 0.18);
      g.fillStyle(factionLight, 0.88).fillEllipse(cx - r * 0.15, cy + r * 1.12, r * 0.52, r * 0.3);
    } else if (isFootman) {
      g.fillStyle(0x7a8693, 1).fillCircle(cx, headY - 0.5, headR + 1.3);
      g.fillStyle(0xb4bec9, 1).fillCircle(cx, headY - 1, headR + 1);
      g.fillStyle(0x4f5a64, 0.55).fillCircle(cx + headR * 0.4, headY, headR + 1);
      g.fillStyle(0xd6dde4, 0.5).fillEllipse(cx - headR * 0.3, headY - headR * 0.5, headR * 0.8, headR * 0.45);
      g.fillStyle(0x1a1a1a, 0.95).fillRect(cx - headR * 0.8, headY - headR * 0.25, headR * 1.6, headR * 0.55);
      g.fillStyle(0xfff1a8, 1).fillRect(cx - headR * 0.55, headY - headR * 0.1, 1.6, 1.6);
      g.fillStyle(0xfff1a8, 1).fillRect(cx + headR * 0.15, headY - headR * 0.1, 1.6, 1.6);
      g.fillStyle(0x4f5a64, 1).fillRect(cx - 0.9, headY - headR * 0.25, 1.8, headR * 0.8);
      g.fillStyle(0x8e9aa8, 1).fillRect(cx - headR * 1.1, headY - headR * 0.35, headR * 2.2, 1.5);
      g.fillStyle(0x4f5a64, 0.6).fillRect(cx - headR * 1.1, headY - headR * 0.35, headR * 2.2, 0.7);

      const plumeTop = headY - headR - 2;
      g.fillStyle(0x4a2f1a, 1).fillRect(cx - 0.8, plumeTop - 1, 1.6, 4);
      g.fillStyle(0xfacc15, 1).fillCircle(cx, plumeTop - 1.5, 1.2);
      g.fillStyle(factionColor, 1).fillTriangle(cx - 3.5, plumeTop, cx + 3.5, plumeTop, cx + 4.5, plumeTop - 7);
      g.fillStyle(factionLight, 0.95).fillTriangle(cx - 2, plumeTop, cx + 2, plumeTop, cx + 3, plumeTop - 5);
      g.fillStyle(factionDark, 0.7).fillTriangle(cx, plumeTop, cx + 2.5, plumeTop, cx + 3, plumeTop - 4);

      g.fillStyle(0xc8d2dc, 1).fillCircle(cx - r * 0.85, cy - r * 0.02, r * 0.38);
      g.fillStyle(0xc8d2dc, 1).fillCircle(cx + r * 0.85, cy - r * 0.02, r * 0.38);
      g.fillStyle(0x6a7682, 0.55).fillCircle(cx + r * 0.85, cy - r * 0.02, r * 0.38);
      g.fillStyle(0xe5edf5, 0.6).fillCircle(cx - r * 0.9, cy - r * 0.12, r * 0.18);
      g.fillStyle(0xe5edf5, 0.6).fillCircle(cx + r * 0.8, cy - r * 0.12, r * 0.18);

      g.fillStyle(0xc8d2dc, 0.45).fillRoundedRect(cx - r * 0.5, cy - r * 0.2, r, r * 0.7, 2);
      g.fillStyle(0xfacc15, 1).fillRect(cx - 2.5, cy - r * 0.15, 5, 5.5);
      g.fillStyle(0xb45309, 1).fillRect(cx - 1.5, cy - r * 0.1, 3, 4);
      g.fillStyle(0xfff1a8, 0.7).fillRect(cx - 2, cy - r * 0.12, 1, 1.2);
      g.fillStyle(factionColor, 0.92).fillRect(cx - 0.8, cy - r * 0.15, 1.6, 5.5);
      g.fillStyle(factionLight, 0.8).fillRect(cx - 0.5, cy - r * 0.15, 0.5, 5.5);

      const sX = cx + r * 1.2;
      const sY = cy - r * 0.55;
      g.fillStyle(0xe2e8f0, 1).fillRect(sX - 0.3, sY, 2.2, r * 1.55);
      g.fillStyle(0x94a3b8, 0.55).fillRect(sX + 0.8, sY, 1.1, r * 1.55);
      g.fillStyle(0xffffff, 0.45).fillRect(sX - 0.3, sY, 0.6, r * 1.55);
      g.fillStyle(0x4a2f1a, 1).fillRect(sX - 2.5, sY + r * 1.55, 6.3, 1.8);
      g.fillStyle(0xfacc15, 1).fillRect(sX - 3, sY + r * 1.55, 0.8, 1.8);
      g.fillStyle(0xfacc15, 1).fillRect(sX + 3, sY + r * 1.55, 0.8, 1.8);
      g.fillStyle(0x8b5a2b, 1).fillRect(sX - 0.3, sY + r * 1.55 + 1.8, 2.2, r * 0.45);
      g.lineStyle(0.5, 0x4a2f1a, 0.7);
      for (let i = 0; i < 3; i++) {
        g.lineBetween(sX - 0.3, sY + r * 1.6 + 2.4 + i * 1.5, sX + 1.9, sY + r * 1.6 + 2.4 + i * 1.5);
      }
      g.fillStyle(0xfacc15, 1).fillCircle(sX + 0.8, sY + r * 2.05, 1.2);

      const shX = cx - r * 1.25;
      const shY = cy + r * 0.05;
      g.fillStyle(0x2a1a0e, 1).fillEllipse(shX, shY, r * 0.9, r * 1.2);
      g.fillStyle(0x8b5a2b, 1).fillEllipse(shX, shY, r * 0.75, r * 1.05);
      g.fillStyle(0x6a4420, 0.7).fillEllipse(shX + r * 0.2, shY + r * 0.15, r * 0.55, r * 0.85);
      g.fillStyle(0xffffff, 0.25).fillEllipse(shX - r * 0.2, shY - r * 0.3, r * 0.3, r * 0.5);
      g.fillStyle(0xfacc15, 1).fillCircle(shX, shY, r * 0.24);
      g.fillStyle(0xb45309, 1).fillCircle(shX, shY, r * 0.13);
      g.fillStyle(0xfff1a8, 0.75).fillCircle(shX - r * 0.08, shY - r * 0.08, r * 0.06);
      g.fillStyle(factionColor, 0.9).fillRect(shX - r * 0.1, shY - r * 0.36, r * 0.2, r * 0.72);
    } else if (isArcher) {
      const hoodColor = 0x1f3d18;
      g.fillStyle(hoodColor, 1).fillCircle(cx, headY - 1, headR + 1.4);
      g.fillStyle(0x0d1f0a, 0.55).fillCircle(cx + headR * 0.3, headY, headR + 1);
      g.fillStyle(0x3a6b2e, 0.3).fillEllipse(cx - headR * 0.3, headY - headR * 0.6, headR * 0.75, headR * 0.45);
      g.fillStyle(hoodColor, 1).fillTriangle(cx + headR * 0.5, headY + headR * 0.8, cx + headR * 1.3, headY + headR * 0.2, cx + headR * 1.5, headY + headR * 1.4);

      g.fillStyle(skin, 1).fillEllipse(cx, headY + headR * 0.25, headR * 1.6, headR * 1.4);
      g.fillStyle(skinShade, 0.5).fillEllipse(cx + headR * 0.3, headY + headR * 0.4, headR * 1.1, headR * 0.95);
      g.fillStyle(0x000000, 0.42).fillRect(cx - headR * 0.9, headY - headR * 0.1, headR * 1.8, headR * 0.55);
      g.fillStyle(0x111111, 1).fillRect(cx - headR * 0.5, headY + 0.3, 1.5, 1.5);
      g.fillStyle(0x111111, 1).fillRect(cx + headR * 0.1, headY + 0.3, 1.5, 1.5);
      g.fillStyle(0x4a2412, 0.7).fillRect(cx - 0.8, headY + headR * 0.7, 1.6, 0.7);

      g.fillStyle(0x2b4d24, 0.95).fillEllipse(cx + r * 0.1, cy + r * 0.45, r * 1.6, r * 0.95);
      g.fillStyle(0x143012, 0.6).fillEllipse(cx + r * 0.55, cy + r * 0.55, r * 0.95, r * 0.75);
      g.fillStyle(0x3a6b2e, 0.4).fillEllipse(cx - r * 0.3, cy + r * 0.3, r * 0.7, r * 0.4);
      g.fillStyle(factionColor, 0.9).fillRect(cx - 0.9, cy + r * 0.12, 1.8, 4.6);
      g.fillStyle(factionLight, 0.7).fillRect(cx - 0.5, cy + r * 0.12, 0.5, 4.6);

      g.fillStyle(0x4a2f1a, 1).fillRect(cx + r * 0.5, cy - r * 0.75, 4.5, r * 1.1);
      g.fillStyle(0x6e4a1e, 0.6).fillRect(cx + r * 0.5, cy - r * 0.75, 4.5, 1.5);
      g.fillStyle(0x3a2412, 0.7).fillRect(cx + r * 0.85, cy - r * 0.75, 1.3, r * 1.1);
      g.lineStyle(0.6, 0x6e4a1e, 0.9);
      g.lineBetween(cx + r * 0.4, cy - r * 0.4, cx + r * 0.55, cy + r * 0.2);
      g.fillStyle(0xede6c8, 1).fillRect(cx + r * 0.6, cy - r * 1.15, 0.8, 4.5);
      g.fillStyle(0xede6c8, 1).fillRect(cx + r * 0.85, cy - r * 1.15, 0.8, 4.5);
      g.fillStyle(0xede6c8, 1).fillRect(cx + r * 0.7, cy - r * 1.05, 0.7, 4);
      g.fillStyle(factionColor, 1).fillTriangle(cx + r * 0.55, cy - r * 1.2, cx + r * 0.75, cy - r * 1.2, cx + r * 0.65, cy - r * 1.4);
      g.fillStyle(factionColor, 1).fillTriangle(cx + r * 0.8, cy - r * 1.2, cx + r * 1.0, cy - r * 1.2, cx + r * 0.9, cy - r * 1.4);
      g.fillStyle(factionDark, 0.8).fillTriangle(cx + r * 0.6, cy - r * 1.22, cx + r * 0.72, cy - r * 1.22, cx + r * 0.66, cy - r * 1.35);

      const bX = cx - r * 1.15;
      const bY = cy + r * 0.1;
      g.lineStyle(2.2, 0x6e3f1d, 1);
      g.beginPath();
      g.arc(bX + r * 0.3, bY, r * 1.05, Math.PI * 0.55, Math.PI * 1.45, false);
      g.strokePath();
      g.lineStyle(1.1, 0x3a2412, 0.9);
      g.beginPath();
      g.arc(bX + r * 0.3, bY, r * 1.05, Math.PI * 0.55, Math.PI * 1.45, false);
      g.strokePath();
      g.fillStyle(0xfacc15, 1).fillCircle(bX + r * 0.3 + r * 1.05 * Math.cos(Math.PI * 0.55), bY + r * 1.05 * Math.sin(Math.PI * 0.55), 1);
      g.fillStyle(0xfacc15, 1).fillCircle(bX + r * 0.3 + r * 1.05 * Math.cos(Math.PI * 1.45), bY + r * 1.05 * Math.sin(Math.PI * 1.45), 1);
      g.lineStyle(1, 0xede6c8, 0.85);
      const sa1x = bX + r * 0.3 + r * 1.05 * Math.cos(Math.PI * 0.55);
      const sa1y = bY + r * 1.05 * Math.sin(Math.PI * 0.55);
      const sa2x = bX + r * 0.3 + r * 1.05 * Math.cos(Math.PI * 1.45);
      const sa2y = bY + r * 1.05 * Math.sin(Math.PI * 1.45);
      g.lineBetween(sa1x, sa1y, sa2x, sa2y);
      g.fillStyle(0xfacc15, 1).fillCircle(cx + r * 0.35, cy + r * 0.55, 0.9);
      g.fillStyle(0xfffbeb, 0.7).fillCircle(cx + r * 0.2, cy + r * 0.42, 0.4);
    }

    g.lineStyle(1.2, 0x000000, 0.35).strokeEllipse(cx, cy + 2, r * 1.75, r * 1.9);
    g.lineStyle(0.8, 0xffffff, 0.08).strokeEllipse(cx - r * 0.12, cy + 1.4, r * 1.2, r * 0.72);
    void strokeColor;
    g.generateTexture(key, size, size + 4);
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
