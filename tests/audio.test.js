import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSys } from '../src/core/Audio.js';

class Media {
  constructor(src) { this.src = src; this.paused = true; this.currentTime = 41; this.play = vi.fn(() => { this.paused = false; return Promise.resolve(); }); }
  setAttribute() {}
  pause() { this.paused = true; }
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function ready() {
  const audio = new AudioSys();
  audio.ctx = { currentTime: 1, state: 'running' };
  audio.master = audio.musicGain = { gain: { setTargetAtTime: vi.fn() } };
  return audio;
}
beforeEach(() => { vi.stubGlobal('document', { hidden: false }); vi.stubGlobal('Audio', Media); });
afterEach(() => vi.unstubAllGlobals());

describe('BGM playback lifecycle', () => {
  it('waits for gameplay, loops, and preserves the playback position through pause', async () => {
    const audio = ready();
    expect(audio.music.preload).toBe('none');
    expect(audio.music.loop).toBe(true);
    expect(audio.music.play).not.toHaveBeenCalled();
    audio.setPlaying(true);
    await tick();
    expect(audio.music.paused).toBe(false);
    audio.setPlaying(false);
    expect(audio.music.paused).toBe(true);
    audio.setPlaying(true);
    await tick();
    expect(audio.music.currentTime).toBe(41);
    expect(audio.music.paused).toBe(false);
  });
  it('stops on mute, backgrounding and zero music volume; effects volume remains independent', async () => {
    const audio = ready();
    audio.setPlaying(true); await tick();
    audio.setVolume('effects', 0);
    expect(audio.music.paused).toBe(false);
    audio.setVolume('music', 0);
    expect(audio.music.paused).toBe(true);
    audio.setVolume('music', 0.6); await tick();
    expect(audio.music.paused).toBe(false);
    audio.setBackground(true);
    expect(audio.music.paused).toBe(true);
    audio.setBackground(false); await tick();
    audio.setMuted(true);
    expect(audio.music.paused).toBe(true);
    audio.setMuted(false); await tick();
    expect(audio.music.paused).toBe(false);
    expect(audio.effectsVolume).toBe(0);
  });
  it('a late successful play promise cannot restart paused music', async () => {
    const audio = ready();
    let resolve;
    audio.music.play.mockImplementation(() => new Promise(r => { resolve = () => { audio.music.paused = false; r(); }; }));
    audio.setPlaying(true);
    audio.setPlaying(false);
    resolve(); await tick();
    expect(audio.music.paused).toBe(true);
  });
  it('recovers from blocked autoplay on the next gesture', async () => {
    const audio = ready();
    audio.music.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    audio.setPlaying(true); await tick();
    expect(audio.musicPending).toBe(false);
    audio.unlock(); await tick();
    expect(audio.music.paused).toBe(false);
    expect(audio.music.play).toHaveBeenCalledTimes(2);
  });
  it('keeps BGM available without Web Audio support', async () => {
    vi.stubGlobal('window', {});
    const audio = new AudioSys();
    audio.unlock();
    audio.setPlaying(true); await tick();
    expect(audio.music.paused).toBe(false);
    audio.setVolume('music', 0.5);
    expect(audio.music.volume).toBe(0.325);
    audio.setMuted(true);
    expect(audio.music.paused).toBe(true);
  });
});
