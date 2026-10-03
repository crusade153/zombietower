import { PHYS } from '../config/balance.js';

const EPS = 0.001;

/** 높이차 dy(착지-이륙)에서 점프로 갈 수 있는 최대 수평 거리 */
export function maxReach(dy) {
  const v = PHYS.jumpSpeed;
  const g = PHYS.gravity;
  const disc = v * v - 2 * g * dy;
  if (disc < 0) return 0;
  const t = (v + Math.sqrt(disc)) / g;
  return PHYS.moveSpeed * t;
}
export const maxJumpHeight = () => (PHYS.jumpSpeed * PHYS.jumpSpeed) / (2 * PHYS.gravity);

/** 발판 경계 갱신 */
export function setBounds(p) {
  p.minX = p.x - p.hx; p.maxX = p.x + p.hx;
  p.minY = p.y - p.hy; p.maxY = p.y + p.hy;
  p.minZ = p.z - p.hz; p.maxZ = p.z + p.hz;
}

/** 두 박스의 XZ 평면 최단 거리 (겹치면 0) */
export function aabbDistXZ(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(dx, dz);
}

/** 이동 발판의 양 끝 위치 박스(검증용). 정적 발판은 자기 자신 하나 */
export function extremes(p) {
  if (!p.motion) return [p];
  const out = [];
  for (const s of [-1, 1]) {
    const q = { x: p.bx, y: p.by, z: p.bz, hx: p.hx, hy: p.hy, hz: p.hz };
    q[p.motion.axis] += s * p.motion.amp;
    setBounds(q);
    out.push(q);
  }
  return out;
}

/** 몸체(AABB) 겹침 */
function overlapXZ(b, p) {
  return b.x + b.hw > p.minX && b.x - b.hw < p.maxX && b.z + b.hw > p.minZ && b.z - b.hw < p.maxZ;
}
function overlapY(b, p) {
  return b.y < p.maxY - 0.01 && b.y + b.h > p.minY + 0.01;
}

/**
 * 몸체 이동 + 충돌. body: {x,y,z (발 중심), vx,vy,vz, hw, h, grounded, ground}
 * 축 분리(Y→X→Z) 해결. 움직이는 발판 위에 있으면 발판 변위만큼 같이 이동.
 */
export function moveAndCollide(b, dt, plats) {
  const prevGround = b.ground;
  if (prevGround && prevGround.moved) {
    b.x += prevGround.dx; b.y += prevGround.dy; b.z += prevGround.dz;
  }
  b.grounded = false;
  b.ground = null;
  b.hitWall = false;

  // --- Y ---
  b.y += b.vy * dt;
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i];
    if (!p.solid || !overlapXZ(b, p) || !(b.y < p.maxY && b.y + b.h > p.minY)) continue;
    const penUp = p.maxY - b.y;
    const penDown = b.y + b.h - p.minY;
    if (b.vy <= 0 ? penUp <= penDown + 0.05 : penUp < penDown - 0.3) {
      b.y = p.maxY;
      if (b.vy < 0) b.vy = 0;
      b.grounded = true;
      b.ground = p;
    } else {
      b.y = p.minY - b.h;
      if (b.vy > 0) b.vy = 0;
    }
  }

  // --- X ---
  b.x += b.vx * dt;
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i];
    if (!p.solid || !overlapXZ(b, p) || !overlapY(b, p)) continue;
    if (b.grounded && p.maxY - b.y <= PHYS.stepUp) {
      b.y = p.maxY;
      b.ground = p;
      continue;
    }
    const dir = b.vx !== 0 ? Math.sign(b.vx) : Math.sign(b.x - p.x) || 1;
    b.x = dir > 0 ? p.minX - b.hw - EPS : p.maxX + b.hw + EPS;
    b.vx = 0;
    b.hitWall = true;
  }

  // --- Z ---
  b.z += b.vz * dt;
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i];
    if (!p.solid || !overlapXZ(b, p) || !overlapY(b, p)) continue;
    if (b.grounded && p.maxY - b.y <= PHYS.stepUp) {
      b.y = p.maxY;
      b.ground = p;
      continue;
    }
    const dir = b.vz !== 0 ? Math.sign(b.vz) : Math.sign(b.z - p.z) || 1;
    b.z = dir > 0 ? p.minZ - b.hw - EPS : p.maxZ + b.hw + EPS;
    b.vz = 0;
    b.hitWall = true;
  }
}

/** 이 발판 위(발 아래 maxDrop 이내)에 서 있을 수 있는 땅이 있는가 (좀비 낭떠러지 감지) */
export function groundBelow(x, y, z, plats, maxDrop = 1.2, half = 0.15) {
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i];
    if (!p.solid) continue;
    if (x + half > p.minX && x - half < p.maxX && z + half > p.minZ && z - half < p.maxZ) {
      if (p.maxY <= y + PHYS.stepUp + 0.05 && p.maxY >= y - maxDrop) return p;
    }
  }
  return null;
}

/** 레이-AABB 교차(slab). 맞으면 거리 t, 아니면 null */
export function rayBox(ox, oy, oz, dx, dy, dz, box, maxT) {
  let tmin = 0;
  let tmax = maxT;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const lo = [box.minX, box.minY, box.minZ];
  const hi = [box.maxX, box.maxY, box.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
    } else {
      let t1 = (lo[i] - o[i]) / d[i];
      let t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
