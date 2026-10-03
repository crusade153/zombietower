// WebAudio로 만든 간단한 효과음 (파일 없음). iOS는 첫 터치에서 unlock() 필요.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
    this.rumble = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._startRumble();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
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
    if (this.rumble) this.rumble.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.55, this.ctx.currentTime, 0.2);
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
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump': this._tone(260, 560, 0.14, 'square', 0.12); break;
      case 'land': this._noise(0.07, 0.18, 500, 150, 'lowpass'); break;
      case 'swing': this._noise(0.14, 0.25, 1800, 500); break;
      case 'whip': this._noise(0.1, 0.3, 4200, 1200, 'bandpass'); this._tone(900, 200, 0.08, 'sawtooth', 0.08); break;
      case 'hit': this._noise(0.1, 0.35, 900, 200, 'lowpass'); this._tone(160, 60, 0.1, 'square', 0.15); break;
      case 'pistol': this._noise(0.09, 0.4, 3000, 600); this._tone(380, 90, 0.1, 'square', 0.14); break;
      case 'rifle': this._noise(0.06, 0.32, 3200, 800); this._tone(300, 100, 0.06, 'square', 0.1); break;
      case 'shotgun': this._noise(0.22, 0.55, 2200, 200); this._tone(130, 40, 0.2, 'sawtooth', 0.22); break;
      case 'reload': this._tone(500, 700, 0.05, 'square', 0.1); this._tone(700, 500, 0.05, 'square', 0.1, 0.18); break;
      case 'empty': this._tone(200, 150, 0.04, 'square', 0.1); break;
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
