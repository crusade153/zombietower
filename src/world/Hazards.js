import { dmgScale } from '../config/zombies.js';

// 도전 방(넓은 발판) 장애물: 회전 막대(spinner) / 불기둥(fire)

const FIRE_T = 3.4;
const FIRE_OFF = 1.5;
const FIRE_WARN = 0.9;

export function spinnerAngle(h, time) {
  return h.phase + h.dir * h.speed * time;
}

/** 'off' | 'warn' | 'on' */
export function fireState(v, time) {
  const t = (time + v.phase) % FIRE_T;
  if (t < FIRE_OFF) return 'off';
  if (t < FIRE_OFF + FIRE_WARN) return 'warn';
  return 'on';
}

/**
 * 플레이어 피격 판정. 낮은 막대는 점프로 넘고, 불기둥은 켜지기 전 붉은 경고가 먼저 뜬다.
 * 피해는 층 배율을 따른다. 쓸려가는 방향으로 넉백되므로 가장자리에서는 위험.
 */
export function updateHazards(tower, time, g) {
  const P = g.player;
  if (!P.alive || g.state !== 'play') return;
  const b = P.body;
  for (const h of tower.hazards) {
    if (Math.abs(h.stage - g.bandStage) > 1) continue;
    const p = h.platform;
    if (b.y > p.maxY + 3.6 || b.y + b.h < p.maxY - 0.3) continue;
    if (b.x < p.minX - 1 || b.x > p.maxX + 1 || b.z < p.minZ - 1 || b.z > p.maxZ + 1) continue;

    if (h.kind === 'spinner') {
      const ang = spinnerAngle(h, time);
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const rx = b.x - p.x;
      const rz = b.z - p.z;
      const t = Math.max(-h.len / 2, Math.min(h.len / 2, rx * dx + rz * dz));
      const d = Math.hypot(b.x - (p.x + dx * t), b.z - (p.z + dz * t));
      if (d < 0.25 + b.hw + 0.05 && b.y < p.maxY + 0.8 && b.y + b.h > p.maxY + 0.2) {
        const sgn = t >= 0 ? 1 : -1;
        const sx = -dz * h.dir * sgn;
        const sz = dx * h.dir * sgn;
        const dmg = 9 * dmgScale(h.stage);
        if (P.hurt(dmg, b.x - sx, b.z - sz, 7)) g.onPlayerHurt(dmg);
      } else if (d < 0.7 && !b.grounded && b.y >= p.maxY + 0.8 && b.y < p.maxY + 2.0 && !(time - (h.nearAt ?? -9) < 1)) {
        // 막대가 발밑으로 스쳐 지나감 → 아슬아슬
        h.nearAt = time;
        g.onNearMiss('spinner');
      }
    } else if (h.kind === 'fire') {
      for (const v of h.vents) {
        if (fireState(v, time) !== 'on') continue;
        const vx = p.x + v.dx;
        const vz = p.z + v.dz;
        if (Math.hypot(b.x - vx, b.z - vz) < 0.85 + b.hw && b.y < p.maxY + 3.2) {
          const dmg = 12 * dmgScale(h.stage);
          if (P.hurt(dmg, vx, vz, 6)) g.onPlayerHurt(dmg);
        }
      }
    }
  }
}
