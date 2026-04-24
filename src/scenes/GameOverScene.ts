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
    this.add.image(VIEWPORT_W / 2, VIEWPORT_H / 2, data.win ? 'splash-victory' : 'splash-defeat')
      .setDisplaySize(VIEWPORT_W, VIEWPORT_H);
    this.add.rectangle(0, 0, VIEWPORT_W, VIEWPORT_H, data.win ? 0x052512 : 0x1b0705, 0.32).setOrigin(0, 0);
    this.add.rectangle(0, VIEWPORT_H * 0.55, VIEWPORT_W, VIEWPORT_H * 0.45, 0x020712, 0.68).setOrigin(0, 0);

    const title = data.win ? T.victory : T.defeat;
    const color = data.win ? '#22c55e' : '#ef4444';
    const glow = this.add.text(VIEWPORT_W / 2, VIEWPORT_H - 330, title, {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '78px', color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5);
    this.tweens.add({ targets: glow, scale: 1.05, yoyo: true, duration: 1400, repeat: -1, ease: 'Sine.easeInOut' });

    if (data.time) {
      const totalSec = Math.floor(data.time / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      this.add.text(VIEWPORT_W / 2, VIEWPORT_H - 228, `${T.gameTime}: ${min}:${sec.toString().padStart(2, '0')}`, {
        fontFamily: 'Trebuchet MS, monospace', fontSize: '22px', color: '#dbeafe',
      }).setOrigin(0.5);
    }

    const stats: string[] = [];
    if (data.kills) stats.push(`${T.kills}: ${data.kills.player ?? 0}`);
    if (data.buildingsBuilt) stats.push(`${T.buildingsStat}: ${data.buildingsBuilt.player ?? 0}`);
    if (stats.length > 0) {
      this.add.text(VIEWPORT_W / 2, VIEWPORT_H - 186, stats.join('     '), {
        fontFamily: 'Trebuchet MS, monospace', fontSize: '18px', color: '#bfdbfe',
      }).setOrigin(0.5);
    }

    const btn = this.add.rectangle(VIEWPORT_W / 2, VIEWPORT_H - 112, 280, 60, 0x1f5f9f, 0.95).setStrokeStyle(2, 0x93c5fd).setInteractive({ useHandCursor: true });
    this.add.text(VIEWPORT_W / 2, VIEWPORT_H - 112, T.playAgain, {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '23px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x2b76bf, 1));
    btn.on('pointerout', () => btn.setFillStyle(0x1f5f9f, 0.95));
    btn.on('pointerdown', () => this.restart());

    this.add.text(VIEWPORT_W / 2, VIEWPORT_H - 58, T.finalHint, {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '14px', color: '#bfdbfe',
    }).setOrigin(0.5);

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
