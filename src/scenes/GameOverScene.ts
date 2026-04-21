import Phaser from 'phaser';
import { VIEWPORT_H, VIEWPORT_W } from '../config';
import { T } from '../i18n';

interface Data {
  win: boolean;
  time?: number;
  kills?: Record<string, number>;
  buildingsBuilt?: Record<string, number>;
}

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(data: Data) {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.add.rectangle(0, 0, VIEWPORT_W, VIEWPORT_H, 0x000000, 0.9).setOrigin(0, 0);
    const title = data.win ? T.victory : T.defeat;
    const color = data.win ? '#22c55e' : '#ef4444';
    const glow = this.add.text(VIEWPORT_W / 2, VIEWPORT_H / 2 - 120, title, {
      fontFamily: 'monospace', fontSize: '72px', color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.tweens.add({ targets: glow, scale: 1.05, yoyo: true, duration: 1400, repeat: -1, ease: 'Sine.easeInOut' });

    if (data.time) {
      const totalSec = Math.floor(data.time / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      this.add.text(VIEWPORT_W / 2, VIEWPORT_H / 2 - 30, `${T.gameTime}: ${min}:${sec.toString().padStart(2, '0')}`, {
        fontFamily: 'monospace', fontSize: '20px', color: '#cbd5e1',
      }).setOrigin(0.5);
    }

    const stats: string[] = [];
    if (data.kills) stats.push(`${T.kills}: ${data.kills.player ?? 0}`);
    if (data.buildingsBuilt) stats.push(`${T.buildingsStat}: ${data.buildingsBuilt.player ?? 0}`);
    if (stats.length > 0) {
      this.add.text(VIEWPORT_W / 2, VIEWPORT_H / 2 + 5, stats.join('     '), {
        fontFamily: 'monospace', fontSize: '18px', color: '#94a3b8',
      }).setOrigin(0.5);
    }

    const btn = this.add.rectangle(VIEWPORT_W / 2, VIEWPORT_H / 2 + 70, 260, 56, 0x1f2937, 1).setStrokeStyle(2, 0x4b5563).setInteractive({ useHandCursor: true });
    this.add.text(VIEWPORT_W / 2, VIEWPORT_H / 2 + 70, T.playAgain, {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffffff',
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x374151));
    btn.on('pointerout', () => btn.setFillStyle(0x1f2937));
    btn.on('pointerdown', () => this.restart());

    this.input.keyboard?.once('keydown-SPACE', () => this.restart());
    this.input.keyboard?.once('keydown-ENTER', () => this.restart());
  }

  private restart() {
    this.scene.stop();
    this.scene.start('Game');
    this.scene.launch('UI');
  }

  private onShutdown() {
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
  }
}
