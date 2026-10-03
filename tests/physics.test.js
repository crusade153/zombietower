import { describe, it, expect } from 'vitest';
import { moveAndCollide, maxReach, maxJumpHeight, setBounds, rayBox } from '../src/core/physics.js';
import { PHYS } from '../src/config/balance.js';

function plat(cx, top, cz, hx, hz, hy = 0.3) {
  const p = { x: cx, y: top - hy, z: cz, hx, hy, hz, solid: true, moved: false, dx: 0, dy: 0, dz: 0 };
  setBounds(p);
  return p;
}
function body(x, y, z) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, hw: PHYS.playerHalf, h: PHYS.playerHeight, grounded: false, ground: null };
}

/** +X 방향으로 달려가 가장자리에서 점프. 착지하면 true */
function runAndJump(plats, startX, edgeX, endTime = 2.5) {
  const b = body(startX, 0, 0);
  const dt = PHYS.fixedDt;
  let jumped = false;
  let t = 0;
  while (t < endTime) {
    b.vx = PHYS.moveSpeed; // 즉시 최고속(보수적이지 않으므로 아래에서 가속 구간을 충분히 줌)
    b.vz = 0;
    b.vy -= PHYS.gravity * dt;
    if (!jumped && b.grounded && b.x >= edgeX) { b.vy = PHYS.jumpSpeed; jumped = true; }
    moveAndCollide(b, dt, plats);
    t += dt;
    if (jumped && b.grounded && b.ground === plats[1]) return b;
    if (b.y < -20) return null;
  }
  return null;
}

describe('물리', () => {
  it('서 있는 몸체는 발판 위에 머문다', () => {
    const p = plat(0, 0, 0, 5, 5);
    const b = body(0, 0.5, 0);
    for (let i = 0; i < 600; i++) {
      b.vy -= PHYS.gravity * PHYS.fixedDt;
      moveAndCollide(b, PHYS.fixedDt, [p]);
    }
    expect(b.grounded).toBe(true);
    expect(b.y).toBeCloseTo(0, 3);
  });

  it('벽(발판 옆면)을 통과하지 못한다', () => {
    const wall = plat(5, 3, 0, 1, 5, 3); // 높이 6짜리 벽
    const floor = plat(0, 0, 0, 20, 5);
    const b = body(0, 0, 0);
    for (let i = 0; i < 400; i++) {
      b.vx = PHYS.moveSpeed;
      b.vy -= PHYS.gravity * PHYS.fixedDt;
      moveAndCollide(b, PHYS.fixedDt, [floor, wall]);
    }
    expect(b.x).toBeLessThan(wall.minX);
  });

  it('최대 점프 높이 ≈ v²/2g', () => {
    const p = plat(0, 0, 0, 5, 5);
    const b = body(0, 0, 0);
    let peak = 0;
    b.vy = PHYS.jumpSpeed;
    for (let i = 0; i < 300; i++) {
      b.vy -= PHYS.gravity * PHYS.fixedDt;
      moveAndCollide(b, PHYS.fixedDt, [p]);
      peak = Math.max(peak, b.y);
    }
    expect(peak).toBeGreaterThan(maxJumpHeight() - 0.15);
    expect(peak).toBeLessThan(maxJumpHeight() + 0.15);
  });

  for (const dy of [0, 0.8, 1.6]) {
    it(`간격 = hardGapRatio(0.92)×최대거리, 높이차 ${dy}m 를 실제로 건널 수 있다`, () => {
      const gap = 0.92 * maxReach(dy) - 0.45; // 몸체 반폭이 가장자리를 넘는 만큼 보수적으로 차감하지 않으면 실패할 수 있어 0.45 보정
      const a = plat(0, 0, 0, 6, 3);
      const edgeX = a.maxX;
      const b = plat(edgeX + gap + 2, dy, 0, 2, 3);
      const landed = runAndJump([a, b], -4, edgeX);
      expect(landed).not.toBeNull();
    });
  }

  it('높이차 0, 간격 = 최대거리 + 1.5m 는 건널 수 없다', () => {
    const a = plat(0, 0, 0, 6, 3);
    const b = plat(a.maxX + maxReach(0) + 1.5 + 2, 0, 0, 2, 3);
    expect(runAndJump([a, b], -4, a.maxX)).toBeNull();
  });

  it('rayBox: 정면 박스를 맞춘다', () => {
    const box = { minX: 5, maxX: 6, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
    expect(rayBox(0, 0, 0, 1, 0, 0, box, 100)).toBeCloseTo(5, 5);
    expect(rayBox(0, 0, 0, -1, 0, 0, box, 100)).toBeNull();
    expect(rayBox(0, 5, 0, 1, 0, 0, box, 100)).toBeNull();
  });
});
