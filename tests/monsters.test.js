import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game.js';
import { Zombie } from '../src/entities/Zombie.js';
import { ZOMBIES, zombieWeights } from '../src/config/zombies.js';
import { generateTower } from '../src/world/TowerGenerator.js';

/** Game의 몬스터 함수만 시험하기 위한 최소 대역 */
function fakeGame() {
  return {
    zombies: [],
    scene: { add() {}, remove() {} },
    difficulty: { hp: 1, zspeed: 1 },
    groundYAt: () => 0,
    camera: { quaternion: { x: 0, y: 0, z: 0, w: 1 } },
    hud: { floater() {}, toast() {} },
    fx: { ring() {}, burst() {} },
    audio: { play() {} },
    spawnZombieAt: Game.prototype.spawnZombieAt,
  };
}
const mk = (g, type, x = 0) => {
  const z = new Zombie(g, type, 5, { x, y: 0, z: 0, platform: null });
  z.stageIdx = 5;
  g.zombies.push(z);
  return z;
};

describe('몬스터 다양화', () => {
  it('분열 망자는 꼬마 망자 둘로 갈라지고, 꼬마는 바로 쫓아온다', () => {
    const g = fakeGame();
    const s = mk(g, 'splitter');
    Game.prototype.spawnSplit.call(g, s);
    const minis = g.zombies.filter((z) => z.type === 'mini');
    expect(minis).toHaveLength(ZOMBIES.splitter.split.count);
    expect(minis.every((m) => m.alerted && m.stageIdx === 5)).toBe(true);
  });

  it('주술 망자는 다친 일반 좀비만 회복하고 보스·먼 좀비는 회복하지 않는다', () => {
    const g = fakeGame();
    const sh = mk(g, 'shaman');
    const near = mk(g, 'walker', 2);
    const far = mk(g, 'walker', 20);
    const boss = mk(g, 'captain', 1);
    for (const z of [near, far, boss]) z.hp = z.maxHp * 0.5;
    Game.prototype.healZombies.call(g, sh);
    expect(near.hp).toBeCloseTo(near.maxHp * (0.5 + ZOMBIES.shaman.heal.pct));
    expect(far.hp).toBeCloseTo(far.maxHp * 0.5);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.5);
  });

  it('역병 여왕의 소환은 살아 있는 졸개 수 상한을 지킨다', () => {
    const g = fakeGame();
    const q = mk(g, 'plagueQueen');
    for (let i = 0; i < 5; i++) Game.prototype.spawnMinions.call(g, q);
    const minions = g.zombies.filter((z) => z.summoner === q);
    expect(minions).toHaveLength(ZOMBIES.plagueQueen.summon.max);
    minions[0].dead = true;
    Game.prototype.spawnMinions.call(g, q);
    expect(g.zombies.filter((z) => z.summoner === q && !z.dead)).toHaveLength(ZOMBIES.plagueQueen.summon.max);
  });

  it('도약 망자는 플레이어 바로 앞에 떨어지는 포물선으로 뛴다', () => {
    const g = fakeGame();
    const z = mk(g, 'leaper');
    z.body.grounded = true;
    z.leapAt(g, 6, 0, 6, 0);
    expect(z.body.grounded).toBe(false);
    expect(z.body.vy).toBeGreaterThan(0);
    // 착지 예상 지점 = 수평속도 × 체공시간(대칭 포물선)
    const flight = (2 * z.body.vy) / 30;
    expect(z.air.vx * flight).toBeGreaterThan(3.5);
    expect(z.air.vx * flight).toBeLessThan(6);
    expect(z.leapCd).toBe(ZOMBIES.leaper.leap.cooldown);
  });

  it('층이 오를수록 종류가 다양해지고 몬스터가 많아진다', () => {
    const kinds = (s) => Object.entries(zombieWeights(s)).filter(([, v]) => v > 0).length;
    expect(kinds(1)).toBeLessThan(kinds(5));
    expect(kinds(10)).toBeGreaterThanOrEqual(10);
    const t = generateTower(2024);
    const counts = t.stages.map((st) => st.zombies.length);
    expect(counts[0]).toBeGreaterThanOrEqual(10);
    expect(counts[9]).toBeGreaterThan(30);
  });
});
