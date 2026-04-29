import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GameOverScene } from './scenes/GameOverScene';
import { Logger } from './systems/Logger';

Logger.install();
Logger.info(`RTS boot — Phaser ${Phaser.VERSION}`);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a0a0a',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { mouse: { preventDefaultDown: true, preventDefaultUp: true } },
  scene: [BootScene, GameScene, UIScene, GameOverScene],
  render: { pixelArt: false, antialias: true },
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
