import { describe, it, expect } from 'vitest';
import { Combo, LavaEscape, comboMult, rollCrit } from '../src/combat/Thrills.js';
import { vanishingIn } from '../src/world/Platforms.js';
import { THRILL } from '../src/config/balance.js';

describe('치명타', () => {
  it('확률 경계에서 치명타 여부가 갈린다', () => {
    expect(rollCrit(() => THRILL.critChance - 0.001)).toBe(true);
    expect(rollCrit(() => THRILL.critChance)).toBe(false);
  });
});

describe('킬 콤보', () => {
  it('처치가 쌓이면 배율 단계가 오르고, 단계가 오른 순간만 tierUp', () => {
    const c = new Combo();
    const ups = [];
    for (let i = 0; i < 20; i++) { const r = c.add(); if (r.tierUp) ups.push(r.count); c.update(0.5); }
    expect(ups).toEqual(THRILL.comboTiers.map((t) => t.at));
    expect(c.mult).toBe(3);
    expect(comboMult(1)).toBe(1);
  });
  it('제한 시간이 지나면 끊기고 최고 기록은 남는다', () => {
    const c = new Combo();
    c.add(); c.add(); c.add();
    c.update(THRILL.comboWindow - 0.01);
    expect(c.count).toBe(3);
    c.update(0.02);
    expect(c.count).toBe(0);
    expect(c.left).toBe(0);
    expect(c.best).toBe(3);
  });
});

describe('용암 탈출', () => {
  it('용암이 발밑까지 온 뒤 거리를 벌리면 한 번만 성공', () => {
    const e = new LavaEscape();
    expect(e.update(3, true, false)).toBe(false); // 아직 위기 아님
    expect(e.update(0.5, true, false)).toBe(false); // 위기
    expect(e.update(3, true, false)).toBe(false);
    expect(e.update(THRILL.lavaEscapeGap + 0.1, true, false)).toBe(true);
    expect(e.update(THRILL.lavaEscapeGap + 0.1, true, false)).toBe(false);
  });
  it('굳은 용암 위에서는 위기로 치지 않고, 안전구역 도착도 탈출로 인정', () => {
    const e = new LavaEscape();
    e.update(0.2, false, false);
    expect(e.armed).toBe(false);
    e.update(0.5, true, false);
    expect(e.update(2, false, true)).toBe(true);
  });
});

describe('사라지기 직전 발판', () => {
  it('무너지는 발판·깜빡이는 발판의 남은 시간을 계산한다', () => {
    expect(vanishingIn({ type: 'normal' }, 0)).toBe(Infinity);
    expect(vanishingIn({ type: 'falling', fall: { state: 'idle', t: 0 } }, 0)).toBe(Infinity);
    expect(vanishingIn({ type: 'falling', fall: { state: 'shake', t: 0.2 } }, 0)).toBeCloseTo(0.2);
    expect(vanishingIn({ type: 'falling', fall: { state: 'fall', t: 3 } }, 0)).toBe(0);
    const blink = { blink: { T: 4.1, on: 2.8, warn: 0.5, offset: 0 } };
    expect(vanishingIn(blink, 1)).toBeCloseTo(2.3);
    expect(vanishingIn(blink, 3.2)).toBeCloseTo(0.1);
    expect(vanishingIn(blink, 3.5)).toBe(0);
  });
});
