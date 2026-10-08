import { describe, it, expect } from 'vitest';
import { StageRun, starCount, formatTime, STAR_TIME, STAR_HITS, STAR_COINS } from '../src/core/StageRun.js';
import { STARS } from '../src/config/balance.js';
import { normalizeSave } from '../src/core/Save.js';
import { Zombie } from '../src/entities/Zombie.js';
import { ZOMBIES, zombieWeights } from '../src/config/zombies.js';
import { generateTower } from '../src/world/TowerGenerator.js';

describe('층별 별 3개', () => {
  it('시간·피격·공중 코인 조건을 각각 판정한다', () => {
    const r = new StageRun(3, 30, false, 10);
    expect(r.par).toBe(STARS.parTime(30, false));
    r.t = r.par - 1; r.hits = STARS.maxHits; r.air = 8;
    expect(r.mask).toBe(STAR_TIME | STAR_HITS | STAR_COINS);
    r.t = r.par + 1; r.hits = STARS.maxHits + 1; r.air = 7;
    expect(r.mask).toBe(0);
    expect(new StageRun(1, 20, false, 0).mask & STAR_COINS).toBeTruthy(); // 공중 코인 없는 층
  });
  it('별 보상은 새로 딴 별에만 지급된다', () => {
    const r = new StageRun(4, 30, false, 10);
    r.t = 1; r.hits = 99; r.air = 10; // 시간·코인 성공, 피격 실패
    const first = r.settle(0);
    expect(first.gained).toBe(STAR_TIME | STAR_COINS);
    expect(first.reward).toBe(2 * STARS.reward(4));
    const again = r.settle(first.total);
    expect(again.gained).toBe(0);
    expect(again.reward).toBe(0);
    r.hits = 0;
    expect(r.settle(first.total).reward).toBe(STARS.reward(4));
    expect(starCount(7)).toBe(3);
    expect(formatTime(83.9)).toBe('1:23');
  });
  it('저장 파일의 별·최고 기록을 정리해서 복원한다', () => {
    const w = [{ uid: 1, kind: 'bat', rarity: 0, level: 0 }];
    const s = normalizeSave({ v: 1, econVersion: 2, weapons: w, stars: [5, 7, 9, -1, 3], bestTimes: [1, 61.234, 'x', -3] });
    expect(s.stars).toHaveLength(11);
    expect(s.stars.slice(0, 5)).toEqual([0, 7, 7, 0, 3]);
    expect(s.bestTimes.slice(0, 4)).toEqual([0, 61.2, 0, 0]);
    expect(normalizeSave({ v: 1, weapons: w }).stars.every((m) => m === 0)).toBe(true);
  });
});

/** Zombie.takeDamage만 시험하기 위한 최소 대역 */
function fakeZombie(type, facing = 0) {
  return {
    def: ZOMBIES[type], hp: 1000, maxHp: 1000, facing, kn: { x: 0, z: 0 }, body: { vy: 0 },
    state: 'chase', slowT: 0, burnT: 0, flashT: 0, die() { this.dead = true; },
  };
}

describe('좀비 변종', () => {
  const hit = (z, o) => { const before = z.hp; Zombie.prototype.takeDamage.call(z, {}, 100, o); return before - z.hp; };

  it('방패 수비대: 정면은 85% 막고, 옆·뒤·위·폭발은 그대로', () => {
    // 좀비가 +Z를 바라봄. 정면 공격 = 공격자→좀비 방향이 -Z
    const front = { kx: 0, kz: -1 };
    expect(hit(fakeZombie('shield'), front)).toBeCloseTo(15);
    expect(front.blocked).toBe(true);
    expect(hit(fakeZombie('shield'), { kx: 0, kz: 1 })).toBe(100); // 뒤
    expect(hit(fakeZombie('shield'), { kx: 1, kz: 0 })).toBe(100); // 옆
    expect(hit(fakeZombie('shield'), { kx: 0, kz: -1, fromAbove: true })).toBe(100);
    expect(hit(fakeZombie('shield'), { kx: 0, kz: -1, blast: true })).toBe(100);
    expect(hit(fakeZombie('walker'), { kx: 0, kz: -1 })).toBe(100);
  });

  it('폭탄 망자는 처치되면 폭발하고, 스스로 사라질 때는 터지지 않는다', () => {
    const calls = [];
    const g = { audio: { play() {} }, onZombieKilled() {}, explode: (z, self) => calls.push(self) };
    const z = { def: ZOMBIES.bomber, bar: {}, exploded: false };
    Zombie.prototype.die.call(z, g, {});
    expect(calls).toEqual([false]);
    const z2 = { def: ZOMBIES.bomber, bar: {}, exploded: false };
    Zombie.prototype.die.call(z2, g, { silent: true });
    expect(calls).toHaveLength(1);
  });

  it('층이 오르면 변종이 섞이고, 황금 망자가 2층부터 가끔 나온다', () => {
    expect(zombieWeights(1).bomber).toBe(0);
    expect(zombieWeights(2).bomber).toBeGreaterThan(0);
    expect(zombieWeights(3).shield).toBeGreaterThan(0);
    let golden = 0;
    let stage1Golden = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const t = generateTower(seed);
      for (const st of t.stages) {
        const n = st.zombies.filter((z) => z.type === 'golden').length;
        expect(n).toBeLessThanOrEqual(1);
        golden += n;
        if (st.index === 1) stage1Golden += n;
      }
    }
    expect(stage1Golden).toBe(0);
    expect(golden).toBeGreaterThan(20 * 9 * 0.3);
    expect(golden).toBeLessThan(20 * 9 * 0.8);
  });
});
