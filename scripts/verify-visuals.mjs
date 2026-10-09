import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const url = process.env.GAME_URL || 'http://localhost:5173';
const output = path.resolve('artifacts/visual-checks');
await fs.mkdir(output, { recursive: true });
const browser = process.env.GAME_CDP
  ? await chromium.connectOverCDP(process.env.GAME_CDP)
  : await chromium.launch({ headless: true, channel: process.env.GAME_BROWSER || undefined });
const errors = [];
const reports = [];
const contexts = [];

async function makePage(viewport, hasTouch = false) {
  const context = await browser.newContext({ viewport, hasTouch });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.lobby && document.querySelector('.start-button'));
  return { context, page };
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  const stats = await page.evaluate(() => {
    const g = window.__game;
    const title = g.state === 'title';
    g.renderScene(title ? g.lobby.scene : g.scene, title ? g.lobby.camera : g.camera);
    const gl = g.renderer.getContext();
    const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const colors = new Set();
    let lit = 0;
    for (let i = 0; i < data.length; i += 256) {
      colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      if (data[i] + data[i + 1] + data[i + 2] > 30) lit++;
    }
    return { colors: colors.size, lit, calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles, fps: Math.round(1 / g._frameEma) };
  });
  assert(stats.colors > 80 && stats.lit > 100, `${name}: blank or flat canvas`);
  reports.push({ name, ...stats });
}

async function layout(page, selectors) {
  const issues = await page.evaluate((selectors) => {
    const els = selectors.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.getClientRects().length);
    const issues = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) issues.push(`outside: ${el.id || el.className}`);
      // The attack gauge intentionally extends beyond the button as a masked
      // pseudo-element. Check its actual icon/text bounds, not that decoration.
      let contentOverflow = el.scrollWidth > el.clientWidth + 2;
      if (contentOverflow && el.matches('.act-btn.attack')) {
        const content = document.createRange();
        content.selectNodeContents(el);
        const c = content.getBoundingClientRect();
        contentOverflow = c.left < r.left - 1 || c.right > r.right + 1;
      }
      if (contentOverflow) issues.push(`overflow: ${el.id || el.className}`);
    }
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      const a = els[i].getBoundingClientRect();
      const b = els[j].getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) issues.push(`overlap: ${els[i].id || els[i].className} / ${els[j].id || els[j].className}`);
    }
    return issues;
  }, selectors);
  assert.deepEqual(issues, [], JSON.stringify(page.viewportSize()));
}

try {
  const { context, page } = await makePage({ width: 1440, height: 900 });
  await capture(page, 'desktop-lobby');
  await layout(page, ['.lobby-top', '.lobby-menu', '.lobby-footer']);
  const first = PNG.sync.read(await page.screenshot());
  await page.waitForTimeout(200);
  const second = PNG.sync.read(await page.screenshot());
  let changed = 0;
  for (let i = 0; i < first.data.length; i += 4) if (Math.abs(first.data[i] - second.data[i]) + Math.abs(first.data[i + 1] - second.data[i + 1]) + Math.abs(first.data[i + 2] - second.data[i + 2]) > 12) changed++;
  assert(changed > 100, 'Lobby animation does not change rendered pixels');

  await page.getByRole('button', { name: '쉬움', exact: true }).click();
  assert.equal(await page.evaluate(() => __game.save.difficulty), 'easy');
  await page.getByRole('button', { name: '소리 끄기', exact: true }).click();
  assert.equal(await page.evaluate(() => __game.audio.muted), true);
  await page.locator('.start-button').click();
  await page.waitForFunction(() => __game.state === 'play' && __game.player.body.grounded && __game.player.iframes === 0);
  await capture(page, 'desktop-play');
  const origin = await page.evaluate(() => ({ x: __game.player.body.x, z: __game.player.body.z }));
  await page.keyboard.down('w');
  await page.waitForFunction((origin) => Math.hypot(__game.player.body.x - origin.x, __game.player.body.z - origin.z) > 1, origin);
  await page.keyboard.up('w');
  const baseY = await page.evaluate(() => __game.player.body.y);
  await page.keyboard.down('Space');
  await page.waitForFunction((y) => __game.player.body.y > y + 0.5, baseY);
  await page.keyboard.up('Space');
  await capture(page, 'desktop-jump');
  await page.keyboard.down('j');
  await page.waitForFunction(() => __game.player.swing !== null);
  await page.keyboard.up('j');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => __game.state === 'paused');
  await page.getByRole('button', { name: '계속하기', exact: true }).click();

  await page.evaluate(() => __game.resetToSafe(1));
  await page.getByRole('button', { name: /상자/ }).click();
  await page.getByRole('button', { name: '열기!', exact: true }).click();
  await page.waitForSelector('.reveal');
  await capture(page, 'chest-reward');
  await page.getByRole('button', { name: /장비\/강화/ }).click();
  assert(await page.locator('.card').count() >= 2, 'Chest reward was not added to inventory');
  await capture(page, 'forge');
  await page.getByRole('button', { name: '닫기', exact: true }).click();

  await page.evaluate(() => { __game.manualStep = true; });
  for (const stage of [2, 4, 6, 8, 10]) {
    await page.evaluate((stage) => {
      const g = __game;
      g.resetToSafe(stage);
      g.time += 4;
      g.world.sync(g.time, g.player.body, g.lava.y);
      g.scene.background.copy(g.world.fogTarget);
      g.scene.fog.color.copy(g.world.fogTarget);
    }, stage);
    await capture(page, `theme-${stage}`);
  }
  await page.evaluate(() => {
    const g = __game;
    const z = g.zombies.find((z) => z.stageIdx === 1 && !z.def.boss);
    const p = z.home;
    g.resetToSafe(0);
    g.player.reset(z.body.x + 1.8, p.maxY, z.body.z - 2.2, -0.6);
    g.player.iframes = 0;
    g.player.setWeapon(g.currentWeapon);
    g.cam.snapTo(g.player.body, { x: -0.4, z: 0.9 });
    g.world.sync(g.time + 1, g.player.body, g.lava.y);
    g.fx.slash(g.player.body.x, p.maxY, g.player.body.z, -0.6, 2.6, 100);
  });
  await capture(page, 'desktop-zombies');
  await context.close();

  const mobile = await makePage({ width: 390, height: 844 }, true);
  for (const [width, height, label] of [[390, 844, 'phone'], [320, 740, 'small-phone'], [844, 390, 'phone-landscape'], [1024, 768, 'tablet']]) {
    await mobile.page.setViewportSize({ width, height });
    await capture(mobile.page, `${label}-lobby`);
    await layout(mobile.page, ['.lobby-top', '.lobby-menu', '.lobby-footer']);
  }
  await mobile.page.setViewportSize({ width: 390, height: 844 });
  await mobile.page.locator('.start-button').tap();
  await mobile.page.waitForFunction(() => __game.player.body.grounded && __game.player.iframes === 0);
  await mobile.page.locator('#btn-jump').tap();
  await mobile.page.waitForFunction(() => __game.player.body.y > 0.2);
  await capture(mobile.page, 'phone-play');
  for (const [width, height, label] of [[320, 740, 'small-phone'], [844, 390, 'phone-landscape'], [1024, 768, 'tablet']]) {
    await mobile.page.setViewportSize({ width, height });
    await layout(mobile.page, ['#hud-left', '#hud-center', '#hud-right', '#btn-jump', '#btn-attack', '#btn-water', '#weapon-slots', '#dpad']);
    await capture(mobile.page, `${label}-play`);
  }
  await mobile.context.close();
  assert.deepEqual(errors, [], 'Browser reported errors');
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ animationChangedPixels: changed, errors, reports }, null, 2));
  console.log(JSON.stringify({ passed: true, screenshots: reports.length, animationChangedPixels: changed, errors, reports }, null, 2));
} finally {
  await Promise.allSettled(contexts.map((context) => context.close()));
  await browser.close();
}
