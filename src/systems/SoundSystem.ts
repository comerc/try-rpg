import Phaser from 'phaser';
import { SOUND_MASTER } from '../config';

type SoundName =
  | 'click' | 'build' | 'melee' | 'bow' | 'death' | 'notify'
  | 'chop' | 'pick' | 'select' | 'order' | 'cancel' | 'victory' | 'defeat';

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private lastPlay: Record<string, number> = {};
  private readonly resume = () => {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        this.enabled = false;
      }
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  };

  constructor(private scene: Phaser.Scene) {
    scene.input.on('pointerdown', this.resume);
    scene.input.keyboard?.on('keydown', this.resume);
  }

  setEnabled(v: boolean) { this.enabled = v; }

  destroy() {
    this.scene.input.off('pointerdown', this.resume);
    this.scene.input.keyboard?.off('keydown', this.resume);
  }

  play(name: SoundName) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const last = this.lastPlay[name] ?? 0;
    if (now - last < 0.04) return;
    this.lastPlay[name] = now;

    switch (name) {
      case 'click':    this.tone(880, 0.04, 'square', 0.15); break;
      case 'select':   this.tone(660, 0.05, 'triangle', 0.2); break;
      case 'order':    this.tone(520, 0.07, 'sine', 0.25); break;
      case 'build':    this.chord([330, 440, 550], 0.3, 'triangle', 0.2); break;
      case 'melee':    this.noise(0.06, 0.25, 800); break;
      case 'bow':      this.sweep(800, 200, 0.12, 'square', 0.18); break;
      case 'chop':     this.noise(0.08, 0.3, 400); break;
      case 'pick':     this.tone(260, 0.1, 'square', 0.18); break;
      case 'death':    this.sweep(300, 50, 0.3, 'sawtooth', 0.2); break;
      case 'notify':   this.chord([523, 659], 0.12, 'triangle', 0.18); break;
      case 'cancel':   this.sweep(440, 220, 0.08, 'triangle', 0.18); break;
      case 'victory':  this.chord([523, 659, 784, 1046], 0.6, 'triangle', 0.28); break;
      case 'defeat':   this.chord([220, 185, 147], 0.7, 'sawtooth', 0.22); break;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * SOUND_MASTER, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private sweep(fromF: number, toF: number, dur: number, type: OscillatorType, gain: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(fromF, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, toF), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * SOUND_MASTER, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private chord(freqs: number[], dur: number, type: OscillatorType, gain: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      const delay = i * 0.07;
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + delay);
      g.gain.linearRampToValueAtTime((gain / freqs.length) * SOUND_MASTER, t0 + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
      o.connect(g).connect(this.ctx!.destination);
      o.start(t0 + delay);
      o.stop(t0 + delay + dur + 0.02);
    });
  }

  private noise(dur: number, gain: number, bandpass: number) {
    if (!this.ctx) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = bandpass;
    filter.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.value = gain * SOUND_MASTER;
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start();
  }
}
