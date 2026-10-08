import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game.js';
import { ITEMS, ABILITIES } from '../src/config/balance.js';
import { normalizeSave } from '../src/core/Save.js';
import { upgradeCost } from '../src/combat/Weapons.js';

function fakeGame(coins = 1000) {
  const g = {
    state: 'play', invisibleT: 0, magnetT: 0,
    save: { coins, items: { spring: 0, cloak: 0, potion: 0, magnet: 0 } },
    player: {
      alive: true, hp: 30, maxHp: 100, coyote: 0, airJumped: true, ghost: false,
      body: { x: 0, y: 0, z: 0, vy: 0, grounded: true },
      heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); },
      setGhost(on) { this.ghost = on; },
    },
    hud: { setCoins() {}, toast() {}, floater() {} },
    fx: { ring() {}, burst() {} },
    audio: { play() {} },
    markDirty() {},
  };
  for (const k of ['buyItem', 'useItem', 'updateItemEffects', 'endItemEffects']) g[k] = Game.prototype[k];
  Object.defineProperty(g, 'invisible', { get() { return this.invisibleT > 0; } });
  return g;
}

describe('안전구역 상점', () => {
  it('아이템은 싸고, 최대 개수까지만 살 수 있다', () => {
    for (const it of Object.values(ITEMS)) expect(it.cost).toBeLessThanOrEqual(50);
    expect(ABILITIES.doubleJump.cost).toBeLessThanOrEqual(150);
    const g = fakeGame(1000);
    for (let i = 0; i < 8; i++) g.buyItem('potion');
    expect(g.save.items.potion).toBe(ITEMS.potion.max);
    expect(g.save.coins).toBe(1000 - ITEMS.potion.cost * ITEMS.potion.max);
    const poor = fakeGame(ITEMS.cloak.cost - 1);
    expect(poor.buyItem('cloak')).toBe(false);
  });

  it('스프링은 높이 띄우고 2단 점프를 다시 쓸 수 있게 한다', () => {
    const g = fakeGame();
    g.save.items.spring = 1;
    expect(g.useItem('spring')).toBe(true);
    expect(g.player.body.vy).toBe(ITEMS.spring.power);
    expect(g.player.body.grounded).toBe(false);
    expect(g.player.airJumped).toBe(false);
    expect(g.save.items.spring).toBe(0);
    expect(g.useItem('spring')).toBe(false); // 없으면 사용 불가
  });

  it('투명 망토: 일정 시간 투명(윤곽) 후 원래대로, 죽으면 바로 해제', () => {
    const g = fakeGame();
    g.save.items.cloak = 2;
    g.useItem('cloak');
    expect(g.invisible).toBe(true);
    expect(g.player.ghost).toBe(true);
    expect(g.useItem('cloak')).toBe(false); // 이미 투명이면 낭비하지 않는다
    g.updateItemEffects(ITEMS.cloak.time - 0.1);
    expect(g.invisible).toBe(true);
    g.updateItemEffects(0.2);
    expect(g.invisible).toBe(false);
    expect(g.player.ghost).toBe(false);
    g.useItem('cloak');
    g.endItemEffects();
    expect(g.invisible).toBe(false);
  });

  it('회복 물약은 체력이 가득하면 아끼고, 아니면 50% 회복', () => {
    const g = fakeGame();
    g.save.items.potion = 1;
    g.useItem('potion');
    expect(g.player.hp).toBe(80);
    g.save.items.potion = 1;
    g.player.hp = 100;
    expect(g.useItem('potion')).toBe(false);
    expect(g.save.items.potion).toBe(1);
  });

  it('저장 파일의 아이템 수를 복원하고 범위를 지킨다 · 강화 레벨 +10 초과 유지', () => {
    const w = [{ uid: 1, kind: 'bat', rarity: 0, level: 27 }];
    const s = normalizeSave({ v: 1, econVersion: 2, weapons: w, items: { spring: 3, cloak: 99, potion: -2, bogus: 4 } });
    expect(s.items).toEqual({ spring: 3, cloak: ITEMS.cloak.max, potion: 0, magnet: 0 });
    expect(s.weapons[0].level).toBe(27);
    expect(upgradeCost(s.weapons[0])).toBeGreaterThan(upgradeCost({ ...s.weapons[0], level: 26 }));
  });
});
