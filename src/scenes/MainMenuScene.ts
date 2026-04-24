import Phaser from 'phaser';
import { VIEWPORT_H, VIEWPORT_W } from '../config';
import { T } from '../i18n';

export class MainMenuScene extends Phaser.Scene {
  constructor() { super('MainMenu'); }

  create() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.add.image(VIEWPORT_W / 2, VIEWPORT_H / 2, 'splash-menu')
      .setDisplaySize(VIEWPORT_W, VIEWPORT_H);
    this.add.rectangle(0, 0, VIEWPORT_W, VIEWPORT_H, 0x020712, 0.22).setOrigin(0, 0);
    this.add.rectangle(0, VIEWPORT_H * 0.58, VIEWPORT_W, VIEWPORT_H * 0.42, 0x020712, 0.48).setOrigin(0, 0);

    const title = this.add.text(96, VIEWPORT_H - 292, T.gameTitle, {
      fontFamily: 'Trebuchet MS, monospace',
      fontSize: '86px',
      color: '#f8fafc',
      fontStyle: 'bold',
      stroke: '#07111c',
      strokeThickness: 8,
    });
    title.setShadow(0, 8, '#000000', 14, true, true);

    const sub = this.add.text(104, VIEWPORT_H - 196, T.gameStarted, {
      fontFamily: 'Trebuchet MS, monospace',
      fontSize: '22px',
      color: '#dbeafe',
      stroke: '#07111c',
      strokeThickness: 4,
      wordWrap: { width: 840 },
    });
    sub.setShadow(0, 4, '#000000', 8, true, true);

    const button = this.add.rectangle(248, VIEWPORT_H - 106, 300, 66, 0x1f5f9f, 0.95)
      .setStrokeStyle(2, 0x93c5fd)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(248, VIEWPORT_H - 106, T.startGame, {
      fontFamily: 'Trebuchet MS, monospace',
      fontSize: '25px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    buttonText.setShadow(0, 2, '#000000', 5, true, true);

    this.add.text(104, VIEWPORT_H - 54, T.menuHint, {
      fontFamily: 'Trebuchet MS, monospace',
      fontSize: '14px',
      color: '#bfdbfe',
    });

    button.on('pointerover', () => button.setFillStyle(0x2b76bf, 1));
    button.on('pointerout', () => button.setFillStyle(0x1f5f9f, 0.95));
    button.on('pointerdown', () => this.startGame());
    this.input.keyboard?.once('keydown-ENTER', () => this.startGame());
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
  }

  private startGame() {
    this.scene.start('Game');
    this.scene.launch('UI');
  }

  private onShutdown() {
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
  }
}
