import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const url = process.env.GAME_URL || 'http://localhost:4173/';
const out = path.resolve('artifacts/visual-checks');
await fs.mkdir(out, { recursive: true });
const reports = [];
for (const type of [chromium, webkit].filter(type => !process.env.GAME_BROWSER || type.name() === process.env.GAME_BROWSER)) {
  const browser = await type.launch({ headless: true });
  try {
    console.log(`Checking ${type.name()}...`);
    const context = await browser.newContext({ ...devices['iPad (gen 7) landscape'], viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    const tracks = [];
    page.on('request', req => { if (req.url().includes('/audio/')) tracks.push(req.url()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__game && document.querySelector('.start-button'));
    assert.equal(tracks.length, 0, 'BGM must not download before gameplay');
    assert(await page.evaluate(() => __game.audio.music.paused));
    await page.locator('.start-button').tap();
    try {
      await page.waitForFunction(() => __game.audio.music.currentTime > 0.1 && !__game.audio.music.paused && (!__game.audio.ctx || __game.audio.ctx.state === 'running'), null, { timeout: 15000 });
    } catch (error) {
      console.log(await page.evaluate(() => ({ state: __game.state, music: { time: __game.audio.music.currentTime,
        duration: __game.audio.music.duration, paused: __game.audio.music.paused, ready: __game.audio.music.readyState,
        error: __game.audio.music.error?.message, source: __game.audio.music.currentSrc },
        audio: __game.audio.ctx?.state, pending: __game.audio.musicPending, muted: __game.audio.muted })));
      console.log({ errors, tracks });
      throw error;
    }
    console.log(`${type.name()}: BGM playing`);
    assert(await page.evaluate(() => __game.audio.music.loop && __game.audio.music.duration > 179));
    await page.waitForFunction(() => __game.player.body.grounded);
    await page.screenshot({ path: path.join(out, `${type.name()}-polished-play.png`) });
    await page.evaluate(() => {
      const g = __game;
      g.manualStep = true;
      g.player.hp = 73; g.save.coins = 321;
      g.player.body.vy = 4; g.player.body.grounded = false;
      g.save.openedChests = [1]; g.world.setChestOpened(1, true);
      const z = g.zombies[0]; z.hp -= 7;
      window.beforeStyle = { tower: g.tower, body: g.player.body, zombie: z, root: z.root,
        position: [g.player.body.x, g.player.body.y, g.player.body.z], zHp: z.hp, time: g.time,
        weapon: g.currentWeapon, lava: g.lava, camera: g.cam.yaw, platforms: g.tower.platforms };
    });
    await page.locator('#btn-graphics').tap();
    const classic = await page.evaluate(() => {
      const g = __game; const b = beforeStyle;
      return { style: g.save.graphicsStyle, preserved: g.tower === b.tower && g.player.body === b.body &&
        g.zombies[0] === b.zombie && g.zombies[0].root === b.root && g.zombies[0].hp === b.zHp &&
        g.player.hp === 73 && g.save.coins === 321 && g.currentWeapon === b.weapon && g.lava === b.lava &&
        g.player.body.vy === 4 && g.time === b.time && !g.player.body.grounded &&
        JSON.stringify([g.player.body.x, g.player.body.y, g.player.body.z]) === JSON.stringify(b.position),
        opened: g.world.safeProps[1].chest.lid.rotation.x, flat: g.player.parts.head.children[0].geometry.type,
        music: !g.audio.music.paused };
    });
    assert.equal(classic.style, 'classic'); assert(classic.preserved, 'style swap changed live gameplay');
    assert.equal(classic.flat, 'BoxGeometry'); assert.equal(classic.opened, -1.9); assert(classic.music);
    await page.screenshot({ path: path.join(out, `${type.name()}-classic-play.png`) });
    await page.locator('#btn-pause').tap();
    await page.waitForFunction(() => __game.audio.music.paused && __game.state === 'paused');
    await page.getByRole('button', { name: '현재 그래픽', exact: true }).tap();
    assert.equal(await page.evaluate(() => __game.save.graphicsStyle), 'polished');
    const musicSlider = page.getByRole('slider', { name: 'BGM 볼륨' });
    await musicSlider.fill('60');
    await page.getByRole('slider', { name: '효과음 볼륨' }).fill('45');
    assert.deepEqual(await page.evaluate(() => [__game.save.musicVolume, __game.save.effectsVolume]), [0.6, 0.45]);
    await page.screenshot({ path: path.join(out, `${type.name()}-audio-settings.png`) });
    await page.getByRole('button', { name: '계속하기', exact: true }).tap();
    await page.waitForFunction(() => !__game.audio.music.paused);
    await page.locator('#btn-mute').tap();
    assert(await page.evaluate(() => __game.audio.muted && __game.audio.music.paused));
    await page.locator('#btn-mute').tap();
    await page.waitForFunction(() => !__game.audio.music.paused);
    // The real MP3 decodes; all weapon layers synthesize into a non-clipping waveform.
    const sound = await page.evaluate(async () => {
      const audio = __game.audio;
      if (!audio.ctx) return { duration: audio.music.duration, synthesisAvailable: false };
      const encoded = await (await fetch('/audio/one-false-move.mp3')).arrayBuffer();
      const decoded = await audio.ctx.decodeAudioData(encoded);
      const Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const off = new Context(1, 44100 * 2, 44100);
      const live = audio.ctx, master = audio.master, last = audio.lastImpact;
      audio.ctx = off; audio.master = off.createGain(); audio.master.gain.value = 0.52;
      const limiter = off.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 4;
      audio.master.connect(limiter); limiter.connect(off.destination);
      audio.noiseBuf = off.createBuffer(1, 44100, 44100);
      const n = audio.noiseBuf.getChannelData(0); for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
      audio.lastImpact = -1;
      audio.play('shotgun'); audio.playImpact({ kind: 'axe', level: 10 }, true);
      const rendered = await off.startRendering();
      let peak = 0, energy = 0;
      for (const value of rendered.getChannelData(0)) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
      audio.ctx = live; audio.master = master; audio.lastImpact = last;
      // Restore the live noise buffer after the isolated render.
      audio.noiseBuf = live.createBuffer(1, live.sampleRate, live.sampleRate);
      const d = audio.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return { duration: decoded.duration, peak, rms: Math.sqrt(energy / rendered.length) };
    });
    assert(sound.duration > 179 && sound.duration < 182);
    if (sound.synthesisAvailable !== false) assert(sound.peak > 0.05 && sound.peak < 1 && sound.rms > 0.005, 'silent or clipped impact');
    await page.locator('#btn-pause').tap();
    await page.getByRole('button', { name: '초기 블록 그래픽', exact: true }).tap();
    await page.reload();
    await page.waitForFunction(() => window.__game);
    assert.deepEqual(await page.evaluate(() => [__game.save.graphicsStyle, __game.save.musicVolume, __game.save.effectsVolume]), ['classic', 0.6, 0.45]);
    assert(await page.evaluate(() => __game.audio.music.paused));
    await page.locator('.start-button').tap();
    await page.waitForFunction(() => !__game.audio.music.paused && __game.audio.music.currentTime > 0.1);
    await page.locator('#btn-pause').tap();
    await page.getByRole('button', { name: '타이틀로', exact: true }).tap();
    await page.getByRole('button', { name: '새 모험', exact: true }).tap();
    assert.deepEqual(await page.evaluate(() => [__game.save.graphicsStyle, __game.save.musicVolume, __game.save.effectsVolume]), ['classic', 0.6, 0.45]);
    await page.locator('#btn-pause').tap();
    await page.getByRole('button', { name: '타이틀로', exact: true }).tap();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(out, `${type.name()}-classic-phone.png`) });
    const bounds = await page.locator('.lobby-graphics').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.locator('.start-button').tap();
    await page.locator('#btn-graphics').tap();
    assert.equal(await page.evaluate(() => __game.save.graphicsStyle), 'polished');
    let offline = 'not available';
    if (type === chromium && await page.evaluate(() => !!navigator.serviceWorker?.controller)) {
      // A complete cached MP3 must answer Safari-style byte ranges without network.
      await page.evaluate(() => fetch('/audio/one-false-move.mp3').then(r => r.arrayBuffer()));
      await context.setOffline(true);
      const range = await page.evaluate(async () => {
        const response = await fetch('/audio/one-false-move.mp3', { headers: { Range: 'bytes=0-1' } });
        return { status: response.status, bytes: (await response.arrayBuffer()).byteLength, type: response.headers.get('content-type') };
      });
      assert.deepEqual(range, { status: 206, bytes: 2, type: 'audio/mpeg' });
      await page.reload();
      await page.waitForFunction(() => window.__game && document.querySelector('.start-button'));
      await page.locator('.start-button').tap();
      await page.waitForFunction(() => !__game.audio.music.paused && __game.audio.music.currentTime > 0.1);
      await context.setOffline(false);
      offline = 'cached app and MP3 byte ranges passed';
    }
    assert.deepEqual(errors, []);
    reports.push({ browser: type.name(), music: sound, classic, offline, checks: 'play/pause/mute/volume/reload/new-run/phone/graphics preservation' });
    await context.close();
  } finally { await browser.close(); }
}
await fs.writeFile(path.join(out, 'audio-graphics-report.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
