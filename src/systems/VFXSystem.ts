import Phaser from 'phaser';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
  gravity: number;
  drag?: number;
  shrink?: boolean;
  glow?: boolean;
  alpha?: number;
  elongation?: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

interface Projectile {
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  color: number;
  size: number;
  life: number;
  trail: { x: number; y: number; alpha: number }[];
  t: number;
  totalTime: number;
  arc: number;
  glowColor?: number;
}

interface RingWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: number;
  width: number;
}

interface WeaponTrail {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  color: number;
  radius: number;
  arcSpan: number;
}

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
  color: number;
  pulse: number;
}

interface AmbientZone {
  x: number;
  y: number;
  radius: number;
  color: number;
  rate: number;
  drift: number;
  kind: 'motes' | 'embers';
  pulse: number;
}

export class VFXSystem {
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private projectiles: Projectile[] = [];
  private ringWaves: RingWave[] = [];
  private weaponTrails: WeaponTrail[] = [];
  private ambientDust: AmbientParticle[] = [];
  private ambientZones: AmbientZone[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private glowGraphics: Phaser.GameObjects.Graphics;
  private textObjects: Phaser.GameObjects.Text[] = [];
  private maxPoolSize = 64;
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeDecay = 0.92;
  private scene: Phaser.Scene;
  private elapsed = 0;

  constructor(private sceneRef: Phaser.Scene) {
    this.scene = sceneRef;
    this.graphics = sceneRef.add.graphics().setDepth(9000);
    this.glowGraphics = sceneRef.add.graphics().setDepth(8999);
    for (let i = 0; i < this.maxPoolSize; i++) {
      const t = sceneRef.add.text(0, 0, '', {
        fontFamily: 'Trebuchet MS, monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        stroke: '#081018',
        strokeThickness: 5,
      }).setDepth(9001).setVisible(false);
      t.setShadow(0, 2, '#000000', 6, true, true);
      this.textObjects.push(t);
    }
    for (let i = 0; i < 28; i++) {
      this.spawnAmbientDust();
    }
  }

  shake(intensity: number, duration: number = 200) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
  }

  private applyShake() {
    if (this.shakeIntensity < 0.3) {
      this.shakeIntensity = 0;
      this.shakeDuration = 0;
      return;
    }
    const cam = this.scene.cameras.main;
    cam.shake(this.shakeDuration, this.shakeIntensity * 0.0008, false);
    this.shakeIntensity *= this.shakeDecay;
    this.shakeDuration *= 0.9;
    if (this.shakeDuration < 10) this.shakeIntensity = 0;
  }

  spawnSparks(x: number, y: number, color: number, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.25 + Math.random() * 0.35,
        maxLife: 0.25 + Math.random() * 0.35,
        color: i % 4 === 0 ? 0xffffff : color,
        size: 1.4 + Math.random() * 2.2,
        gravity: 65,
        shrink: true,
        glow: true,
        alpha: 1,
      });
    }
  }

  spawnBlood(x: number, y: number, color: number = 0xc1272d) {
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.5;
      const speed = 30 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.4 + Math.random() * 0.5,
        color,
        size: 2 + Math.random() * 2.8,
        gravity: 90,
        shrink: true,
        drag: 0.96,
        alpha: 0.9,
      });
    }
  }

  spawnDeathExplosion(x: number, y: number, color: number) {
    for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 145;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.55 + Math.random() * 0.85,
        maxLife: 0.55 + Math.random() * 0.85,
        color: i < 7 ? 0x333333 : i % 5 === 0 ? 0xffffff : color,
        size: 2 + Math.random() * 4.5,
        gravity: 72,
        shrink: true,
        drag: 0.97,
        glow: i >= 7,
        alpha: 1,
      });
    }
    this.spawnSmokePlume(x, y - 4, 8, 1.1);
    this.spawnRingWave(x, y, 0, 44, 0.5, color, 2);
    this.spawnRingWave(x, y, 4, 64, 0.65, 0xffffff, 1);
    this.shake(4, 150);
  }

  spawnRingWave(x: number, y: number, startRadius: number, maxRadius: number, duration: number, color: number, width: number = 2) {
    this.ringWaves.push({
      x,
      y,
      radius: startRadius,
      maxRadius,
      life: duration,
      maxLife: duration,
      color,
      width,
    });
  }

  spawnDustCloud(x: number, y: number, count = 6) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 30;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 12,
        life: 0.55 + Math.random() * 0.55,
        maxLife: 0.55 + Math.random() * 0.55,
        color: 0x8a7a5a,
        size: 2.5 + Math.random() * 3.5,
        gravity: 12,
        shrink: true,
        drag: 0.94,
        alpha: 0.55,
        elongation: 1.35,
      });
    }
  }

  spawnFireBurst(x: number, y: number, count = 8) {
    const fireColors = [0xff4400, 0xff6600, 0xffaa00, 0xffdd44];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const speed = 20 + Math.random() * 70;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.55,
        maxLife: 0.3 + Math.random() * 0.55,
        color: fireColors[Math.floor(Math.random() * fireColors.length)],
        size: 2 + Math.random() * 4,
        gravity: -18,
        shrink: true,
        glow: true,
        drag: 0.96,
        alpha: 0.95,
      });
    }
    this.spawnSmokePlume(x, y - 4, Math.max(5, Math.floor(count * 0.7)), 1.05);
  }

  spawnSmokePlume(x: number, y: number, count = 6, scale = 1) {
    const colors = [0x262626, 0x3f3f46, 0x52525b, 0x78716c];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = (12 + Math.random() * 18) * scale;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 12 * scale,
        y: y + (Math.random() - 0.5) * 8 * scale,
        vx: Math.cos(angle) * speed * 0.35,
        vy: -speed,
        life: 0.8 + Math.random() * 0.8,
        maxLife: 0.8 + Math.random() * 0.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: (3 + Math.random() * 4) * scale,
        gravity: -6,
        shrink: false,
        drag: 0.97,
        alpha: 0.32,
        elongation: 1.6,
      });
    }
  }

  spawnHeal(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = 15 + Math.random() * 35;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y,
        vx: Math.cos(angle) * speed * 0.3,
        vy: -speed,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.5 + Math.random() * 0.4,
        color: 0x44ff88,
        size: 1.5 + Math.random() * 2.5,
        gravity: -30,
        shrink: true,
        glow: true,
        drag: 0.98,
        alpha: 0.95,
      });
    }
    this.spawnRingWave(x, y, 5, 25, 0.4, 0x44ff88, 1.5);
  }

  spawnGatherParticle(x: number, y: number, color: number) {
    for (let i = 0; i < 4; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = 18 + Math.random() * 35;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.35 + Math.random() * 0.3,
        color,
        size: 1.5 + Math.random() * 2,
        gravity: 25,
        shrink: true,
        glow: true,
        alpha: 0.95,
      });
    }
  }

  spawnBuildParticle(x: number, y: number) {
    for (let i = 0; i < 4; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2;
      const speed = 12 + Math.random() * 30;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.5 + Math.random() * 0.4,
        color: i < 2 ? 0xd4a745 : 0x8a6a3a,
        size: 1.5 + Math.random() * 2.5,
        gravity: 35,
        shrink: true,
        alpha: 0.85,
      });
    }
  }

  spawnDamageNumber(x: number, y: number, amount: number, isHeal = false) {
    this.texts.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y - 12,
      text: isHeal ? `+${Math.round(amount)}` : `-${Math.round(amount)}`,
      color: isHeal ? '#86efac' : '#f87171',
      life: 1.0,
      maxLife: 1.0,
      scale: isHeal ? 1.05 : 1.2,
    });
  }

  spawnProjectile(x: number, y: number, tx: number, ty: number, color = 0x8ee06b, glowColor?: number) {
    const dist = Math.hypot(tx - x, ty - y);
    const speed = 430;
    const totalTime = dist / speed;
    this.projectiles.push({
      x,
      y,
      tx,
      ty,
      speed,
      color,
      size: 3.8,
      life: totalTime + 0.12,
      trail: [],
      t: 0,
      totalTime: Math.max(0.1, totalTime),
      arc: Math.min(36, dist * 0.15),
      glowColor: glowColor ?? color,
    });
  }

  spawnWeaponTrail(x: number, y: number, angle: number, color: number, radius: number = 20, arcSpan: number = 1.2) {
    this.weaponTrails.push({
      x,
      y,
      angle,
      life: 0.22,
      maxLife: 0.22,
      color,
      radius,
      arcSpan,
    });
  }

  spawnImpact(x: number, y: number, color: number, big = false) {
    const count = big ? 12 : 6;
    this.spawnSparks(x, y, color, count);
    this.spawnSmokePlume(x, y - 2, big ? 6 : 3, big ? 0.95 : 0.7);
    if (big) {
      this.spawnRingWave(x, y, 2, 30, 0.35, color, 2);
      this.spawnRingWave(x, y, 2, 42, 0.5, 0xffffff, 1);
      this.shake(3, 100);
    } else {
      this.spawnRingWave(x, y, 1, 12, 0.25, color, 1.5);
    }
  }

  spawnMuzzleFlash(x: number, y: number, angle: number) {
    for (let i = 0; i < 5; i++) {
      const a = angle + (Math.random() - 0.5) * 0.8;
      const speed = 40 + Math.random() * 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.1 + Math.random() * 0.15,
        maxLife: 0.1 + Math.random() * 0.15,
        color: i === 0 ? 0xffffff : 0xffcc44,
        size: 2 + Math.random() * 2,
        gravity: 0,
        shrink: true,
        glow: true,
        alpha: 1,
      });
    }
    this.spawnRingWave(x, y, 2, 10, 0.16, 0xffcc44, 1);
  }

  registerAmbientZone(x: number, y: number, radius: number, color: number, rate = 1, kind: 'motes' | 'embers' = 'motes', drift = 12) {
    this.ambientZones.push({
      x,
      y,
      radius,
      color,
      rate,
      drift,
      kind,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  spawnAmbientMote(x: number, y: number, color: number, intensity = 1) {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 10 * intensity,
      vy: -4 - Math.random() * 10 * intensity,
      life: 0.7 + Math.random() * 1.1,
      maxLife: 0.7 + Math.random() * 1.1,
      color,
      size: 1 + Math.random() * 1.8 * intensity,
      gravity: -3,
      drag: 0.985,
      shrink: false,
      glow: true,
      alpha: 0.12 + Math.random() * 0.16,
    });
  }

  spawnEmber(x: number, y: number, color: number = 0xf97316, intensity = 1) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 6 * intensity,
      y: y + (Math.random() - 0.5) * 4 * intensity,
      vx: (Math.random() - 0.5) * 9 * intensity,
      vy: -16 - Math.random() * 16 * intensity,
      life: 0.4 + Math.random() * 0.5,
      maxLife: 0.4 + Math.random() * 0.5,
      color: Math.random() > 0.35 ? color : 0xfacc15,
      size: 0.8 + Math.random() * 1.5 * intensity,
      gravity: -10,
      drag: 0.98,
      shrink: true,
      glow: true,
      alpha: 0.5 + Math.random() * 0.25,
    });
  }

  private spawnAmbientDust() {
    const cam = this.scene.cameras.main;
    const vw = cam.worldView;
    if (!vw) return;
    const palette = [0xffffff, 0xc7f9cc, 0xffe2a8];
    this.ambientDust.push({
      x: vw.x + Math.random() * vw.width,
      y: vw.y + Math.random() * vw.height,
      vx: (Math.random() - 0.5) * 6,
      vy: -1 - Math.random() * 3,
      life: 3 + Math.random() * 6,
      maxLife: 3 + Math.random() * 6,
      size: 1 + Math.random() * 1.8,
      alpha: 0.05 + Math.random() * 0.14,
      color: palette[Math.floor(Math.random() * palette.length)],
      pulse: Math.random() * Math.PI * 2,
    });
  }

  update(delta: number) {
    const dt = delta / 1000;
    this.elapsed += dt;
    this.graphics.clear();
    this.glowGraphics.clear();

    this.applyShake();

    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      if (p.drag) {
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
      const alpha = (p.life / p.maxLife) * (p.alpha ?? 1);
      const sz = p.shrink ? p.size * alpha : p.size;
      this.graphics.fillStyle(p.color, alpha * 0.9);
      if ((p.elongation ?? 1) > 1.05) {
        this.graphics.fillEllipse(p.x, p.y, sz * (p.elongation ?? 1), sz);
      } else {
        this.graphics.fillCircle(p.x, p.y, sz);
      }
      if (p.glow && alpha > 0.18) {
        this.glowGraphics.fillStyle(p.color, alpha * 0.24);
        if ((p.elongation ?? 1) > 1.05) {
          this.glowGraphics.fillEllipse(p.x, p.y, sz * (p.elongation ?? 1) * 1.6, sz * 1.6);
        } else {
          this.glowGraphics.fillCircle(p.x, p.y, sz * 2.6);
        }
      }
      return true;
    });

    this.ringWaves = this.ringWaves.filter((r) => {
      r.life -= dt;
      if (r.life <= 0) return false;
      const progress = 1 - r.life / r.maxLife;
      r.radius = progress * r.maxRadius;
      const alpha = r.life / r.maxLife;
      this.glowGraphics.lineStyle(r.width * (1 + progress), r.color, alpha * 0.55);
      this.glowGraphics.strokeCircle(r.x, r.y, r.radius);
      this.graphics.lineStyle(r.width * 0.62, r.color, alpha * 0.95);
      this.graphics.strokeCircle(r.x, r.y, r.radius);
      return true;
    });

    this.weaponTrails = this.weaponTrails.filter((w) => {
      w.life -= dt;
      if (w.life <= 0) return false;
      const alpha = w.life / w.maxLife;
      const steps = 10;
      const startAngle = w.angle - w.arcSpan / 2;
      this.graphics.lineStyle(2.5 * alpha, w.color, alpha * 0.8);
      for (let i = 0; i < steps; i++) {
        const a1 = startAngle + (i / steps) * w.arcSpan;
        const a2 = startAngle + ((i + 1) / steps) * w.arcSpan;
        const x1 = w.x + Math.cos(a1) * w.radius;
        const y1 = w.y + Math.sin(a1) * w.radius;
        const x2 = w.x + Math.cos(a2) * w.radius;
        const y2 = w.y + Math.sin(a2) * w.radius;
        this.graphics.lineBetween(x1, y1, x2, y2);
      }
      this.glowGraphics.lineStyle(5 * alpha, w.color, alpha * 0.2);
      this.glowGraphics.beginPath();
      this.glowGraphics.arc(w.x, w.y, w.radius, startAngle, startAngle + w.arcSpan, false);
      this.glowGraphics.strokePath();
      return true;
    });

    for (let i = 0; i < this.textObjects.length; i++) this.textObjects[i].setVisible(false);
    this.texts = this.texts.filter((t) => {
      t.life -= dt;
      return t.life > 0;
    });
    for (let i = 0; i < this.texts.length && i < this.maxPoolSize; i++) {
      const t = this.texts[i];
      t.y -= 35 * dt;
      const obj = this.textObjects[i];
      if (!obj) continue;
      const lifeRatio = t.life / t.maxLife;
      const alpha = Math.min(1, lifeRatio / 0.4);
      const s = t.scale * (1 + (1 - lifeRatio) * 0.3);
      obj.setPosition(t.x, t.y)
        .setText(t.text)
        .setColor(t.color)
        .setAlpha(alpha)
        .setVisible(true)
        .setOrigin(0.5, 0.5)
        .setScale(s);
    }

    this.projectiles = this.projectiles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.t += dt;
      const progress = Math.min(1, p.t / p.totalTime);
      if (progress >= 1) return false;
      const nx = p.x + (p.tx - p.x) * progress;
      const ny = p.y + (p.ty - p.y) * progress - Math.sin(progress * Math.PI) * p.arc;
      p.trail.push({ x: nx, y: ny, alpha: 1 });
      if (p.trail.length > 14) p.trail.shift();

      for (let i = 1; i < p.trail.length; i++) {
        const prev = p.trail[i - 1];
        const cur = p.trail[i];
        const trailAlpha = (i / p.trail.length) * 0.34;
        this.glowGraphics.lineStyle(Math.max(1, p.size * (i / p.trail.length) * 0.8), p.glowColor ?? p.color, trailAlpha);
        this.glowGraphics.lineBetween(prev.x, prev.y, cur.x, cur.y);
        this.graphics.fillStyle(p.color, trailAlpha * 1.4);
        this.graphics.fillCircle(cur.x, cur.y, p.size * (i / p.trail.length) * 0.7);
      }

      this.glowGraphics.fillStyle(p.glowColor ?? p.color, 0.3);
      this.glowGraphics.fillCircle(nx, ny, p.size * 3.2);
      this.graphics.fillStyle(p.color, 1);
      this.graphics.fillCircle(nx, ny, p.size);
      this.graphics.fillStyle(0xffffff, 0.72);
      this.graphics.fillCircle(nx - 0.4, ny - 0.4, p.size * 0.45);
      return true;
    });

    const cam = this.scene.cameras.main;
    const vw = cam.worldView;
    for (const zone of this.ambientZones) {
      zone.pulse += dt * (0.8 + zone.rate * 0.35);
      const spawnChance = dt * zone.rate * 2.2;
      if (Math.random() < spawnChance) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * zone.radius;
        const px = zone.x + Math.cos(angle) * dist;
        const py = zone.y + Math.sin(angle) * dist * 0.72;
        if (!vw || (px >= vw.x - 80 && px <= vw.x + vw.width + 80 && py >= vw.y - 80 && py <= vw.y + vw.height + 80)) {
          if (zone.kind === 'embers') {
            this.spawnEmber(px, py, zone.color, 0.8 + Math.sin(zone.pulse) * 0.12);
          } else {
            this.spawnAmbientMote(px, py, zone.color, 0.8 + Math.sin(zone.pulse) * 0.16);
          }
        }
      }
    }
    if (vw) {
      this.ambientDust = this.ambientDust.filter((d) => {
        d.life -= dt;
        if (d.life <= 0) return false;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vx += (Math.random() - 0.5) * 0.5;
        d.pulse += dt * 2.4;
        if (d.x < vw.x - 20 || d.x > vw.x + vw.width + 20 || d.y < vw.y - 20 || d.y > vw.y + vw.height + 20) return false;
        const fadeIn = Phaser.Math.Clamp((d.maxLife - d.life) / (d.maxLife * 0.2), 0, 1);
        const fadeOut = Phaser.Math.Clamp(d.life / (d.maxLife * 0.28), 0, 1);
        const alpha = d.alpha * fadeIn * fadeOut * (0.8 + Math.sin(d.pulse) * 0.2);
        this.glowGraphics.fillStyle(d.color, alpha);
        this.glowGraphics.fillCircle(d.x, d.y, d.size);
        return true;
      });
      while (this.ambientDust.length < 28) {
        this.spawnAmbientDust();
      }
    }
  }
}
