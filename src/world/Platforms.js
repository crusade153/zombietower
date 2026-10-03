import { setBounds } from '../core/physics.js';

const FALL_DELAY = 0.6;
const FALL_RESPAWN = 4.5;

/** 타워의 움직이는/무너지는 발판 목록 준비 */
export function preparePlatforms(tower) {
  const movers = [];
  const fallers = [];
  const blinkers = [];
  for (const p of tower.platforms) {
    if (p.motion) movers.push(p);
    if (p.type === 'falling') {
      p.fall = { state: 'idle', t: 0, vy: 0 };
      fallers.push(p);
    }
    if (p.blink) blinkers.push(p);
  }
  tower.movers = movers;
  tower.fallers = fallers;
  tower.blinkers = blinkers;
}

/** 깜빡이는 발판 상태: 'on'(고체) → 'warn'(곧 사라짐, 아직 고체) → 'off'(사라짐) */
export function blinkState(p, time) {
  const b = p.blink;
  const t = (time + b.offset) % b.T;
  if (t < b.on) return 'on';
  if (t < b.on + b.warn) return 'warn';
  return 'off';
}

/** 매 고정 스텝: 이동 발판 위치 갱신 + 무너지는 발판 상태 갱신 */
export function updatePlatforms(tower, dt, time) {
  for (const p of tower.blinkers) p.solid = blinkState(p, time) !== 'off';
  for (const p of tower.movers) {
    const m = p.motion;
    const off = Math.sin((time * Math.PI * 2) / m.period + m.phase) * m.amp;
    const nx = p.bx + (m.axis === 'x' ? off : 0);
    const ny = p.by + (m.axis === 'y' ? off : 0);
    const nz = p.bz + (m.axis === 'z' ? off : 0);
    p.dx = nx - p.x; p.dy = ny - p.y; p.dz = nz - p.z;
    p.x = nx; p.y = ny; p.z = nz;
    p.moved = true;
    setBounds(p);
  }
  for (const p of tower.fallers) {
    const f = p.fall;
    if (f.state === 'shake') {
      f.t -= dt;
      if (f.t <= 0) { f.state = 'fall'; f.t = FALL_RESPAWN; p.solid = false; }
    } else if (f.state === 'fall') {
      f.vy -= 30 * dt;
      p.y += f.vy * dt;
      f.t -= dt;
      setBounds(p);
      if (f.t <= 0) {
        f.state = 'idle'; f.vy = 0; p.y = p.by; p.solid = true; setBounds(p);
      }
    }
  }
}

/** 몸체가 이 발판을 밟았을 때 호출 */
export function stepOn(p) {
  if (p && p.type === 'falling' && p.fall.state === 'idle') {
    p.fall.state = 'shake';
    p.fall.t = FALL_DELAY;
  }
}

/** y 높이 기준 가까운 발판 목록 (충돌 후보). 8m 단위 구간 캐시 */
export function buildNearCache(tower, lavaFloor) {
  const BIN = 8;
  const bins = new Map();
  for (const p of tower.platforms) {
    const b = Math.floor(p.by / BIN);
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(p);
  }
  const cache = new Map();
  const get = (y) => {
    const c = Math.floor(y / BIN);
    let arr = cache.get(c);
    if (!arr) {
      arr = [];
      for (let b = c - 2; b <= c + 1; b++) {
        const l = bins.get(b);
        if (l) arr.push(...l);
      }
      arr.push(lavaFloor);
      cache.set(c, arr);
    }
    return arr;
  };
  return get;
}
