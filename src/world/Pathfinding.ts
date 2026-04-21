import Phaser from 'phaser';
import EasyStar from 'easystarjs';
import { GameMap } from './GameMap';

export interface PathPoint { tx: number; ty: number; }

export class Pathfinding {
  private finder = new EasyStar.js();
  private dirty = true;

  constructor(private map: GameMap) {
    this.finder.setAcceptableTiles([0]);
    this.finder.enableDiagonals();
    this.finder.disableCornerCutting();
    this.finder.setIterationsPerCalculation(2000);
    this.syncGrid();
  }

  markDirty() { this.dirty = true; }

  private syncGrid() {
    this.finder.setGrid(this.map.grid.map((row) => row.slice()));
    this.dirty = false;
  }

  findPath(
    sx: number, sy: number, tx: number, ty: number,
    cb: (path: PathPoint[] | null) => void,
  ) {
    if (this.dirty) this.syncGrid();
    sx = Phaser.Math.Clamp(sx, 0, this.map.w - 1);
    sy = Phaser.Math.Clamp(sy, 0, this.map.h - 1);
    tx = Phaser.Math.Clamp(tx, 0, this.map.w - 1);
    ty = Phaser.Math.Clamp(ty, 0, this.map.h - 1);

    if (this.map.isBlocked(tx, ty)) {
      const near = this.map.findNearestFree(tx, ty, 6);
      if (!near) { cb(null); return; }
      tx = near.tx; ty = near.ty;
    }

    this.finder.findPath(sx, sy, tx, ty, (path) => {
      if (!path) cb(null);
      else cb(path.map((p) => ({ tx: p.x, ty: p.y })));
    });
    this.finder.calculate();
  }
}
