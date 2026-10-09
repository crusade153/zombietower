import { WEAPONS, baseWeaponKind } from '../config/weapons.js';
import { weaponDamage, hasPerk } from './Weapons.js';
import { rayBox } from '../core/physics.js';

// 무기별 차지 필살기. 즉발형은 startSpecial에서 끝나고,
// 지속형(회오리 베기·탄막 난사)은 g.special에 상태를 두고 updateSpecial이 이어서 처리한다.

/** 플레이어 주변(수평 range, 높이 창 안)의 살아 있는 좀비를 가까운 순으로 */
export function zombiesAround(g, range, below = 0.6, above = 2.4) {
  const b = g.player.body;
  const out = [];
  for (const z of g.zombies) {
    if (z.dead || z.removed) continue;
    const zb = z.body;
    if (zb.y > b.y + above || zb.y + z.def.height < b.y - below) continue;
    const dx = zb.x - b.x;
    const dz = zb.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= range + z.def.radius) out.push({ z, dx, dz, dist });
  }
  return out.sort((a, c) => a.dist - c.dist);
}

function base(g, w) {
  const s = WEAPONS[w.kind].special;
  const dmg = weaponDamage(w) * s.mult;
  return { s, dmg, burn: hasPerk(w, 'burn') ? dmg * 0.25 : 0 };
}

/** 원형 범위 타격 (홈런 스윙·회오리 베기 공용) */
function hitRadius(g, w, dmg, burn, radius, knock, launch = 0) {
  let n = 0;
  for (const h of zombiesAround(g, radius)) {
    const l = h.dist || 1;
    g.hitZombie(h.z, dmg, { kx: h.dx / l, kz: h.dz / l, knock, burn, weapon: w, unblockable: true });
    if (launch && !h.z.dead) h.z.body.vy = Math.max(h.z.body.vy, launch * (1 - h.z.def.knockResist));
    n++;
  }
  return n;
}

export function startSpecial(g, w) {
  const { s, dmg, burn } = base(g, w);
  const P = g.player;
  const b = P.body;
  g.audio.play('special');
  g.hud.floater({ x: b.x, y: b.y + 2.7, z: b.z }, `⚡ ${s.name}`, '#ffe27a', 1.5, 1100);
  g.cam.shake = Math.max(g.cam.shake, 0.45);
  g.fx.ring(b.x, b.y + 0.05, b.z, 2.2, 0xffd04a, 0.4, true);

  switch (baseWeaponKind(w)) {
    case 'bat': {
      P.startSwing(0.5, 'melee');
      g.audio.play('swing-bat');
      g.fx.slash(b.x, b.y, b.z, P.facing, s.radius, 359, 0xfff2b0);
      g.fx.ring(b.x, b.y + 0.1, b.z, s.radius, 0xffffff, 0.3, true);
      if (hitRadius(g, w, dmg, burn, s.radius, s.knock, 9)) g.addHitstop(0.12);
      break;
    }
    case 'axe':
      g.special = { kind: 'spin', w, dmg, burn, t: s.duration, tick: 0 };
      break;
    case 'whip': {
      P.startSwing(0.4, 'line');
      g.audio.play('whip');
      const fx = Math.sin(P.facing);
      const fz = Math.cos(P.facing);
      g.fx.line(b.x + fx * 0.5, b.y + 1.1, b.z + fz * 0.5, b.x + fx * s.range, b.y + 0.9, b.z + fz * s.range, 0xffe9a0, 0.16, 0.25);
      for (const h of zombiesAround(g, s.range + 1, 1.5, 3)) {
        const along = h.dx * fx + h.dz * fz;
        const lat = Math.abs(h.dx * fz - h.dz * fx);
        if (along < -0.3 || along > s.range + h.z.def.radius || lat > s.width / 2 + h.z.def.radius) continue;
        const l = h.dist || 1;
        g.hitZombie(h.z, dmg, { kx: h.dx / l, kz: h.dz / l, knock: 0, burn, slow: s.slow, weapon: w, unblockable: true });
        if (h.z.dead) continue;
        // 감쇠(exp(-6t)) 기준으로 플레이어 앞 1.3m까지 끌려오는 세기
        const pull = 6 * Math.max(0, h.dist - 1.3);
        h.z.kn.x = (-h.dx / l) * pull;
        h.z.kn.z = (-h.dz / l) * pull;
        h.z.body.vy = Math.max(h.z.body.vy, 3);
        h.z.slowT = Math.max(h.z.slowT, 2);
      }
      break;
    }
    case 'pistol': {
      P.startSwing(0.18, 'gun');
      const targets = zombiesAround(g, s.range, 4, 4).slice(0, s.shots);
      const ox = b.x;
      const oy = b.y + 1.25;
      const oz = b.z;
      targets.forEach((h, i) => {
        const zb = h.z.body;
        g.fx.line(ox, oy, oz, zb.x, zb.y + h.z.def.height * 0.6, zb.z, 0xffe38a, 0.06, 0.18 + i * 0.02);
        const l = h.dist || 1;
        g.hitZombie(h.z, dmg, { kx: h.dx / l, kz: h.dz / l, knock: 3, burn, weapon: w, unblockable: true });
      });
      g.audio.play('pistol');
      if (targets[0]) P.faceDir(targets[0].dx, targets[0].dz, 0.3);
      break;
    }
    case 'rifle':
      g.special = { kind: 'barrage', w, dmg, burn, t: s.duration, tick: 0 };
      break;
    case 'shotgun': {
      P.startSwing(0.25, 'gun');
      g.audio.play('shotgun');
      piercingBlast(g, w, s, dmg, burn);
      g.cam.shake = Math.max(g.cam.shake, 0.7);
      g.addHitstop(0.08);
      break;
    }
    default:
  }
}

/** 관통 산탄: 발판에는 막히지만 좀비는 모두 꿰뚫는다 */
function piercingBlast(g, w, s, dmg, burn) {
  const P = g.player;
  const b = P.body;
  const t = g.findTarget(s.range, 50, 6);
  if (t) P.faceDir(t.body.x - b.x, t.body.z - b.z, 0.3);
  const yaw = P.facing;
  const ox = b.x + Math.sin(yaw) * 0.5;
  const oy = b.y + 1.2;
  const oz = b.z + Math.cos(yaw) * 0.5;
  const plats = g.near(b.y);
  const hitOnce = new Map(); // 좀비당 최대 3발
  for (let i = 0; i < s.pellets; i++) {
    const a = yaw + ((i / (s.pellets - 1)) - 0.5) * 2 * (s.spread * Math.PI) / 180 + (Math.random() - 0.5) * 0.04;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const dy = (Math.random() - 0.5) * 0.08;
    let tMax = s.range;
    for (const p of plats) {
      if (!p.solid || p === b.ground || p.type === 'lavafloor') continue;
      const tt = rayBox(ox, oy, oz, dx, dy, dz, p, tMax);
      if (tt !== null && tt > 0.05 && tt < tMax) tMax = tt;
    }
    g.fx.line(ox, oy, oz, ox + dx * tMax, oy + dy * tMax, oz + dz * tMax, 0xffc46a, 0.05, 0.12);
    for (const z of g.zombies) {
      if (z.dead || z.removed) continue;
      const zb = z.body;
      const box = { minX: zb.x - zb.hw, maxX: zb.x + zb.hw, minY: zb.y, maxY: zb.y + zb.h, minZ: zb.z - zb.hw, maxZ: zb.z + zb.hw };
      const tt = rayBox(ox, oy, oz, dx, dy, dz, box, tMax);
      if (tt === null) continue;
      const n = hitOnce.get(z) || 0;
      if (n >= 3) continue;
      hitOnce.set(z, n + 1);
      g.hitZombie(z, dmg, { kx: dx, kz: dz, knock: s.knock, burn, weapon: w, unblockable: true });
    }
  }
}

export function updateSpecial(g, dt) {
  const sp = g.special;
  const P = g.player;
  if (!P.alive) { g.special = null; return; }
  const s = WEAPONS[sp.w.kind].special;
  sp.t -= dt;
  sp.tick -= dt;
  const b = P.body;
  if (sp.kind === 'spin') {
    P.facing += dt * 22;
    P.faceLock = 0.1;
    if (sp.tick <= 0) {
      sp.tick += s.tick;
      P.startSwing(0.4, 'melee');
      g.audio.play('swing-axe');
      g.fx.slash(b.x, b.y, b.z, P.facing, s.radius, 359, 0xffe0a0);
      hitRadius(g, sp.w, sp.dmg, sp.burn, s.radius, s.knock);
    }
  } else if (sp.kind === 'barrage') {
    if (sp.tick <= 0) {
      sp.tick += s.tick;
      const t = g.findTarget(30, 60, 10);
      if (t) P.faceDir(t.body.x - b.x, t.body.z - b.z, 0.2);
      P.startSwing(0.1, 'gun');
      const d = WEAPONS[sp.w.kind];
      g.fireGun(sp.w, { ...d, spread: 3.5, knockback: 2 }, t);
    }
  }
  if (sp.t <= 0) g.special = null;
}
