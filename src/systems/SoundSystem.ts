import Phaser from 'phaser';
import { SOUND_MASTER } from '../config';

type SoundName =
  | 'click' | 'build' | 'melee' | 'bow' | 'death' | 'notify'
  | 'chop' | 'pick' | 'select' | 'order' | 'cancel' | 'victory' | 'defeat';

type VoiceName =
  | 'select' | 'order' | 'attack' | 'underAttack' | 'work' | 'build'
  | 'cancel' | 'victory' | 'defeat' | 'ready';

type SoundSettings = {
  musicVolume: number;
  effectsVolume: number;
  voiceVolume: number;
};

const STORAGE_KEY = 'try-rpg.sound-settings';
const DEFAULT_SETTINGS: SoundSettings = {
  musicVolume: 0.38,
  effectsVolume: 1,
  voiceVolume: 0.85,
};

const VOICE_LINES: Record<VoiceName, string[]> = {
  select: ['At your service.', 'Ready.', 'Awaiting orders.'],
  order: ['Moving out.', 'Yes, my lord.', 'On my way.'],
  attack: ['For the realm!', 'To arms!', 'Engaging the enemy.'],
  underAttack: ['We are under attack!', 'The enemy is upon us!'],
  work: ['Work, work.', 'Back to the mines.', 'Chopping wood.'],
  build: ['Construction started.', 'Raising the walls.'],
  cancel: ['Canceled.', 'Standing down.'],
  victory: ['Victory is ours!', 'The field is won.'],
  defeat: ['We have fallen.', 'The realm is lost.'],
  ready: ['Ready for battle.', 'Awaiting command.'],
};

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private lastPlay: Record<string, number> = {};
  private settings = this.loadSettings();
  private effectsGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private wantsMusic = false;
  private musicPlaying = false;
  private musicTimer: number | null = null;
  private musicBar = 0;
  private musicSources = new Set<AudioScheduledSourceNode>();

  private readonly resume = () => {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (this.wantsMusic) this.startMusicNow();
      });
      return;
    }

    if (this.wantsMusic) this.startMusicNow();
  };

  constructor(private scene: Phaser.Scene) {
    scene.input.on('pointerdown', this.resume);
    scene.input.keyboard?.on('keydown', this.resume);
  }

  setEnabled(v: boolean) { this.enabled = v; }

  startMusic() {
    this.wantsMusic = true;
    if (this.ctx?.state === 'running') this.startMusicNow();
  }

  stopMusic() {
    this.wantsMusic = false;
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped or not started yet.
      }
      source.disconnect();
    });
    this.musicSources.clear();
  }

  setMusicVolume(v: number) {
    this.settings.musicVolume = this.clamp01(v);
    this.applyVolumes();
    this.saveSettings();
  }

  setEffectsVolume(v: number) {
    this.settings.effectsVolume = this.clamp01(v);
    this.applyVolumes();
    this.saveSettings();
  }

  setVoiceVolume(v: number) {
    this.settings.voiceVolume = this.clamp01(v);
    this.applyVolumes();
    this.saveSettings();
  }

  getSettings(): SoundSettings {
    return { ...this.settings };
  }

  voice(name: VoiceName) {
    const lines = VOICE_LINES[name];
    if (!lines) return;
    this.speak(lines[Math.floor(Math.random() * lines.length)]);
  }

  speak(text: string) {
    if (!this.enabled || this.settings.voiceVolume <= 0) return;
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 0.78;
    utterance.volume = this.clamp01(this.settings.voiceVolume * SOUND_MASTER * 1.6);
    synth.cancel();
    synth.speak(utterance);
  }

  destroy() {
    this.stopMusic();
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
      case 'click':    this.click(); break;
      case 'select':   this.select(); break;
      case 'order':    this.order(); break;
      case 'build':    this.build(); break;
      case 'melee':    this.melee(); break;
      case 'bow':      this.bow(); break;
      case 'chop':     this.chop(); break;
      case 'pick':     this.pick(); break;
      case 'death':    this.death(); break;
      case 'notify':   this.notify(); break;
      case 'cancel':   this.cancel(); break;
      case 'victory':  this.victory(); break;
      case 'defeat':   this.defeat(); break;
    }
  }

  private click() {
    const t = this.time();
    this.tone(1060, 0.045, 'square', 0.12, t, 0.002, 0.02);
    this.tone(1820, 0.025, 'triangle', 0.06, t + 0.008, 0.001, 0.01);
  }

  private select() {
    const t = this.time();
    this.tone(420, 0.13, 'triangle', 0.16, t);
    this.tone(630, 0.12, 'sine', 0.12, t + 0.035);
    this.tone(980, 0.08, 'triangle', 0.05, t + 0.075);
  }

  private order() {
    const t = this.time();
    this.tone(196, 0.13, 'triangle', 0.12, t, 0.01, 0.06);
    this.sweep(780, 390, 0.16, 'sawtooth', 0.08, t, 0.004, 0.12);
    this.tone(520, 0.09, 'square', 0.05, t + 0.055, 0.002, 0.04);
  }

  private cancel() {
    const t = this.time();
    this.sweep(430, 145, 0.18, 'triangle', 0.16, t, 0.002, 0.13);
    this.noise(0.09, 0.11, 260, 0.9, t + 0.025, 'lowpass');
  }

  private build() {
    const t = this.time();
    this.noise(0.08, 0.2, 320, 1.6, t, 'bandpass');
    this.tone(180, 0.11, 'triangle', 0.14, t, 0.002, 0.07);
    this.noise(0.07, 0.16, 520, 1.4, t + 0.12, 'bandpass');
    this.tone(250, 0.1, 'square', 0.08, t + 0.13, 0.002, 0.06);
    this.chord([294, 370, 440], 0.34, 'triangle', 0.13, t + 0.23, 0.02);
  }

  private melee() {
    const t = this.time();
    this.noise(0.07, 0.28, 1450, 3.2, t, 'bandpass');
    this.sweep(220, 90, 0.12, 'sawtooth', 0.12, t, 0.001, 0.08);
    this.tone(1260, 0.16, 'triangle', 0.08, t + 0.018, 0.001, 0.11);
    this.tone(1810, 0.08, 'sine', 0.04, t + 0.045, 0.001, 0.05);
  }

  private bow() {
    const t = this.time();
    this.sweep(155, 720, 0.09, 'triangle', 0.1, t, 0.005, 0.045);
    this.noise(0.18, 0.12, 2600, 1.1, t + 0.045, 'highpass');
    this.sweep(1260, 390, 0.18, 'square', 0.06, t + 0.055, 0.001, 0.11);
  }

  private chop() {
    const t = this.time();
    this.tone(115, 0.11, 'triangle', 0.16, t, 0.001, 0.07);
    this.noise(0.09, 0.24, 640, 1.8, t + 0.012, 'bandpass');
    this.noise(0.05, 0.09, 1900, 1.2, t + 0.055, 'highpass');
  }

  private pick() {
    const t = this.time();
    this.noise(0.08, 0.18, 900, 2.2, t, 'bandpass');
    this.tone(980, 0.22, 'triangle', 0.13, t + 0.015, 0.001, 0.16);
    this.tone(1470, 0.16, 'sine', 0.07, t + 0.024, 0.001, 0.12);
  }

  private death() {
    const t = this.time();
    this.sweep(270, 55, 0.46, 'sawtooth', 0.2, t, 0.008, 0.34);
    this.noise(0.32, 0.12, 420, 0.8, t + 0.04, 'lowpass');
    this.tone(72, 0.24, 'triangle', 0.13, t + 0.22, 0.004, 0.17);
  }

  private notify() {
    const t = this.time();
    this.tone(660, 0.12, 'triangle', 0.15, t);
    this.tone(990, 0.16, 'sine', 0.12, t + 0.08);
    this.tone(1320, 0.1, 'triangle', 0.06, t + 0.14);
  }

  private victory() {
    const t = this.time();
    this.chord([262, 330, 392], 0.28, 'triangle', 0.18, t, 0.015);
    this.chord([330, 415, 494], 0.28, 'triangle', 0.18, t + 0.22, 0.015);
    this.chord([392, 494, 587, 784], 0.65, 'triangle', 0.22, t + 0.44, 0.02);
    this.noise(0.16, 0.1, 1800, 0.9, t + 0.43, 'highpass');
  }

  private defeat() {
    const t = this.time();
    this.chord([220, 175, 131], 0.55, 'sawtooth', 0.18, t, 0.03);
    this.sweep(180, 44, 0.76, 'triangle', 0.18, t + 0.12, 0.01, 0.55);
    this.noise(0.38, 0.12, 220, 0.8, t + 0.18, 'lowpass');
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtor) {
        this.enabled = false;
        return null;
      }

      try {
        this.ctx = new AudioCtor();
        this.effectsGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.voiceGain = this.ctx.createGain();
        this.effectsGain.connect(this.ctx.destination);
        this.musicGain.connect(this.ctx.destination);
        this.voiceGain.connect(this.ctx.destination);
        this.applyVolumes();
      } catch {
        this.enabled = false;
        return null;
      }
    }

    return this.ctx;
  }

  private startMusicNow() {
    if (this.musicPlaying || !this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
    this.musicPlaying = true;
    this.musicBar = 0;
    this.scheduleMusicLoop();
  }

  private scheduleMusicLoop() {
    if (!this.musicPlaying || !this.ctx) return;

    const tempo = 88;
    const beat = 60 / tempo;
    const barDur = beat * 8;
    const t = this.ctx.currentTime + 0.06;
    const roots = [110, 146.83, 98, 130.81];
    const root = roots[this.musicBar % roots.length];
    const minor = root * 1.1892;
    const fifth = root * 1.4983;

    this.musicChord([root, minor, fifth, root * 2], t, barDur * 0.94, 0.055);
    this.musicBass(root, t, beat);
    this.musicDrums(t, beat);
    this.musicArp([root * 2, fifth * 2, root * 4, minor * 4], t + beat * 0.5, beat);

    this.musicBar += 1;
    this.musicTimer = window.setTimeout(() => this.scheduleMusicLoop(), barDur * 1000);
  }

  private musicChord(freqs: number[], t: number, dur: number, gain: number) {
    freqs.forEach((freq, i) => {
      this.musicTone(freq, dur, i === 0 ? 'triangle' : 'sine', gain / freqs.length, t + i * 0.025, 0.35, dur * 0.82);
      this.musicTone(freq * 0.5, dur, 'sawtooth', gain / freqs.length / 2, t + i * 0.025, 0.5, dur * 0.7, 900);
    });
  }

  private musicBass(root: number, t: number, beat: number) {
    for (let i = 0; i < 8; i += 2) {
      const freq = i === 6 ? root * 1.4983 : root;
      this.musicTone(freq, beat * 0.75, 'triangle', 0.09, t + beat * i, 0.02, beat * 0.48, 240);
    }
  }

  private musicDrums(t: number, beat: number) {
    for (let i = 0; i < 8; i += 2) {
      this.musicNoise(beat * 0.42, 0.05, 110, 0.7, t + beat * i, 'lowpass');
      this.musicTone(68, beat * 0.34, 'sine', 0.045, t + beat * i, 0.003, beat * 0.2);
    }
    this.musicNoise(beat * 0.16, 0.035, 1700, 2.4, t + beat * 3, 'bandpass');
    this.musicNoise(beat * 0.16, 0.035, 1700, 2.4, t + beat * 7, 'bandpass');
  }

  private musicArp(notes: number[], t: number, beat: number) {
    notes.forEach((freq, i) => {
      this.musicTone(freq, beat * 0.42, 'triangle', 0.045, t + beat * i, 0.01, beat * 0.24, 2400);
    });
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    t = this.time(),
    attack = 0.006,
    release = dur * 0.72,
    filterFreq?: number,
  ) {
    this.osc(freq, dur, type, gain, t, attack, release, this.effectsGain, filterFreq);
  }

  private sweep(
    fromF: number,
    toF: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    t = this.time(),
    attack = 0.006,
    release = dur * 0.72,
  ) {
    if (!this.ctx || !this.effectsGain) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, fromF), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toF), t + dur);
    this.shapeGain(amp.gain, t, gain * SOUND_MASTER, attack, release, dur);
    osc.connect(amp).connect(this.effectsGain);
    this.startSource(osc, t, dur);
  }

  private chord(freqs: number[], dur: number, type: OscillatorType, gain: number, t = this.time(), stagger = 0.04) {
    freqs.forEach((freq, i) => {
      this.tone(freq, dur, type, gain / freqs.length, t + i * stagger);
      this.tone(freq * 2.01, dur * 0.65, 'sine', gain / freqs.length / 2, t + i * stagger + 0.01);
    });
  }

  private noise(
    dur: number,
    gain: number,
    filterFreq: number,
    q = 1.2,
    t = this.time(),
    filterType: BiquadFilterType = 'bandpass',
  ) {
    this.noiseTo(dur, gain, filterFreq, q, t, filterType, this.effectsGain);
  }

  private musicTone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    t: number,
    attack: number,
    release: number,
    filterFreq?: number,
  ) {
    this.osc(freq, dur, type, gain, t, attack, release, this.musicGain, filterFreq, true);
  }

  private musicNoise(
    dur: number,
    gain: number,
    filterFreq: number,
    q: number,
    t: number,
    filterType: BiquadFilterType,
  ) {
    this.noiseTo(dur, gain, filterFreq, q, t, filterType, this.musicGain, true);
  }

  private osc(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    t: number,
    attack: number,
    release: number,
    output: AudioNode | null,
    filterFreq?: number,
    track = false,
  ) {
    if (!this.ctx || !output) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    this.shapeGain(amp.gain, t, gain * SOUND_MASTER, attack, release, dur);

    if (filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, t);
      filter.Q.value = 0.8;
      osc.connect(filter).connect(amp).connect(output);
    } else {
      osc.connect(amp).connect(output);
    }

    this.startSource(osc, t, dur, track);
  }

  private noiseTo(
    dur: number,
    gain: number,
    filterFreq: number,
    q: number,
    t: number,
    filterType: BiquadFilterType,
    output: AudioNode | null,
    track = false,
  ) {
    if (!this.ctx || !output) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const fade = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * fade * fade;
    }

    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();
    src.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.Q.value = q;
    this.shapeGain(amp.gain, t, gain * SOUND_MASTER, 0.002, dur * 0.45, dur);
    src.connect(filter).connect(amp).connect(output);
    this.startSource(src, t, dur, track);
  }

  private shapeGain(param: AudioParam, t: number, gain: number, attack: number, release: number, dur: number) {
    const peak = Math.max(0.0001, gain);
    const end = t + Math.max(0.01, dur);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + Math.max(0.001, attack));
    param.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.55), t + Math.max(attack + 0.001, release));
    param.exponentialRampToValueAtTime(0.0001, end);
  }

  private startSource(source: AudioScheduledSourceNode, t: number, dur: number, track = false) {
    if (track) {
      this.musicSources.add(source);
      source.onended = () => this.musicSources.delete(source);
    }
    source.start(t);
    source.stop(t + dur + 0.04);
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.effectsGain?.gain.setTargetAtTime(this.settings.effectsVolume, t, 0.015);
    this.musicGain?.gain.setTargetAtTime(this.settings.musicVolume, t, 0.08);
    this.voiceGain?.gain.setTargetAtTime(this.settings.voiceVolume, t, 0.015);
  }

  private loadSettings(): SoundSettings {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<SoundSettings>;
      return {
        musicVolume: this.clamp01(parsed.musicVolume ?? DEFAULT_SETTINGS.musicVolume),
        effectsVolume: this.clamp01(parsed.effectsVolume ?? DEFAULT_SETTINGS.effectsVolume),
        voiceVolume: this.clamp01(parsed.voiceVolume ?? DEFAULT_SETTINGS.voiceVolume),
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings() {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage can be unavailable in private contexts; audio should keep working.
    }
  }

  private time() {
    return this.ctx?.currentTime ?? 0;
  }

  private clamp01(v: number) {
    if (!Number.isFinite(v)) return 0;
    return Math.min(1, Math.max(0, v));
  }
}
