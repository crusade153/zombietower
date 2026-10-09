import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const label = process.env.LOOK_LABEL || 'v2';
const output = path.resolve('artifacts/visual-checks/graphics');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.GAME_BROWSER || undefined });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => {
    const g = __game;
    g.frame = () => {};
    g.manualStep = true;
    g.save.seed = 424242;
    g.buildWorld();
    g.renderer.setPixelRatio(1);
    g.renderer.setSize(1280, 800, false);
    g.sceneRenderer?.setSize();
    g.renderer.shadowMap.autoUpdate = true;
    g.lobby.update(2);
    if (g.renderScene) g.renderScene(g.lobby.scene, g.lobby.camera);
    else g.renderer.render(g.lobby.scene, g.lobby.camera);
  });
  await page.screenshot({ path: path.join(output, `look-${label}-lobby.png`) });
  for (const shot of ['start', 'combat']) {
    await page.evaluate((shot) => {
      const g = __game;
      g.screens.hide();
      g.startRun(true);
      g.resetToSafe(0);
      g.player.iframes = 0;
      g.time = g.lava.time = 8;
      if (shot === 'combat') {
        const z = g.zombies.find(z => z.stageIdx === 1 && !z.def.boss);
        g.player.reset(z.body.x + 1.8, z.home.maxY, z.body.z - 2.2, -0.6);
        g.player.iframes = 0;
        g.cam.snapTo(g.player.body, { x: -0.4, z: 0.9 });
      }
      g.lava.update(0, g.player.body.y);
      g.updateView(0, 8);
      g.scene.background.copy(g.world.fogTarget);
      g.scene.fog.color.copy(g.world.fogTarget);
      for (const { flame } of g.world.torches) flame.scale.set(1, 1, 1);
      if (g.renderScene) g.renderScene(g.scene, g.camera);
      else g.renderer.render(g.scene, g.camera);
    }, shot);
    await page.screenshot({ path: path.join(output, `look-${label}-${shot}.png`) });
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  console.log(`Captured ${label}: lobby, start, combat; no browser errors`);
} finally { await browser.close(); }
