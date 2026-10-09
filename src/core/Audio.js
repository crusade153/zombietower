// WebAudio로 만든 간단한 효과음 (파일 없음). iOS는 첫 터치에서 unlock() 필요.
import { WEAPONS } from '../config/weapons.js';

export class AudioSys {
  constructor({ musicVolume = 0.35, effectsVolume = 0.8 } = {}) {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
    this.rumble = null;
    this.musicVolume = musicVolume;
    this.effectsVolume = effectsVolume;
    this.playing = false;
    this.background = document.hidden;
    this.music = new Audio('/audio/one-false-move.mp3');
    this.music.loop = true;
    this.music.preload = 'none';
    this.music.setAttribute('playsinline', '');
    this.musicGain = null;
    this.musicPending = false;
    this.lastImpact = -1;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this._updateVolumes(); this._syncMusic(); return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      // A shared compressor keeps rapid fire and multiple simultaneous hits in range.
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.14;
      this.compressor.connect(this.ctx.destination);
      this.master.connect(this.compressor);
      this.musicGain = this.ctx.createGain();
      this.musicSource = this.ctx.createMediaElementSource(this.music);
      this.musicSource.connect(this.musicGain);
      this.musicGain.connect(this.compressor);
      this._updateVolumes();
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._startRumble();
    }
    if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') this.ctx.resume().catch(() => {});
    this._syncMusic();
  }

  setMuted(m) {
    this.muted = m;
    this._updateVolumes();
    this._syncMusic();
  }

  setVolume(channel, volume) {
    if (!['music', 'effects'].includes(channel) || !Number.isFinite(volume)) return;
    this[`${channel}Volume`] = Math.max(0, Math.min(1, volume));
    this._updateVolumes();
    this._syncMusic();
  }

  _updateVolumes() {
    if (!this.ctx) {
      // Media playback can still work on browsers without the Web Audio API.
      this.music.volume = this.musicVolume * 0.65;
      this.music.muted = this.muted || this.background;
      return;
    }
    this.master.gain.setTargetAtTime(this.muted || this.background ? 0 : this.effectsVolume * 0.65, this.ctx.currentTime, 0.025);
    this.musicGain.gain.setTargetAtTime(this.muted || this.background ? 0 : this.musicVolume * 0.65, this.ctx.currentTime, 0.08);
  }

  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing;
    if (!playing && this.rumble) this.rumble.gain.value = 0;
    this._syncMusic();
  }

  setBackground(background) {
    this.background = background;
    this._updateVolumes();
    this._syncMusic();
  }

  _wantsMusic() { return this.playing && !this.background && !this.muted && this.musicVolume > 0; }

  _syncMusic() {
    if (!this._wantsMusic()) { this.music.pause(); return; }
    if (this.musicPending || !this.music.paused) return;
    this.musicPending = true;
    this.music.play().then(() => {
      // A pause/mute can arrive while Safari is still starting the stream.
      if (!this._wantsMusic()) this.music.pause();
    }).catch(() => { /* Retry on the next user gesture when autoplay is blocked. */ })
      .finally(() => { this.musicPending = false; });
  }

  _startRumble() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
    this.rumble = g;
  }

  /** 용암과의 가까움(0~1)에 따라 으르렁 소리 */
  setLavaProximity(v) {
    if (this.rumble) this.rumble.gain.setTargetAtTime(this.playing ? Math.max(0, Math.min(1, v)) * 0.55 : 0, this.ctx.currentTime, 0.2);
  }

  _tone(freq, freq2, dur, type = 'square', vol = 0.2, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  _noise(dur, vol = 0.3, f0 = 2000, f1 = 400, type = 'bandpass', delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5, dur + 0.05);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }

  /** 보스전: BGM을 조금 빠르게 + 북소리 반주 */
  setBossMode(on) {
    if (on === !!this.bossMode) return;
    this.bossMode = on;
    try { this.music.playbackRate = on ? 1.1 : 1; } catch (e) { /* 무시 */ }
    clearInterval(this._bossTimer);
    this._bossBeat = 0;
    if (on) this._bossTimer = setInterval(() => this._bossTick(), 235);
  }

  _bossTick() {
    if (!this.ctx || this.muted || this.background || !this.playing) return;
    const i = this._bossBeat++ % 8;
    if (i === 0 || i === 3 || i === 4) this._tone(70, 38, 0.2, 'sine', 0.55); // 킥
    if (i === 2 || i === 6) this._noise(0.12, 0.28, 2600, 900, 'bandpass'); // 스네어
    if (i % 2 === 1) this._noise(0.03, 0.08, 9000, 6000, 'highpass'); // 하이햇
  }

  playImpact(weapon = {}, killed = false) {
    if (!this.ctx || this.muted || this.background) return;
    const now = this.ctx.currentTime;
    // Shotgun pellets and axe area hits share one transient instead of clipping.
    if (now - this.lastImpact < 0.045) return;
    this.lastImpact = now;
    const weight = 1 + Math.min(10, weapon.level || 0) * 0.015;
    const pitch = 0.94 + Math.random() * 0.12;
    const kind = WEAPONS[weapon.kind]?.baseKind || weapon.kind || 'bat';
    this._noise(0.045, 0.42 * weight, 3200 * pitch, 900, 'bandpass');
    this._tone((kind === 'axe' ? 135 : 190) * pitch, 45, 0.16, 'sine', 0.48 * weight);
    this._noise(0.14, 0.32, 650, 110, 'lowpass', 0.015);
    if (kind === 'axe') this._tone(1050 * pitch, 420, 0.12, 'triangle', 0.13, 0.008);
    if (kind === 'whip') this._noise(0.035, 0.36, 5800, 2000, 'highpass');
    if (['pistol', 'rifle', 'shotgun'].includes(kind)) this._noise(0.06, 0.25, 1800, 350);
    if (killed) {
      this._tone(85, 32, 0.22, 'sine', 0.4, 0.018);
      this._noise(0.18, 0.19, 1300, 180, 'lowpass', 0.025);
    }
  }

  play(name) {
    if (!this.ctx || this.muted || this.background) return;
    switch (name) {
      case 'jump': this._tone(260, 560, 0.14, 'square', 0.12); break;
      case 'land': this._noise(0.07, 0.18, 500, 150, 'lowpass'); break;
      case 'swing': case 'swing-bat': this._noise(0.14, 0.27, 1400, 350); this._tone(210, 80, 0.1, 'triangle', 0.08); break;
      case 'swing-axe': this._noise(0.2, 0.3, 2100, 280); this._tone(340, 90, 0.15, 'triangle', 0.12); break;
      case 'whip': this._noise(0.08, 0.38, 6000, 1600, 'highpass'); this._tone(1200, 180, 0.055, 'triangle', 0.13); break;
      case 'hit': this.playImpact(); break;
      case 'pistol': this._noise(0.045, 0.55, 6500, 1400, 'highpass'); this._tone(260, 55, 0.14, 'sine', 0.45); this._noise(0.14, 0.25, 1300, 180, 'lowpass', 0.015); break;
      case 'rifle': this._noise(0.032, 0.44, 5500, 1800, 'highpass'); this._tone(210, 65, 0.09, 'triangle', 0.3); this._noise(0.065, 0.2, 1600, 400, 'bandpass', 0.009); break;
      case 'shotgun': this._noise(0.065, 0.65, 5000, 600, 'highpass'); this._tone(150, 32, 0.27, 'sine', 0.6); this._noise(0.25, 0.4, 1600, 90, 'lowpass', 0.025); this._tone(700, 210, 0.06, 'triangle', 0.1, 0.18); break;
      case 'reload': this._tone(500, 700, 0.05, 'square', 0.1); this._tone(700, 500, 0.05, 'square', 0.1, 0.18); break;
      case 'empty': this._tone(200, 150, 0.04, 'square', 0.1); break;
      case 'crit': this._noise(0.05, 0.4, 7000, 3000, 'highpass'); this._tone(1600, 900, 0.1, 'triangle', 0.2); this._tone(170, 45, 0.2, 'sine', 0.45); break;
      case 'combo': [660, 880, 1175].forEach((f, i) => this._tone(f, f * 1.02, 0.1, 'square', 0.11, i * 0.06)); break;
      case 'nearmiss': this._noise(0.28, 0.3, 700, 4200, 'bandpass'); this._tone(988, 988, 0.1, 'triangle', 0.17, 0.1); this._tone(1480, 1480, 0.18, 'triangle', 0.17, 0.18); break;
      case 'boom': this._noise(0.6, 0.75, 900, 50, 'lowpass'); this._tone(95, 28, 0.5, 'sine', 0.7); this._noise(0.12, 0.4, 4000, 800, 'bandpass'); break;
      case 'fuse': [0, 0.16, 0.3, 0.42, 0.52, 0.6, 0.67].forEach((d) => this._tone(1400, 1400, 0.03, 'square', 0.07, d)); this._noise(0.75, 0.12, 6000, 3000, 'highpass'); break;
      case 'block': this._tone(950, 640, 0.09, 'triangle', 0.2); this._tone(1900, 1500, 0.06, 'triangle', 0.08); this._noise(0.05, 0.3, 5000, 2500, 'highpass'); break;
      case 'gold': [1046, 1318, 1568, 2093].forEach((f, i) => this._tone(f, f, 0.12, 'triangle', 0.13, i * 0.05)); break;
      case 'star': [784, 988, 1175, 1568].forEach((f, i) => this._tone(f, f * 1.01, 0.2, 'triangle', 0.18, i * 0.11)); break;
      case 'charged': this._tone(660, 1320, 0.16, 'triangle', 0.16); this._tone(1320, 1320, 0.1, 'square', 0.06, 0.12); break;
      case 'special': this._noise(0.35, 0.45, 600, 5000, 'bandpass'); this._tone(220, 880, 0.25, 'sawtooth', 0.16); this._tone(110, 40, 0.35, 'sine', 0.5, 0.05); break;
      case 'jump2': this._tone(420, 900, 0.14, 'triangle', 0.13); this._noise(0.12, 0.15, 3000, 6000, 'bandpass'); break;
      case 'dash': this._noise(0.18, 0.4, 800, 5000, 'bandpass'); this._tone(300, 600, 0.08, 'triangle', 0.08); break;
      case 'spring': this._tone(180, 900, 0.3, 'sine', 0.3); this._tone(360, 1200, 0.18, 'triangle', 0.1, 0.05); break;
      case 'cloak': this._noise(0.5, 0.25, 2000, 6000, 'bandpass'); [880, 660, 990].forEach((f, i) => this._tone(f, f, 0.14, 'sine', 0.1, i * 0.08)); break;
      case 'bossroar': this._tone(90, 45, 1.1, 'sawtooth', 0.32); this._noise(1.0, 0.45, 600, 60, 'lowpass'); this._tone(55, 30, 1.2, 'sine', 0.6, 0.1); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this._tone(f, f, 0.24, 'triangle', 0.2, i * 0.11)); break;
      case 'achieve': [784, 1046, 1318, 1568].forEach((f, i) => this._tone(f, f, 0.18, 'square', 0.1, i * 0.07)); this._tone(2093, 2093, 0.4, 'triangle', 0.1, 0.3); break;
      case 'coin': this._tone(880, 880, 0.07, 'square', 0.1); this._tone(1320, 1320, 0.12, 'square', 0.1, 0.07); break;
      case 'heal': this._tone(520, 1040, 0.25, 'sine', 0.2); break;
      case 'hurt': this._tone(200, 70, 0.25, 'sawtooth', 0.28); this._noise(0.12, 0.3, 700, 150, 'lowpass'); break;
      case 'die': this._tone(300, 40, 0.7, 'sawtooth', 0.3); this._noise(0.6, 0.35, 1200, 80, 'lowpass'); break;
      case 'zdie': this._tone(140, 40, 0.3, 'sawtooth', 0.18); this._noise(0.18, 0.2, 800, 100, 'lowpass'); break;
      case 'zgrowl': this._tone(90, 60, 0.35, 'sawtooth', 0.1); break;
      case 'spit': this._noise(0.15, 0.25, 1400, 600); break;
      case 'slam': this._noise(0.4, 0.6, 400, 40, 'lowpass'); this._tone(70, 30, 0.4, 'square', 0.3); break;
      case 'water': this._noise(0.7, 0.5, 3000, 800, 'highpass'); break;
      case 'steam': this._noise(0.5, 0.25, 5000, 2500, 'highpass'); break;
      case 'beat': this._tone(55, 40, 0.13, 'sine', 0.5); this._tone(50, 38, 0.13, 'sine', 0.4, 0.18); break;
      case 'chest': [523, 659, 784, 1046].forEach((f, i) => this._tone(f, f, 0.18, 'square', 0.12, i * 0.09)); break;
      case 'rare': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this._tone(f, f, 0.22, 'triangle', 0.2, i * 0.08)); break;
      case 'upgrade': this._tone(440, 880, 0.12, 'square', 0.14); this._tone(660, 1320, 0.2, 'square', 0.14, 0.1); break;
      case 'safe': [392, 523, 659].forEach((f, i) => this._tone(f, f, 0.25, 'triangle', 0.18, i * 0.12)); break;
      case 'ui': this._tone(600, 700, 0.05, 'square', 0.08); break;
      case 'checkpoint': this._tone(660, 990, 0.18, 'triangle', 0.18); break;
      case 'warn': this._tone(440, 440, 0.1, 'square', 0.12); this._tone(330, 330, 0.1, 'square', 0.12, 0.14); break;
      default:
    }
  }
}
