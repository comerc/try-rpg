import { VIEWPORT_H, VIEWPORT_W } from './config';
import { Logger } from './systems/Logger';
import { mountAnimationInspector, shouldOpenAnimationInspector } from './tools/AnimationInspector';

Logger.install();

if (shouldOpenAnimationInspector()) {
  mountAnimationInspector(document.getElementById('game'));
} else {
  void startGame();
}

async function startGame() {
  const Phaser = (await import('phaser')).default;
  const [
    { BootScene },
    { MainMenuScene },
    { GameScene },
    { UIScene },
    { GameOverScene },
  ] = await Promise.all([
    import('./scenes/BootScene'),
    import('./scenes/MainMenuScene'),
    import('./scenes/GameScene'),
    import('./scenes/UIScene'),
    import('./scenes/GameOverScene'),
  ]);

  Logger.info(`RTS boot — Phaser ${Phaser.VERSION}`);
  installOrientationNotice();

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
    scene: [BootScene, MainMenuScene, GameScene, UIScene, GameOverScene],
    render: { pixelArt: false, antialias: true },
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

function installOrientationNotice() {
  const notice = document.createElement('div');
  notice.className = 'orientation-notice';
  notice.innerHTML = '<strong>Поверни экран</strong><span>RTS рассчитана на широкий экран. На телефоне играй в альбомной ориентации.</span>';
  document.body.appendChild(notice);
}
