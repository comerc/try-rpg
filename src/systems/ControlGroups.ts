import Phaser from 'phaser';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { SelectionSystem } from './SelectionSystem';

const DIGIT_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

export class ControlGroups {
  private groups: Record<number, Entity[]> = {};
  private lastRecall: Record<number, number> = {};
  private keyHandlers: Array<{ event: string; handler: (e: KeyboardEvent) => void }> = [];

  constructor(
    private scene: Phaser.Scene,
    private selection: SelectionSystem,
  ) {
    DIGIT_KEYS.forEach((key, idx) => {
      const n = idx + 1;
      const event = `keydown-${key}`;
      const handler = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) this.assign(n);
        else this.recall(n);
      };
      this.keyHandlers.push({ event, handler });
      scene.input.keyboard?.on(event, handler);
    });
  }

  destroy() {
    for (const { event, handler } of this.keyHandlers) {
      this.scene.input.keyboard?.off(event, handler);
    }
    this.keyHandlers = [];
  }

  assign(n: number) {
    const sel = this.selection.selected.filter((e) => !e.dead);
    if (sel.length === 0) return;
    this.groups[n] = sel.slice();
    const notif = (this.scene as any).notifications;
    if (notif) notif.add(`Группа ${n}: ${sel.length}`, '#facc15');
    const snd = (this.scene as any).sound2;
    if (snd) snd.play('click');
  }

  recall(n: number) {
    const g = this.groups[n];
    if (!g || g.length === 0) return;
    const alive = g.filter((e) => !e.dead);
    this.groups[n] = alive;
    if (alive.length === 0) return;
    this.selection.setSelection(alive);
    const snd = (this.scene as any).sound2;
    if (snd) snd.play('select');

    const now = this.scene.time.now;
    const last = this.lastRecall[n] ?? 0;
    this.lastRecall[n] = now;
    if (now - last < 400) {
      let cx = 0, cy = 0;
      for (const e of alive) { cx += e.x; cy += e.y; }
      cx /= alive.length; cy /= alive.length;
      const game = this.scene as any;
      game.cameras?.main?.pan?.(cx, cy, 180, 'Sine.easeInOut');
    }
  }

  cycleIdleWorker(): Unit | null {
    const ents = (this.scene as any).entities as Entity[];
    if (!ents) return null;
    const workers = ents.filter((e): e is Unit =>
      e instanceof Unit && e.team === 'player' && !e.dead && e.kind === 'peasant' && e.isIdle()
    );
    if (workers.length === 0) return null;
    const currentSelected = this.selection.selected[0];
    let startIdx = 0;
    if (currentSelected && workers.includes(currentSelected as Unit)) {
      startIdx = (workers.indexOf(currentSelected as Unit) + 1) % workers.length;
    }
    const target = workers[startIdx];
    this.selection.setSelection([target]);
    const game = this.scene as any;
    game.cameras?.main?.pan?.(target.x, target.y, 180, 'Sine.easeInOut');
    const snd = (this.scene as any).sound2;
    if (snd) snd.play('select');
    return target;
  }
}
