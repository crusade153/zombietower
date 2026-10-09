import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const output = path.resolve('artifacts/visual-checks/weapons');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.GAME_BROWSER || undefined });
const errors = [], report = {};
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__game?.lobby);
  await page.evaluate(() => {
    const g = window.__game;
    g.save.seed = 424242; g.startRun(true);
    g.frame = () => {}; g.audio.muted = true;
    g.save.rarityVersion = 3; g.save.coins = 100000;
    g.save.nextUid = 5;
    g.save.weapons = [
      { uid: 1, kind: 'bat', rarity: 1, level: 5 },
      { uid: 2, kind: 'axe', rarity: 4, level: 10 },
      { uid: 3, kind: 'rifle', rarity: 3, level: 6 },
      { uid: 4, kind: 'shotgun', rarity: 2, level: 0 },
    ];
    g.save.equipped = [1, 2, 4]; g.slot = 0; g.refreshSlots();
    g.state = 'modal'; g.screens.showForge(1);
  });
  await page.locator('[data-act="fusion"]').click();
  assert(await page.locator('[data-act="fusion-create"]').isDisabled());
  for (const uid of [1, 2, 3]) await page.locator(`[data-act="fusion-select"][data-uid="${uid}"]`).click();
  await page.waitForTimeout(300);
  assert(await page.locator('.detail').innerText().then(t => t.includes('전설 뇌명 전투망치 +10')));
  await page.screenshot({ path: path.join(output, 'fusion-preview.png') });
  await page.locator('[data-act="fusion-create"]').click();
  report.fusion = await page.evaluate(() => {
    const g = window.__game;
    return { weapons: g.save.weapons, equipped: g.save.equipped, model: g.player.weaponKind, pending: g.pending };
  });
  assert.equal(report.fusion.weapons.length, 2);
  assert.equal(report.fusion.model, 'thunderHammer');
  assert.deepEqual(report.fusion.equipped, [5, null, 4]);
  await page.waitForTimeout(750);
  await page.screenshot({ path: path.join(output, 'fusion-result.png') });
  // The +10 -> +11 upgrade changes the live hand model and preview to golden awakening.
  await page.locator('[data-act="upgrade"]').click();
  assert(await page.locator('.appearance-badge').innerText().then(t => t.includes('황금 각성')));
  const upgraded = await page.evaluate(() => window.__game.player.weaponMesh.userData.appearance.tier);
  assert.equal(upgraded, 3);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(output, 'upgrade-11.png') });
  // Capture real 3D models at each threshold, with one reused preview context.
  const kinds = ['bat', 'thunderHammer', 'eclipseReaper', 'infernoChain', 'pulsePistol', 'tempestRifle', 'dragonShotgun'];
  for (const kind of kinds) for (const level of [1, 6, 11]) {
    await page.evaluate(({ kind, level }) => {
      const g = window.__game;
      g.save.weapons = [{ uid: 20, kind, rarity: 5, level }];
      g.save.equipped = [20, null, null]; g.refreshSlots(); g.screens.showForge(20);
    }, { kind, level });
    await page.waitForTimeout(100);
    await page.locator('#weapon-preview').screenshot({ path: path.join(output, `${kind}-${level}.png`) });
  }
  // Repeated opening/closing must not keep an active preview animation or grow GPU geometry.
  report.previewMemory = [];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__game.screens.showForge(20));
    await page.waitForTimeout(100);
    report.previewMemory.push(await page.evaluate(() => window.__game.screens.preview.renderer.info.memory.geometries));
  }
  assert(Math.max(...report.previewMemory) - Math.min(...report.previewMemory) <= 1);
  await page.locator('[data-act="close"]').click();
  assert(await page.evaluate(() => window.__game.screens.preview.scene === null));
  // Exercise every fused weapon's real attack and special code paths.
  report.attacks = await page.evaluate(async () => {
    const { FUSION_KINDS } = await import('/src/config/weapons.js');
    const { startSpecial, updateSpecial } = await import('/src/combat/Specials.js');
    const g = window.__game, out = [];
    g.player.iframes = 0; g.player.body.grounded = true;
    for (const kind of FUSION_KINDS) {
      const w = { uid: 20, kind, rarity: 5, level: 11 };
      g.save.weapons = [w]; g.save.equipped = [20, null, null]; g.refreshSlots();
      g.startAttack(w);
      if (g.pending) { g.applyMelee(g.pending); g.pending = null; }
      g.player.syncVisual(0.03, [], g.time);
      startSpecial(g, w);
      if (g.special) { updateSpecial(g, 0.1); g.special = null; }
      out.push({ kind, particles: g.fx.parts.length, effects: g.fx.timed.length });
      g.fx.update(2);
    }
    return out;
  });
  for (const a of report.attacks) assert(a.particles > 0 && a.effects > 0);
  // Actual attack pose and effects, with a closer camera for review.
  await page.evaluate(() => {
    const g = window.__game;
    const w = { uid: 20, kind: 'thunderHammer', rarity: 5, level: 11 };
    g.save.weapons = [w]; g.save.equipped = [20, null, null]; g.refreshSlots();
    g.player.iframes = 0; g.player.facing = 0.65;
    g.startAttack(w); g.player.syncVisual(0.15, g.near(g.player.body.y), g.time);
    g.applyMelee(g.pending); g.pending = null; g.fx.update(0.015);
    const b = g.player.body;
    g.camera.position.set(b.x + 4.5, b.y + 3.6, b.z + 5);
    g.camera.lookAt(b.x, b.y + 1, b.z);
    g.renderScene(g.scene, g.camera);
  });
  await page.screenshot({ path: path.join(output, 'attack-hammer.png') });
  // Verify reload restores the new variant and +11 in the same semantic rarity.
  await page.evaluate(() => window.__game.markDirty(true));
  await page.reload(); await page.waitForFunction(() => window.__game?.lobby);
  assert(await page.evaluate(() => window.__game.save.weapons[0].kind === 'thunderHammer' && window.__game.save.weapons[0].level === 11));
  // Portrait touch UI: 3 material selection, preview and creation controls fit the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const g = window.__game;
    g.save.weapons = [1, 2, 3].map(uid => ({ uid, kind: 'rifle', rarity: 3, level: 6 }));
    g.save.equipped = [1, 2, 3]; g.save.nextUid = 4;
    g.startRun(true); g.frame = () => {}; g.state = 'modal'; g.screens.showForge(1);
  });
  await page.locator('[data-act="fusion"]').click();
  for (const uid of [1, 2, 3]) await page.locator(`[data-act="fusion-select"][data-uid="${uid}"]`).click();
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.panel, .card, .detail, .weapon-preview, [data-act="fusion-create"]')].filter(el => {
    const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2;
  }).map(el => el.className));
  assert.deepEqual(overflow, []);
  await page.locator('[data-act="fusion-create"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'mobile-fusion.png') });
  await page.locator('[data-act="fusion-create"]').click();
  assert(await page.evaluate(() => window.__game.save.weapons.length === 1 && window.__game.player.weaponKind === 'tempestRifle'));
  assert.deepEqual(errors, []);
  // Export a contact sheet from the actual rendered preview captures.
  const sample = PNG.sync.read(await fs.readFile(path.join(output, 'bat-1.png')));
  const cellW = sample.width, cellH = sample.height;
  const sheet = new PNG({ width: cellW * 3, height: cellH * kinds.length });
  for (let y = 0; y < kinds.length; y++) for (let x = 0; x < 3; x++) {
    const png = PNG.sync.read(await fs.readFile(path.join(output, `${kinds[y]}-${[1, 6, 11][x]}.png`)));
    PNG.bitblt(png, sheet, 0, 0, cellW, cellH, x * cellW, y * cellH);
  }
  await fs.writeFile(path.join(output, 'weapon-tiers.png'), PNG.sync.write(sheet));
  const labels = ['방망이', '뇌명 전투망치', '월식 쌍날낫', '지옥불 사슬', '성광 펄스건', '폭풍 레일소총', '용염 삼연포'];
  await fs.writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>무기 합성 · 강화 외형</title><style>body{margin:0;background:#0c1729;color:#e4f3ff;font:16px system-ui;padding:24px}main{max-width:1050px;margin:auto}a{color:#75dfff}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}img{width:100%;border-radius:14px}h2{font-size:19px;margin:30px 0 8px}.head{text-align:center;position:sticky;top:0;background:#0c1729;padding:10px}p{line-height:1.7}</style><main><h1>3개 합성 · 강화 외형</h1><p>실제 게임의 3D 모델입니다. 첫 재료가 종류를 정하고, 최고 등급 +1과 최고 강화를 계승합니다.<br><a href="/">게임으로 돌아가기</a></p><div class="row head"><b>+1~5 · 강철</b><b>+6~10 · 룬 에너지</b><b>+11 이상 · 황금 각성</b></div>${kinds.map((k, i) => `<h2>${labels[i]}${i ? ' · 합성 전용' : ''}</h2><div class="row">${[1, 6, 11].map(l => `<img src="${k}-${l}.png" alt="${labels[i]} +${l}">`).join('')}</div>`).join('')}<h2>합성 화면</h2><img src="fusion-preview.png"><h2>공격 모션 · 효과</h2><img src="attack-hammer.png"></main>`);
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ ...report, errors }, null, 2));
  console.log(JSON.stringify({ ...report, errors, output }, null, 2));
} finally { await browser.close(); }
