import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const url = process.env.GAME_URL || 'http://localhost:5173/';
const out = path.resolve('artifacts/visual-checks');
await fs.mkdir(out, { recursive: true });
const reports = [];
for (const type of [webkit, chromium]) {
  const browser = await type.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...devices['iPad (gen 7) landscape'], viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__game && document.querySelector('.start-button'), { timeout: 30000 });
    await page.screenshot({ path: path.join(out, `ipad-${type.name()}-lobby.png`) });
    await page.locator('.start-button').tap();
    await page.waitForFunction(() => __game.state === 'play' && __game.player.body.grounded);
    const budget = await page.evaluate(() => ({ ratio: __game.maxRatio, shadow: __game.world.sun.shadow.mapSize.x, coarse: __game.touchDevice }));
    assert(budget.coarse && budget.ratio <= 1.5 && budget.shadow === 1024, 'tablet render budget');
    const jump = await page.locator('#btn-jump').boundingBox();
    const up = await page.locator('#dpad .up').boundingBox();
    const baseline = await page.evaluate(() => ({ x: __game.player.body.x, y: __game.player.body.y, z: __game.player.body.z }));
    if (type === chromium) {
      const cdp = await context.newCDPSession(page);
      const finger = { id: 0, x: up.x + up.width / 2, y: up.y + up.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger, { id: 1, x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 }] });
      await page.waitForFunction(y => __game.player.body.y > y + 0.5 && __game.input.dpad.up, baseline.y);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [finger] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await page.evaluate(() => __game.input.dpad.up || __game.input.jumpHeld), false, 'multi-touch releases cleanly');
    } else {
      await page.locator('#btn-jump').tap();
      await page.waitForFunction(y => __game.player.body.y > y + 0.5, baseline.y);
    }
    await page.locator('#btn-attack').dispatchEvent('pointerdown', { pointerId: 80, pointerType: 'touch', button: 0 });
    await page.waitForFunction(() => __game.player.swing !== null);
    await page.locator('#btn-attack').dispatchEvent('pointerup', { pointerId: 80, pointerType: 'touch', button: 0 });
    await page.locator('#btn-pause').tap();
    await page.getByRole('button', { name: /클리어한 층에서 시작/ }).tap();
    assert.equal(await page.locator('[data-floor="1"]').isDisabled(), true, 'locked floor button');
    await page.locator('[data-act="floor-go"][data-floor="0"]').tap();
    await page.waitForFunction(() => __game.state === 'play');
    const saveCheck = await page.evaluate(() => {
      const g = __game;
      g.save.coins = 400;
      g.save.weapons[0].level = 0;
      g.upgradeWeapon(g.save.weapons[0]);
      g.markDirty(true);
      g.pause();
      return { coins: g.save.coins, level: g.save.weapons[0].level };
    });
    assert.deepEqual(saveCheck, { coins: 392, level: 1 });
    await page.reload();
    await page.waitForFunction(() => window.__game && document.querySelector('.start-button'));
    assert.deepEqual(await page.evaluate(() => ({ coins: __game.save.coins, level: __game.save.weapons[0].level })), saveCheck, 'Safari reload preserves save');
    await page.locator('.start-button').tap();
    await page.waitForFunction(() => __game.state === 'play');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(out, `ipad-${type.name()}-play.png`) });
    await page.locator('#btn-pause').tap();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '저장 파일 가져오기', exact: true }).tap();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'tower-save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ v: 1, rarityVersion: 2, coins: 1234, lastSafe: 3, weapons: [{ uid: 7, kind: 'rifle', rarity: 6, level: 7 }], equipped: [7, null, null] })) });
    await page.waitForFunction(() => window.__game?.save.coins === 1234 && __game.state === 'title');
    assert.equal(await page.evaluate(() => __game.save.weapons[0].rarity), 6, 'backup import restores top-tier gun');
    assert.equal(await page.evaluate(() => __game.save.lastSafe), 3, 'backup import restores cleared floors');
    assert.deepEqual(errors, [], `${type.name()} browser errors`);
    reports.push({ browser: type.name(), passed: true, touchJump: true, multitouch: type === chromium, saveReload: true, backupImport: true, budget, errors });
    console.log(`${type.name()}: iPad touch, menu, upgrade and save passed`);
  } finally {
    await browser.close();
  }
}
await fs.writeFile(path.join(out, 'ipad-report.json'), JSON.stringify({ url, reports }, null, 2));
console.log(JSON.stringify({ passed: true, reports }));
