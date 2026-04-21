import Phaser from 'phaser';
import { VIEWPORT_H, VIEWPORT_W } from '../config';

interface Notification {
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export class NotificationSystem {
  private notifications: Notification[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private maxVisible = 5;
  private x: number;
  private y: number;

  constructor(private scene: Phaser.Scene) {
    this.x = VIEWPORT_W / 2;
    this.y = 60;
    for (let i = 0; i < this.maxVisible; i++) {
      const t = scene.add.text(this.x, this.y + i * 24, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(10001).setScrollFactor(0).setVisible(false);
      this.texts.push(t);
    }
  }

  add(text: string, color = '#ffffff') {
    this.notifications.push({ text, color, life: 3, maxLife: 3 });
    if (this.notifications.length > this.maxVisible) {
      this.notifications.shift();
    }
  }

  update(delta: number) {
    const dt = delta / 1000;
    this.notifications = this.notifications.filter((n) => {
      n.life -= dt;
      return n.life > 0;
    });

    for (let i = 0; i < this.maxVisible; i++) {
      const t = this.texts[i];
      if (i < this.notifications.length) {
        const n = this.notifications[i];
        const alpha = Math.min(1, n.life / (n.maxLife * 0.3));
        t.setText(n.text).setColor(n.color).setAlpha(alpha).setVisible(true);
      } else {
        t.setVisible(false);
      }
    }
  }
}
