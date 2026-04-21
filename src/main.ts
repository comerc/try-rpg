import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GameOverScene } from './scenes/GameOverScene';
import { VIEWPORT_H, VIEWPORT_W } from './config';
import { Logger } from './systems/Logger';

Logger.install();
Logger.info(`RTS boot — Phaser ${Phaser.VERSION}`);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a0a0a',
  width: VIEWPORT_W,
  height: VIEWPORT_H,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { mouse: { preventDefaultDown: true, preventDefaultUp: true } },
  scene: [BootScene, GameScene, UIScene, GameOverScene],
  render: { pixelArt: false, antialias: true },
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
