import { describe, it, expect } from 'vitest';
import { WEAPONS, WEAPON_KINDS } from '../src/config/weapons.js';
import { CHARGE } from '../src/config/balance.js';
import { zombiesAround } from '../src/combat/Specials.js';
import { Zombie } from '../src/entities/Zombie.js';
import { ZOMBIES } from '../src/config/zombies.js';

describe('차지 필살기', () => {
  it('모든 무기에 이름·설명·배율이 있는 필살기가 있다', () => {
    const names = new Set();
    for (const k of WEAPON_KINDS) {
      const s = WEAPONS[k].special;
      expect(s.name).toBeTruthy();
      expect(s.desc).toBeTruthy();
      expect(s.mult).toBeGreaterThan(0);
      names.add(s.name);
    }
    expect(names.size).toBe(WEAPON_KINDS.length);
    expect(CHARGE.cooldown).toBeGreaterThan(CHARGE.time);
  });

  it('주변 좀비를 가까운 순으로 고르고, 죽었거나 높이가 다른 좀비는 뺀다', () => {
    const z = (x, y, extra = {}) => ({ body: { x, y, z: 0 }, def: { radius: 0.4, height: 1.8 }, ...extra });
    const g = {
      player: { body: { x: 0, y: 0, z: 0 } },
      zombies: [z(3, 0), z(1, 0), z(2, 0, { dead: true }), z(1.5, 10), z(9, 0)],
    };
    const got = zombiesAround(g, 4);
    expect(got.map((h) => h.dist)).toEqual([1, 3]);
  });

  it('필살기 타격은 방패를 무시한다', () => {
    const shield = { def: ZOMBIES.shield, hp: 1000, maxHp: 1000, facing: 0, kn: { x: 0, z: 0 }, body: { vy: 0 }, state: 'chase', slowT: 0, burnT: 0 };
    Zombie.prototype.takeDamage.call(shield, {}, 100, { kx: 0, kz: -1, unblockable: true });
    expect(shield.hp).toBe(900);
  });
});
