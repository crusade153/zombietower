import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const label = process.env.GRAPHICS_LABEL || 'after';
const output = path.resolve('artifacts/visual-checks/graphics');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.GAME_BROWSER || undefined });
const errors = [];
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => {
    const g = __game;
    g.manualStep = true;
    g.save.seed = 424242;
    g.buildWorld();
    // Fixed resolution and shadow refresh make before/after counters comparable.
    g.adaptResolution = () => {};
    g.renderer.setPixelRatio(1);
    g.sceneRenderer.setSize();
    g.renderer.shadowMap.autoUpdate = true;
  });
  for (const stage of ['lobby', 0, 9]) {
    await page.evaluate((stage) => {
      const g = __game;
      if (stage === 'lobby') return;
      g.screens.hide();
      g.startRun(true);
      g.resetToSafe(stage);
      g.player.iframes = 0;
      g.time = 8;
      g.lava.update(0, g.player.body.y);
    }, stage);
    await page.waitForTimeout(300);
    results.push(await page.evaluate((stage) => {
      const g = __game;
      g.renderScene(stage === 'lobby' ? g.lobby.scene : g.scene, stage === 'lobby' ? g.lobby.camera : g.camera);
      return { stage, calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles };
    }, stage));
    await page.screenshot({ path: path.join(output, `${label}-${stage}.png`) });
  }
  const particles = await page.evaluate(() => {
    const g = __game;
    g.resetToSafe(0);
    g.updateView(0, 8);
    g.renderer.shadowMap.enabled = false;
    g.renderScene(g.scene, g.camera);
    const idle = g.renderer.info.render.calls;
    const b = g.player.body;
    g.fx.burst(b.x, b.y + 1, b.z, 0xffbb55, 240, 4, 1, 0.14);
    g.fx.update(0.05);
    g.renderScene(g.scene, g.camera);
    const active = g.renderer.info.render.calls;
    return { idle, active, extraCalls: active - idle };
  });
  await page.screenshot({ path: path.join(output, `${label}-particles.png`) });
  if (label !== 'before') {
    assert(particles.extraCalls <= 2, 'Burst particles must be batched');
    await page.evaluate(() => {
      const g = __game;
      g.fx.update(2);
      g.fx.burst(0, 0, 0, 0xffffff, 10000);
      if (g.fx.parts.length > g.fx.capacity) throw Error('Unbounded particle pool');
      g.fx.update(2);
      g.renderer.shadowMap.enabled = true;
    });
    const lifecycle = await page.evaluate(() => {
      const g = __game;
      const samples = [];
      for (let i = 0; i < 5; i++) {
        g.setGraphicsStyle('classic');
        g.setGraphicsStyle('polished');
        g.fx.burst(0, 0, 0, 0xffffff);
        g.buildWorld();
        g.resetToSafe(0);
        g.updateView(0, 8);
        g.renderScene(g.scene, g.camera);
        samples.push({ ...g.renderer.info.memory });
      }
      return samples;
    });
    assert(lifecycle.at(-1).geometries <= lifecycle[1].geometries + 2, 'World rebuild leaks geometries');
    assert(lifecycle.at(-1).textures <= lifecycle[1].textures + 2, 'World rebuild leaks textures');
    results.push({ lifecycle });
    await page.evaluate(() => {
      const g = __game;
      g.resetToSafe(4);
      g.lava.begin(1, 0);
      g.lava.freeze();
      g.lava.update(0, g.player.body.y);
      g.world.sync(g.time, g.player.body, g.lava.y);
    });
    await page.screenshot({ path: path.join(output, `${label}-frozen-lava.png`) });
    await page.evaluate(() => {
      const g = __game;
      let updates = 0;
      const sync = g.world.sync;
      g.world.sync = () => { updates++; };
      g.state = 'title';
      g.updateView(1 / 60, 8);
      g.world.sync = sync;
      if (updates) throw Error('Hidden world is still updated behind lobby');
    });
  }
  assert.deepEqual(errors, [], 'Browser errors');
  const report = { label, resolution: '1280x800 @ 1x', seed: 424242, results, particles, errors };
  await fs.writeFile(path.join(output, `${label}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
