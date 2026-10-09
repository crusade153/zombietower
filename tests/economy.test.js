import { describe, it, expect } from 'vitest';
import {
  weaponDamage, upgradeCost, canUpgrade, chestOdds, rollRarity, rollWeapon, sellValue, sellPrice,
} from '../src/combat/Weapons.js';
import { WEAPONS, WEAPON_KINDS, RARITY } from '../src/config/weapons.js';
import { ECON, TOWER, LAVA } from '../src/config/balance.js';
import { generateTower } from '../src/world/TowerGenerator.js';
import { ZOMBIES, hpScale, coinScale } from '../src/config/zombies.js';
import { Lava } from '../src/world/Lava.js';
import { makeRng } from '../src/core/rng.js';

const W = (kind, rarity = 0, level = 0) => ({ kind, rarity, level });

describe('무기·강화', () => {
  it('무기별 기본 1타 공격력이 서로 다르다', () => {
    const dmgs = WEAPON_KINDS.map((k) => weaponDamage(W(k)));
    expect(new Set(dmgs).size).toBe(dmgs.length);
    expect(weaponDamage(W('axe'))).toBeGreaterThan(weaponDamage(W('bat')));
    expect(weaponDamage(W('bat'))).toBeGreaterThan(weaponDamage(W('whip')));
  });

  it('등급과 강화 레벨이 오를수록 공격력이 오른다', () => {
    for (const k of WEAPON_KINDS) {
      let prev = 0;
      for (let r = 0; r < RARITY.length; r++) {
        const d = weaponDamage(W(k, r));
        expect(d).toBeGreaterThan(prev);
        prev = d;
      }
      expect(weaponDamage(W(k, 1, 10))).toBeCloseTo(WEAPONS[k].dmg * (1 + ECON.upgradeDmgPerLevel * 10), 6);
    }
  });

  it('강화 비용은 레벨마다 증가하고, 제한 없이 계속 강화할 수 있다(+10 이후는 완만하게)', () => {
    let prev = 0;
    for (let l = 0; l <= 30; l++) {
      const c = upgradeCost(W('bat', 0, l));
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
    expect(canUpgrade(W('bat', 0, ECON.softCapLevel))).toBe(true);
    expect(canUpgrade(W('bat', 0, 50))).toBe(true);
    expect(canUpgrade(W('bat', 0, ECON.levelLimit))).toBe(false);
    // +10 이후 한 단계 비용은 +10 비용의 2.5배를 넘지 않는다(+20 기준)
    expect(upgradeCost(W('bat', 0, 20)) / upgradeCost(W('bat', 0, 10))).toBeLessThan(2.52); // 반올림 오차 허용
    expect(upgradeCost(W('bat', 3, 0))).toBeGreaterThan(upgradeCost(W('bat', 0, 0)));
  });
});

describe('보물상자 확률', () => {
  it('각 층의 확률 합이 100이고 요청한 고정 발견 확률을 유지한다', () => {
    let prevHigh = -1;
    for (let s = 1; s <= TOWER.stages; s++) {
      const o = chestOdds(s);
      expect(o.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
      expect(o).toHaveLength(8);
      expect(o).toEqual(chestOdds(1));
      const high = o.slice(3).reduce((a, b) => a + b, 0);
      expect(high).toBeGreaterThanOrEqual(prevHigh);
      prevHigh = high;
    }
  });

  it('시뮬레이션 분포가 확률표와 일치 (1층/10층)', () => {
    for (const stage of [1, 10]) {
      const rng = makeRng(stage * 99);
      const n = 40000;
      const cnt = Array(RARITY.length).fill(0);
      for (let i = 0; i < n; i++) cnt[rollRarity(stage, rng)]++;
      const o = chestOdds(stage);
      for (let r = 0; r < RARITY.length; r++) expect(Math.abs(cnt[r] / n - o[r] / 100)).toBeLessThan(0.012);
    }
    expect(chestOdds(1)[7]).toBe(0.2);
    expect(chestOdds(10)[7]).toBe(0.2);
  });

  it('보스층 상자는 신화 이상 확정', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 3000; i++) expect(rollWeapon(5, rng, true).rarity).toBeGreaterThanOrEqual(6);
  });

  it('중복 판매가가 등급이 높을수록 크다', () => {
    expect(sellValue(W('bat', 3))).toBeGreaterThan(sellValue(W('bat', 0)));
  });
});

describe('경제 밸런스 (참고 수치)', () => {
  it('코인은 귀하다: 1층 수입으로는 몇 단계만, 한 바퀴 전체로 2~4개 무기를 최대 강화', () => {
    const t = generateTower(2024);
    const income = t.stages.map((st) => {
      let c = ECON.floorReward(st.index);
      for (const z of st.zombies) c += ZOMBIES[z.type].coin * coinScale(st.index);
      for (const a of st.aircoins) c += a.value;
      return c;
    });
    const total = income.reduce((a, b) => a + b, 0);
    const maxCost = (rarity) => Array.from({ length: ECON.softCapLevel }, (_, l) => upgradeCost(W('bat', rarity, l))).reduce((a, b) => a + b, 0);
    // 1층: 첫 강화는 가능하지만 +5에는 못 미친다
    expect(income[0]).toBeGreaterThan(upgradeCost(W('bat', 0, 0)));
    const toFive = Array.from({ length: 5 }, (_, l) => upgradeCost(W('bat', 0, l))).reduce((a, b) => a + b, 0);
    expect(income[0]).toBeLessThan(toFive);
    // 1~4층 합으로도 일반 무기 +10은 불가
    expect(income.slice(0, 4).reduce((a, b) => a + b, 0)).toBeLessThan(maxCost(0));
    // 타워 한 바퀴(콤보·클라이머 제외)로 무적 무기 2~4개 분량
    expect(total / maxCost(6)).toBeGreaterThan(2);
    expect(total / maxCost(6)).toBeLessThan(4);
  });

  it('층이 오를수록 좀비 수가 늘어난다', () => {
    const t = generateTower(2024);
    const counts = t.stages.map((st) => st.zombies.filter((z) => !['boss', 'finalBoss'].includes(z.type)).length);
    expect(counts[0]).toBeGreaterThanOrEqual(8);
    expect(counts[9]).toBeGreaterThan(counts[0] * 2);
  });

  it('값싼 강화를 반복해서 판매해도 강화 비용 이상으로 돌려받지 않는다', () => {
    for (let rarity = 0; rarity < RARITY.length; rarity++) {
      let spent = 0;
      for (let level = 1; level <= ECON.softCapLevel + 5; level++) {
        spent += upgradeCost(W('bat', rarity, level - 1));
        expect(sellPrice(W('bat', rarity, level)) - sellValue(W('bat', rarity))).toBeLessThanOrEqual(spent * 0.5);
      }
    }
  });

  it('좀비 체력 곡선: 10층이 1층의 2배대', () => {
    expect(hpScale(10) / hpScale(1)).toBeGreaterThan(2);
    expect(hpScale(10) / hpScale(1)).toBeLessThan(4);
  });
});

describe('용암 상태 전이', () => {
  const mk = () => new Lava({ add() {} });

  it('idle에서는 상승하지 않고, begin 후 delay 뒤 상승', () => {
    const l = mk();
    l.setIdle(-10); l.y = -10;
    for (let i = 0; i < 600; i++) l.update(0.01, 0);
    expect(l.y).toBeCloseTo(-10, 5);
    l.begin(1, 2);
    for (let i = 0; i < 100; i++) l.update(0.01, 0); // 1초: 아직 delay
    expect(l.y).toBeCloseTo(-10, 5);
    for (let i = 0; i < 400; i++) l.update(0.01, 0); // 4초 더: delay 1초 남고 3초 상승
    expect(l.y).toBeGreaterThan(-8);
  });

  it('플레이어가 28m 이상 앞서면 1.6배 속도', () => {
    const a = mk(); const b = mk();
    a.reset(0, 0); b.reset(0, 0);
    a.begin(1, 0); b.begin(1, 0);
    for (let i = 0; i < 100; i++) { a.update(0.01, 5); b.update(0.01, LAVA.catchUpGap + 5); }
    expect(b.y / a.y).toBeCloseTo(LAVA.catchUpMult, 1);
  });

  it('물대포: 굳으면 정지·바닥 고체, 시간이 지나면 다시 상승', () => {
    const l = mk();
    l.reset(0, 0); l.begin(1, 0);
    for (let i = 0; i < 100; i++) l.update(0.01, 20);
    const y = l.y;
    expect(l.freeze(LAVA.waterFreeze)).toBe(true);
    for (let i = 0; i < 300; i++) l.update(0.01, 20); // 3초
    expect(l.frozen).toBe(true);
    expect(l.floor.solid).toBe(true);
    expect(l.y).toBeCloseTo(y, 5);
    for (let i = 0; i < 400; i++) l.update(0.01, 20); // 총 7초 > 6초
    expect(l.frozen).toBe(false);
    expect(l.floor.solid).toBe(false);
    expect(l.y).toBeGreaterThan(y);
  });

  it('안전구역(idle)에서는 물대포가 작동하지 않는다', () => {
    const l = mk();
    l.setIdle(-5);
    expect(l.freeze()).toBe(false);
  });
});
