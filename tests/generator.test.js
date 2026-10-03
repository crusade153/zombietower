import { describe, it, expect } from 'vitest';
import { generateTower, pairReachable, RISE_LIMIT } from '../src/world/TowerGenerator.js';
import { maxReach, aabbDistXZ, extremes } from '../src/core/physics.js';
import { TOWER } from '../src/config/balance.js';

describe('타워 생성기', () => {
  for (const seed of [1, 2, 3, 42, 1234, 99999, 20260101, 7]) {
    it(`seed ${seed}: 모든 인접 발판이 점프로 건널 수 있다`, () => {
      const t = generateTower(seed);
      expect(t.safeZones.length).toBe(TOWER.stages + 1);
      expect(t.stages.length).toBe(TOWER.stages);
      for (let i = 0; i + 1 < t.chain.length; i++) {
        expect(pairReachable(t.chain[i], t.chain[i + 1])).toBe(true);
      }
    });

    it(`seed ${seed}: 상승 높이/간격이 한도 안`, () => {
      const t = generateTower(seed);
      for (let i = 0; i + 1 < t.chain.length; i++) {
        const a = t.chain[i];
        const b = t.chain[i + 1];
        for (const ea of extremes(a)) {
          for (const eb of extremes(b)) {
            const dy = eb.maxY - ea.maxY;
            expect(dy).toBeLessThanOrEqual(RISE_LIMIT() + 1e-6);
            expect(aabbDistXZ(ea, eb)).toBeLessThanOrEqual(TOWER.hardGapRatio * maxReach(dy) + 1e-6);
          }
        }
      }
    });
  }

  it('난이도가 층에 따라 오른다 (간격 비율 평균 상승)', () => {
    const t = generateTower(5);
    const avg = (st) => {
      let sum = 0; let n = 0;
      const arr = [st.entry, ...st.platforms];
      for (let i = 0; i + 1 < arr.length; i++) {
        const dy = arr[i + 1].maxY - arr[i].maxY;
        sum += aabbDistXZ(arr[i], arr[i + 1]) / maxReach(dy);
        n++;
      }
      return sum / n;
    };
    expect(avg(t.stages[9])).toBeGreaterThan(avg(t.stages[0]));
  });

  it('같은 시드는 같은 타워', () => {
    const a = generateTower(77);
    const b = generateTower(77);
    expect(a.platforms.length).toBe(b.platforms.length);
    expect(a.platforms[40].x).toBeCloseTo(b.platforms[40].x, 6);
  });

  it('보스는 5, 10층에만 있다', () => {
    const t = generateTower(3);
    t.stages.forEach((st) => {
      const has = st.zombies.some((z) => z.type === 'boss');
      expect(has).toBe(st.index === 5 || st.index === 10);
    });
  });
});

describe('타워 생성기 - 다수 시드 안정성', () => {
  it('시드 1~80 모두 생성에 성공하고 점프 가능', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const t = generateTower(seed * 7919);
      for (let i = 0; i + 1 < t.chain.length; i++) {
        if (!pairReachable(t.chain[i], t.chain[i + 1])) throw new Error(`seed ${seed * 7919} chain ${i}`);
      }
    }
  });
});

import { blinkState } from '../src/world/Platforms.js';
import { spinnerAngle, fireState } from '../src/world/Hazards.js';

describe('탑 구성 요소(장애물·발판·코인)', () => {
  const t = generateTower(2025);

  it('장애물은 넓은 휴식 발판에만, 회전 막대는 발판 안에 들어간다', () => {
    for (const h of t.hazards) {
      expect(h.platform.type).toBe('rest');
      if (h.kind === 'spinner') {
        expect(h.len).toBeLessThanOrEqual(2 * Math.min(h.platform.hx, h.platform.hz));
        expect(h.stage).toBeGreaterThanOrEqual(3);
      }
      if (h.kind === 'fire') {
        expect(h.stage).toBeGreaterThanOrEqual(2);
        for (const v of h.vents) {
          expect(Math.abs(v.dx)).toBeLessThan(h.platform.hx);
          expect(Math.abs(v.dz)).toBeLessThan(h.platform.hz);
        }
      }
    }
    expect(t.hazards.length).toBeGreaterThan(5);
  });

  it('1층에는 장애물이 없다', () => {
    expect(t.stages[0].hazards.length).toBe(0);
  });

  it('컨베이어는 충분히 넓고, 타이밍 발판(무너짐/깜빡임)은 연달아 나오지 않는다', () => {
    for (const p of t.platforms) {
      if (p.belt) {
        expect(p.hx).toBeGreaterThanOrEqual(1.8);
        expect(p.hz).toBeGreaterThanOrEqual(1.8);
        expect(Math.hypot(p.belt.x, p.belt.z)).toBeLessThan(3);
      }
    }
    const timed = (p) => p.type === 'falling' || p.type === 'blink';
    for (let i = 0; i + 1 < t.chain.length; i++) {
      expect(timed(t.chain[i]) && timed(t.chain[i + 1])).toBe(false);
    }
  });

  it('공중 코인은 점프 구간 위에 있고 층당 18개 이하', () => {
    for (const st of t.stages) {
      expect(st.aircoins.length).toBeLessThanOrEqual(18);
      for (const c of st.aircoins) {
        expect(c.y).toBeGreaterThan(st.yBase - 1);
        expect(c.value).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('깜빡이 발판 상태 주기', () => {
    const p = { blink: { T: 4, on: 2, warn: 1, offset: 0 } };
    expect(blinkState(p, 0.5)).toBe('on');
    expect(blinkState(p, 2.5)).toBe('warn');
    expect(blinkState(p, 3.5)).toBe('off');
    expect(blinkState(p, 4.5)).toBe('on');
  });

  it('불기둥은 꺼짐 → 경고 → 켜짐 순서', () => {
    const v = { phase: 0 };
    expect(fireState(v, 0.5)).toBe('off');
    expect(fireState(v, 1.7)).toBe('warn');
    expect(fireState(v, 2.8)).toBe('on');
    expect(spinnerAngle({ phase: 1, dir: -1, speed: 2 }, 1)).toBeCloseTo(-1, 6);
  });
});
