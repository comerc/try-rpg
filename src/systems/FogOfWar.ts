import Phaser from 'phaser';
import { MAP_H, MAP_W, TILE, WORLD_H, WORLD_W } from '../config';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/Resource';

export enum FogState { Hidden = 0, Explored = 1, Visible = 2 }

export class FogOfWar {
  private state: Uint8Array = new Uint8Array(MAP_W * MAP_H);
  private gfx: Phaser.GameObjects.Graphics;
  private updateTimer = 999;
  private enabled = true;

  constructor(private scene: Phaser.Scene, private getEntities: () => Entity[]) {
    this.gfx = scene.add.graphics().setDepth(500);
    this.state.fill(FogState.Hidden);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) this.gfx.clear();
  }

  isEnabled() { return this.enabled; }

  isVisible(tx: number, ty: number): boolean {
    if (!this.enabled) return true;
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.state[ty * MAP_W + tx] === FogState.Visible;
  }

  isExplored(tx: number, ty: number): boolean {
    if (!this.enabled) return true;
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.state[ty * MAP_W + tx] !== FogState.Hidden;
  }

  update(delta: number) {
    if (!this.enabled) return;
    this.updateTimer += delta;
    if (this.updateTimer < 150) {
      this.syncEntityVisibility();
      return;
    }
    this.updateTimer = 0;
    this.recompute();
    this.redraw();
    this.syncEntityVisibility();
  }

  private recompute() {
    // Visible -> Explored
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] === FogState.Visible) this.state[i] = FogState.Explored;
    }
    // Flood visible from player units and buildings
    for (const e of this.getEntities()) {
      if (e.dead) continue;
      if ((e as any).team !== 'player') continue;
      const sight = (e as any).sight as number | undefined;
      if (sight === undefined) continue;
      const sx = Math.floor(e.x / TILE);
      const sy = Math.floor(e.y / TILE);
      const sr = Math.ceil(sight / TILE);
      const r2 = sr * sr;
      for (let dy = -sr; dy <= sr; dy++) {
        for (let dx = -sr; dx <= sr; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const tx = sx + dx, ty = sy + dy;
          if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
          this.state[ty * MAP_W + tx] = FogState.Visible;
        }
      }
    }
  }

  private redraw() {
    this.gfx.clear();
    // Single pass: hidden=dark, explored=semi
    this.gfx.fillStyle(0x000000, 1);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (this.state[ty * MAP_W + tx] === FogState.Hidden) {
          this.gfx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }
    this.gfx.fillStyle(0x000000, 0.45);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (this.state[ty * MAP_W + tx] === FogState.Explored) {
          this.gfx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }
  }

  private syncEntityVisibility() {
    if (!this.enabled) return;
    for (const e of this.getEntities()) {
      if (e.dead) continue;
      const tx = Math.floor(e.x / TILE);
      const ty = Math.floor(e.y / TILE);
      const team = (e as any).team;
      if (e instanceof Unit) {
        if (team === 'player') e.setVisible(true);
        else e.setVisible(this.isVisible(tx, ty));
      } else if (e instanceof Building) {
        if (team === 'player') e.setVisible(true);
        else e.setVisible(this.isExplored(tx, ty));
      } else if (e instanceof ResourceNode) {
        e.setVisible(this.isExplored(tx, ty));
      }
    }
  }
}
