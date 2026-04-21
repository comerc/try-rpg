import Phaser from 'phaser';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { Logger } from './Logger';

const DRAG_THRESHOLD = 4;

/**
 * Drag positions are stored in WORLD coordinates (via camera.getWorldPoint).
 * The dragRect Graphics is a normal world-space object (no scrollFactor
 * override). This way the rectangle stays pinned to where the cursor is
 * regardless of camera scroll or zoom — a scrollFactor(0) rect only skipped
 * camera scroll but still got multiplied by zoom, so clicks at zoom != 1
 * made the rect drift away from the mouse.
 */
export class SelectionSystem {
  selected: Entity[] = [];
  private dragStart: { x: number; y: number } | null = null;
  private dragCurrent: { x: number; y: number } | null = null;
  private dragRect: Phaser.GameObjects.Graphics;
  private isDragging = false;

  constructor(
    private scene: Phaser.Scene,
    private getEntities: () => Entity[],
  ) {
    this.dragRect = scene.add.graphics().setDepth(10000);
  }

  private worldPoint(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: wp.x, y: wp.y };
  }

  onPointerDown(pointer: Phaser.Input.Pointer) {
    if (!pointer.leftButtonDown()) return;
    if (this.dragStart) {
      Logger.diag(`selection: stray dragStart on pointerdown, cancelling`);
      this.cancelDrag();
    }
    const wp = this.worldPoint(pointer);
    this.dragStart = wp;
    this.dragCurrent = { ...wp };
    this.isDragging = false;
    this.dragRect.clear();
  }

  onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.dragStart) return;
    // Do NOT gate on leftButtonDown; some browsers/devices briefly report
    // inconsistent button state during rapid moves. Rely on dragStart as state.
    this.dragCurrent = this.worldPoint(pointer);
    const dx = this.dragCurrent.x - this.dragStart.x;
    const dy = this.dragCurrent.y - this.dragStart.y;
    // Threshold is in world units — scale by zoom so the "it's a drag" feel
    // is consistent in screen pixels regardless of zoom.
    const zoom = this.scene.cameras.main.zoom || 1;
    if (!this.isDragging && Math.hypot(dx, dy) * zoom > DRAG_THRESHOLD) {
      this.isDragging = true;
    }
    if (this.isDragging) this.redrawDragRect();
  }

  private redrawDragRect() {
    if (!this.dragStart || !this.dragCurrent) return;
    const x = Math.min(this.dragStart.x, this.dragCurrent.x);
    const y = Math.min(this.dragStart.y, this.dragCurrent.y);
    const w = Math.abs(this.dragCurrent.x - this.dragStart.x);
    const h = Math.abs(this.dragCurrent.y - this.dragStart.y);
    const zoom = this.scene.cameras.main.zoom || 1;
    // Draw line thickness in world units that scales to ~1.5 screen px.
    const lineW = 1.5 / zoom;
    this.dragRect.clear();
    this.dragRect.fillStyle(0x22c55e, 0.12);
    this.dragRect.fillRect(x, y, w, h);
    this.dragRect.lineStyle(lineW, 0x22c55e, 0.95);
    this.dragRect.strokeRect(x, y, w, h);
  }

  /** Returns the final selection after pointer-up. */
  onPointerUp(pointer: Phaser.Input.Pointer): Entity[] | null {
    if (!this.dragStart) return null;
    const end = this.dragCurrent ?? this.worldPoint(pointer);
    const start = this.dragStart;
    const wasDragging = this.isDragging;
    this.dragRect.clear();
    this.dragStart = null;
    this.dragCurrent = null;
    this.isDragging = false;

    if (wasDragging) {
      const x1 = Math.min(start.x, end.x);
      const y1 = Math.min(start.y, end.y);
      const x2 = Math.max(start.x, end.x);
      const y2 = Math.max(start.y, end.y);
      const ents = this.getEntities().filter(
        (e) => e instanceof Unit && e.team === 'player' && !e.dead
          && e.x >= x1 && e.x <= x2 && e.y >= y1 && e.y <= y2,
      );
      Logger.diag(`selection: drag world=[${x1.toFixed(0)},${y1.toFixed(0)}-${x2.toFixed(0)},${y2.toFixed(0)}] -> ${ents.length} units`);
      if (ents.length > 0) { this.setSelection(ents); return this.selected; }
      this.clear();
      return [];
    } else {
      const hit = this.pickEntityAt(end.x, end.y);
      Logger.diag(`selection: click world=(${end.x.toFixed(0)},${end.y.toFixed(0)}) entities=${this.getEntities().length} hit=${hit ? (hit.constructor.name + '@' + hit.x.toFixed(0) + ',' + hit.y.toFixed(0)) : 'null'}`);
      if (hit && !hit.dead) {
        this.setSelection([hit]);
        return this.selected;
      } else {
        this.clear();
        return [];
      }
    }
  }

  /** Cancel in-progress drag without selecting (e.g. on scene transition). */
  cancelDrag() {
    this.dragRect.clear();
    this.dragStart = null;
    this.dragCurrent = null;
    this.isDragging = false;
  }

  private pickEntityAt(wx: number, wy: number): Entity | null {
    const ents = this.getEntities();
    let best: Entity | null = null;
    let bestDist = Infinity;
    for (const e of ents) {
      if (e.dead) continue;
      if ((e as any).visible === false) continue;
      const r = (e as any).radius ?? 12;
      const dx = wx - e.x;
      const dy = wy - e.y;
      const d = Math.hypot(dx, dy);
      if (d <= r + 6 && d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }

  setSelection(ents: Entity[]) {
    for (const e of this.selected) (e as any).setSelected?.(false);
    const onlyPlayerUnits = ents.filter((e) => e instanceof Unit && e.team === 'player');
    let final = ents;
    if (onlyPlayerUnits.length > 0 && ents.length > 1) final = onlyPlayerUnits;
    if (ents.length === 1 && ents[0] instanceof Building) final = [ents[0]];
    this.selected = final;
    for (const e of this.selected) (e as any).setSelected?.(true);
    this.emit();
  }

  clear() {
    for (const e of this.selected) (e as any).setSelected?.(false);
    this.selected = [];
    this.emit();
  }

  pruneDead() {
    const alive = this.selected.filter((e) => !e.dead);
    if (alive.length !== this.selected.length) {
      this.selected = alive;
      this.emit();
    }
  }

  private emit() {
    this.scene.events.emit('selection:changed', this.selected);
  }
}
