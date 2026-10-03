import { TOWER } from '../config/balance.js';
import { makeRng } from '../core/rng.js';
import { maxReach, maxJumpHeight, setBounds, aabbDistXZ, extremes } from '../core/physics.js';
import { zombieWeights } from '../config/zombies.js';
import { themeForStage } from '../config/themes.js';

const MIN_GAP = 0.45; // 발판 사이 최소 간격(너무 붙으면 점프가 아니라 걷기)
const CLEAR = 2.4; // 위아래로 겹칠 때 최소 수직 여유(플레이어가 지나갈 높이)

export const RISE_LIMIT = () => maxJumpHeight() * 0.8; // 어떤 경우에도 넘지 않는 상승 한도

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

let nextId = 1;

/** top: 윗면 높이. 박스 중심은 top - hy */
function makePlatform({ type, x, top, z, hx, hz, hy, motion = null, checkpoint = false, stage = 0 }) {
  hy = hy ?? TOWER.platformThickness / 2;
  const p = {
    id: nextId++, type, stage, x, y: top - hy, z, hx, hy, hz,
    bx: x, by: top - hy, bz: z, motion, checkpoint,
    solid: true, moved: false, dx: 0, dy: 0, dz: 0,
  };
  setBounds(p);
  return p;
}

/** 두 발판 사이를 (움직임 포함 모든 위치 조합에서) 건널 수 있는가 */
export function pairReachable(a, b) {
  const ea = extremes(a);
  const eb = extremes(b);
  const rise = RISE_LIMIT();
  for (const x of ea) {
    for (const y of eb) {
      const dy = y.maxY - x.maxY;
      if (dy > rise) return false;
      const dist = aabbDistXZ(x, y);
      if (dist < MIN_GAP - 1e-6) return false;
      if (dist > TOWER.hardGapRatio * maxReach(dy)) return false;
    }
  }
  return true;
}

/** 새 발판이 기존 발판과 (수직 여유 없이) 겹치지 않는가 */
function noConflict(cand, existing) {
  const ec = extremes(cand);
  for (const e of existing) {
    if (Math.abs(e.maxY - cand.maxY) > 12) continue;
    for (const a of extremes(e)) {
      for (const b of ec) {
        if (aabbDistXZ(a, b) >= 0.3) continue;
        if (b.minY - a.maxY >= CLEAR || a.minY - b.maxY >= CLEAR) continue;
        return false;
      }
    }
  }
  return true;
}

/** prev 이후 각도로 행진하며 gap 만큼 떨어진 위치를 찾는다 */
function findPosition(prev, spec) {
  const thetaPrev = Math.atan2(prev.z, prev.x);
  const box = { hx: spec.hx, hy: TOWER.platformThickness / 2, hz: spec.hz };
  for (let th = thetaPrev; th < thetaPrev + 2.4; th += 0.006) {
    box.x = spec.R * Math.cos(th);
    box.z = spec.R * Math.sin(th);
    box.y = 0;
    setBounds(box);
    if (aabbDistXZ(prev, box) >= spec.gap) return { x: box.x, z: box.z };
  }
  return null;
}

function tangentAt(x, z) {
  const th = Math.atan2(z, x);
  return { x: -Math.sin(th), z: Math.cos(th) };
}


/**
 * prev → 새 발판의 (상승 dy, 간격 gap) 계획. 이동 발판의 진폭(양 끝 위치)을 최악 조건으로 반영한다.
 * 불가능하면 dy를 낮춰가며 재시도, 그래도 안 되면 null.
 */
function planStep(prev, motion, dy, ratio) {
  const pm = prev.motion;
  const aPH = pm && pm.axis !== 'y' ? pm.amp : 0;
  const aPY = pm && pm.axis === 'y' ? pm.amp : 0;
  const aCH = motion && motion.axis !== 'y' ? motion.amp : 0;
  const aCY = motion && motion.axis === 'y' ? motion.amp : 0;
  dy = Math.min(dy, RISE_LIMIT() - 0.05 - aPY - aCY);
  for (let k = 0; k < 14; k++) {
    const gapLo = MIN_GAP + 0.05 + aPH + aCH;
    const gapHi = 0.9 * maxReach(dy + aPY + aCY) - aPH - aCH;
    if (gapHi >= gapLo) return { dy, gap: clamp(ratio * maxReach(dy), gapLo, gapHi) };
    dy -= 0.15;
    if (dy < -1.2) return null;
  }
  return null;
}

function makeSafe(stage, top, theta, R = TOWER.radius) {
  const x = R * Math.cos(theta);
  const z = R * Math.sin(theta);
  const h = TOWER.safeHalf;
  const p = makePlatform({ type: 'safe', x, top, z, hx: h, hz: h, hy: 0.5, checkpoint: true, stage });
  const ux = Math.cos(theta);
  const uz = Math.sin(theta);
  const t = tangentAt(x, z);
  p.safe = {
    stage,
    chest: { x: x - ux * 4.2, y: top, z: z - uz * 4.2 },
    forge: { x: x + ux * 4.2, y: top, z: z + uz * 4.2 },
    water: { x: x + t.x * 4.5, y: top, z: z + t.z * 4.5 },
    spawn: { x, y: top, z },
  };
  return p;
}

function pickTypeWeights(s, d) {
  return {
    static: 60,
    beam: s >= 2 ? 6 + 6 * d : 0,
    slider: s >= 3 ? 8 + 8 * d : 0,
    elevator: s >= 4 ? 5 + 7 * d : 0,
    falling: s >= 3 ? 7 + 8 * d : 0,
    conveyor: s >= 2 ? 5 + 6 * d : 0,
    blink: s >= 6 ? 6 + 8 * d : 0,
  };
}

export function bossStage(s) { return s === 5 || s === 10; }

/**
 * 타워 전체 생성. 안전구역 0(시작)~10(꼭대기)과 스테이지 1~10.
 * 반환: { seed, safeZones[], stages[], platforms[], chain[] }
 */
function buildTower(seed) {
  nextId = 1;
  const rng = makeRng(seed);
  const tower = { seed, safeZones: [], stages: [], platforms: [] };

  let prev = makeSafe(0, 0, 0);
  tower.safeZones.push(prev);
  tower.platforms.push(prev);

  for (let s = 1; s <= TOWER.stages; s++) {
    const N = TOWER.platformsPerStage(s);
    const stage = {
      index: s, yBase: prev.maxY, platforms: [], zombies: [], pickups: [], hazards: [], aircoins: [], boss: bossStage(s),
      entry: prev, safe: null, yTop: 0,
    };
    let sinceCheckpoint = 0;

    for (let i = 0; i <= N; i++) {
      const isArena = stage.boss && i === N; // 보스 경기장은 안전구역 직전
      if (i === N && !isArena) continue; // 일반 층: 마지막은 안전구역으로 대체
      const d = clamp(((s - 1) + i / N) / TOWER.stages, 0, 1);
      const isFirst = i === 0;
      sinceCheckpoint++;
      const isCheckpoint = !isFirst && !isArena && sinceCheckpoint >= TOWER.checkpointEvery && i < N - 2;
      const isRest = !isCheckpoint && !isFirst && !isArena && i % 7 === 6 && i < N - 1;

      let type = 'static';
      if (!isFirst && !isCheckpoint && !isRest && !isArena) type = rng.weighted(pickTypeWeights(s, d));
      // 타이밍 발판(무너짐/깜빡임) 두 개가 연달아 나오면 불공정하므로 막는다
      if ((prev.type === 'falling' || prev.type === 'blink') && (type === 'falling' || type === 'blink')) type = 'static';

      let made = null;
      const why = [];
      for (let attempt = 0; attempt < 24 && !made; attempt++) {
        const fall = Math.min(1, attempt / 9); // 재시도할수록 쉬운 쪽으로
        let hx; let hz; let curType = type;
        if (attempt >= 7) curType = 'static'; // 재시도가 길어지면 정적 발판
        const base = TOWER.halfSize(d);
        if (isArena) { hx = hz = 7.5; curType = 'arena'; }
        else if (isCheckpoint) { hx = hz = 3.2; curType = 'checkpoint'; }
        else if (isRest) { hx = rng.range(3.0, 3.6); hz = rng.range(3.0, 3.6); curType = 'rest'; }
        else if (isFirst) { hx = hz = Math.max(base, 2.4); }
        else if (curType === 'beam') {
          const tg = tangentAt(prev.x, prev.z);
          const alongX = Math.abs(tg.x) > Math.abs(tg.z);
          hx = alongX ? 2.2 : 0.75;
          hz = alongX ? 0.75 : 2.2;
        } else {
          hx = Math.max(TOWER.minHalf, base * rng.range(0.8, 1.2));
          hz = Math.max(TOWER.minHalf, base * rng.range(0.8, 1.2));
          if (curType === 'conveyor') { hx = Math.max(hx, 1.8); hz = Math.max(hz, 1.8); }
        }

        const riseMax = Math.min(TOWER.riseMax(d), RISE_LIMIT());
        let dy;
        if (isFirst) dy = 0.6;
        else if (isArena || isCheckpoint || isRest) dy = rng.range(0.3, 0.9);
        else if (rng() < 0.12) dy = 0;
        else dy = clamp(TOWER.riseAvg * rng.range(0.4, 1.6), 0, riseMax);
        dy *= 1 - 0.4 * fall;

        let motion = null;
        if (curType === 'slider') {
          const tg = tangentAt(prev.x, prev.z);
          const axis = Math.abs(tg.x) > Math.abs(tg.z) ? 'x' : 'z';
          motion = { axis, amp: (1.4 + 0.7 * d) * (1 - 0.5 * fall), period: rng.range(4, 6), phase: rng() * 6.28 };
        } else if (curType === 'elevator') {
          motion = { axis: 'y', amp: (0.9 + 0.6 * d) * (1 - 0.5 * fall), period: rng.range(3.5, 5), phase: rng() * 6.28 };
          dy = Math.min(dy, 0.5);
        }

        const lo = TOWER.gapRatioLow(d);
        const hi = TOWER.gapRatioHigh(d);
        let ratio = rng.range(lo, hi);
        if (isFirst) ratio = Math.min(ratio, 0.45);
        if (curType === 'falling') ratio = Math.min(ratio, 0.8);
        if (prev.type === 'beam') ratio = Math.min(ratio, 0.58); // 좁은 빔에서 출발: 도움닫기 짧음
        if (curType === 'beam') ratio = Math.min(ratio, 0.66);
        ratio *= 1 - 0.35 * fall;
        const plan = planStep(prev, motion, dy, ratio);
        if (!plan) { why.push('계획불가'); continue; }
        dy = plan.dy;
        const gap = plan.gap;
        const top = prev.by + prev.hy + dy;

        const spread = 2.5 + attempt * 0.25;
        const R = TOWER.radius + clamp(2.2 * Math.sin((stage.platforms.length + s * 5) * 0.7) + rng.range(-0.8, 0.8) * (1 + attempt * 0.4), -spread, spread);
        const pos = findPosition(prev, { hx, hz, R: isArena ? TOWER.radius : R, gap });
        if (!pos) { why.push('위치없음'); continue; }
        const cand = makePlatform({
          type: curType, x: pos.x, top, z: pos.z, hx, hz, motion,
          checkpoint: isCheckpoint || isArena, stage: s,
        });
        if (curType === 'conveyor') {
          const tg = tangentAt(prev.x, prev.z);
          const axis = Math.abs(tg.x) > Math.abs(tg.z) ? 'x' : 'z';
          const sign = rng() < 0.5 ? -1 : 1;
          const sp = 1.8 + 0.08 * s;
          cand.belt = { x: axis === 'x' ? sign * sp : 0, z: axis === 'z' ? sign * sp : 0, speed: sp };
        } else if (curType === 'blink') {
          cand.blink = { T: 4.1, on: 2.8, warn: 0.5, offset: rng() * 4.1 };
        }
        if (!pairReachable(prev, cand)) { why.push('도달불가'); continue; }
        if (!noConflict(cand, tower.platforms)) { why.push('겹침'); continue; }
        made = cand;
      }
      if (!made) throw new Error(`타워 생성 실패: stage ${s} platform ${i} type ${type} (seed ${seed}) ${why.join(',')}`);

      if (isCheckpoint || isArena) sinceCheckpoint = 0;
      stage.platforms.push(made);
      tower.platforms.push(made);
      prev = made;
    }

    // 안전구역
    let safe = null;
    for (let attempt = 0; attempt < 30 && !safe; attempt++) {
      const plan = planStep(prev, null, rng.range(0.4, 1.0 + 0.04 * attempt), 0.5 * (1 - 0.3 * Math.min(1, attempt / 9)));
      if (!plan) continue;
      const gap = plan.gap;
      const top = prev.by + prev.hy + plan.dy;
      const th0 = Math.atan2(prev.z, prev.x);
      const R = TOWER.radius + (attempt % 3 === 0 ? 0 : (attempt % 3 === 1 ? 1 : -1)) * Math.min(3, attempt * 0.25);
      let found = null;
      for (let th = th0; th < th0 + 2.4; th += 0.006) {
        const cand = makeSafe(s, top, th, R);
        if (aabbDistXZ(prev, cand) >= gap) { found = cand; break; }
      }
      if (!found) continue;
      if (!pairReachable(prev, found)) continue;
      if (!noConflict(found, tower.platforms)) continue;
      safe = found;
    }
    if (!safe) throw new Error(`안전구역 생성 실패: stage ${s} (seed ${seed})`);
    stage.safe = safe;
    stage.yTop = safe.maxY;
    tower.safeZones.push(safe);
    tower.platforms.push(safe);

    populateStage(stage, rng);
    tower.stages.push(stage);
    prev = safe;
  }

  // 카메라용 진행 방향 힌트: 각 발판 → 다음 발판
  const chain = [];
  for (let s = 0; s <= TOWER.stages; s++) {
    chain.push(tower.safeZones[s]);
    if (s < TOWER.stages) chain.push(...tower.stages[s].platforms);
  }
  for (let i = 0; i < chain.length; i++) {
    const a = chain[i];
    const b = chain[Math.min(i + 1, chain.length - 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    a.next = { x: dx / len, z: dz / len };
    a.chainIndex = i;
  }
  tower.chain = chain;
  tower.hazards = tower.stages.flatMap((st) => st.hazards);
  return tower;
}

/**
 * 같은 시드는 항상 같은 타워를 반환한다. 드물게(≈0.1%) 생성이 막히면 시드를 결정적으로 바꿔 재시도하므로 게임이 멈추지 않는다.
 */
export function generateTower(seed = 1) {
  let lastErr = null;
  for (let k = 0; k < 40; k++) {
    try {
      const t = buildTower(seed + k * 7919);
      t.seed = seed;
      return t;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/** 좀비/아이템 배치 */
function populateStage(stage, rng) {
  const s = stage.index;
  const plats = stage.platforms;
  const eligible = plats.filter((p, i) => i >= 3 && !p.motion && p.type !== 'falling' && p.type !== 'beam' && p.type !== 'arena' && Math.min(p.hx, p.hz) >= 1.6);
  const want = Math.round(4 + 1.3 * s);
  const w = zombieWeights(s);
  const pool = eligible.slice();
  for (let n = 0; n < want && pool.length; n++) {
    const idx = rng.int(0, pool.length - 1);
    const p = pool.splice(idx, 1)[0];
    const type = rng.weighted(w);
    stage.zombies.push({
      type, platform: p,
      x: p.x + rng.range(-0.4, 0.4) * p.hx, y: p.maxY, z: p.z + rng.range(-0.4, 0.4) * p.hz,
    });
    // 넓은 발판(휴식/체크포인트)에는 한 마리 더
    if ((p.type === 'rest' || p.type === 'checkpoint') && n < want - 1) {
      stage.zombies.push({
        type: rng.weighted(w), platform: p,
        x: p.x + rng.range(-0.6, 0.6) * p.hx, y: p.maxY, z: p.z + rng.range(-0.6, 0.6) * p.hz,
      });
      n++;
    }
  }
  if (stage.boss) {
    const arena = plats[plats.length - 1];
    stage.zombies.push({ type: 'boss', platform: arena, x: arena.x, y: arena.maxY, z: arena.z, boss: true });
    for (let k = 0; k < 3; k++) {
      stage.zombies.push({
        type: rng.weighted(w), platform: arena,
        x: arena.x + rng.range(-5, 5), y: arena.maxY, z: arena.z + rng.range(-5, 5),
      });
    }
  }

  // 아이템: 회복 / 물대포 충전 — 체크포인트·휴식 발판 위
  const places = plats.filter((p, i) => i >= 4 && (p.type === 'rest' || p.type === 'checkpoint'));
  const waterIdx = places.length ? rng.int(0, places.length - 1) : -1;
  places.forEach((p, i) => {
    stage.pickups.push({ type: i === waterIdx ? 'water' : 'heal', x: p.x + 1.2, y: p.maxY, z: p.z + 1.2, platform: p });
  });
  if (!places.length && plats.length > 8) {
    const p = plats[Math.floor(plats.length / 2)];
    stage.pickups.push({ type: 'water', x: p.x, y: p.maxY, z: p.z, platform: p });
  }

  // 장애물: 넓은 '휴식' 발판을 도전 방으로 (회전 막대 / 불기둥)
  const th = themeForStage(s);
  for (const p of plats) {
    if (p.type !== 'rest') continue;
    const r = rng();
    if (s >= 3 && r < th.hazards.spinner) {
      stage.hazards.push({
        kind: 'spinner', stage: s, platform: p,
        len: 2 * Math.min(p.hx, p.hz) - 0.7, speed: 1.3 + 0.12 * s, dir: rng() < 0.5 ? -1 : 1, phase: rng() * 6.28,
      });
    } else if (s >= 2 && r < th.hazards.spinner + th.hazards.fire) {
      const slots = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]];
      const pick = [];
      const pool = slots.slice();
      const n = s >= 6 ? 4 : 3;
      for (let k = 0; k < n && pool.length; k++) pick.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
      stage.hazards.push({
        kind: 'fire', stage: s, platform: p,
        vents: pick.map(([fx, fz]) => ({ dx: fx * p.hx * 1.6, dz: fz * p.hz * 1.6, phase: rng() * 3.4 })),
      });
    }
  }

  // 공중 코인: 점프 구간에 아치 모양으로 3개 (정밀하게 점프할수록 모음)
  const arr = [stage.entry, ...plats];
  const value = Math.max(1, Math.round(s * 0.5));
  for (let i = 0; i + 1 < arr.length && stage.aircoins.length < 18; i++) {
    const a = arr[i]; const b = arr[i + 1];
    const bad = (q) => q.motion || q.type === 'falling' || q.type === 'blink';
    if (bad(a) || bad(b) || aabbDistXZ(a, b) < 2.2 || rng() > 0.22) continue;
    const ax = clamp(b.x, a.minX, a.maxX); const az = clamp(b.z, a.minZ, a.maxZ);
    const bx = clamp(a.x, b.minX, b.maxX); const bz = clamp(a.z, b.minZ, b.maxZ);
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      stage.aircoins.push({
        x: ax + (bx - ax) * t, z: az + (bz - az) * t,
        y: a.maxY + (b.maxY - a.maxY) * t + 0.9 + 1.5 * Math.sin(Math.PI * t), value, stage: s,
      });
    }
  }
}
