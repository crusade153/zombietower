// hp·dmg는 층 배율(scale)이 곱해진다.
export const ZOMBIES = {
  walker: {
    name: '워커', hp: 50, dmg: 12, speed: 2.6, coin: 10, scale: 1, radius: 0.4, height: 1.8,
    colors: { skin: 0x6fa05a, shirt: 0x4a5a7a, pants: 0x3a3a48 },
    attackRange: 1.4, windup: 0.4, cooldown: 1.1, knockResist: 0,
  },
  runner: {
    name: '러너', hp: 30, dmg: 9, speed: 5.0, coin: 12, scale: 0.9, radius: 0.36, height: 1.6,
    colors: { skin: 0x9bc96b, shirt: 0xa84040, pants: 0x3a3a48 },
    attackRange: 1.3, windup: 0.3, cooldown: 0.9, knockResist: 0,
  },
  tank: {
    name: '탱크', hp: 170, dmg: 22, speed: 1.9, coin: 28, scale: 1.45, radius: 0.62, height: 2.6,
    colors: { skin: 0x4f7a45, shirt: 0x3a2a2a, pants: 0x222222 },
    attackRange: 1.9, windup: 0.6, cooldown: 1.5, knockResist: 0.7,
  },
  spitter: {
    name: '스피터', hp: 40, dmg: 10, speed: 2.0, coin: 18, scale: 1, radius: 0.4, height: 1.8,
    colors: { skin: 0xb6d44a, shirt: 0x6a7a2a, pants: 0x3a3a48 },
    attackRange: 14, windup: 0.5, cooldown: 2.2, knockResist: 0, ranged: true,
  },
  boss: {
    name: '보스', hp: 900, dmg: 30, speed: 2.6, coin: 320, scale: 2.4, radius: 1.0, height: 4.3,
    colors: { skin: 0x5a2a2a, shirt: 0x1a1a1a, pants: 0x1a1a1a },
    attackRange: 3.2, windup: 0.8, cooldown: 2.0, knockResist: 0.85, boss: true,
  },
};

// 층별 등장 가중치 (층 s 기준)
export function zombieWeights(s) {
  return {
    walker: 10,
    runner: s >= 2 ? 2 + s : 0,
    tank: s >= 3 ? 1 + (s - 2) * 0.6 : 0,
    spitter: s >= 4 ? 1 + (s - 3) * 0.7 : 0,
  };
}
export const hpScale = (s) => 1 + 0.18 * (s - 1);
export const dmgScale = (s) => 1 + 0.1 * (s - 1);
export const coinScale = (s) => 1 + 0.25 * (s - 1);
