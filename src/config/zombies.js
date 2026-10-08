import { ECON } from './balance.js';

// hp·dmg는 층 배율(scale)이 곱해진다.
export const ZOMBIES = {
  walker: {
    name: '잿불 망자', hp: 50, dmg: 12, speed: 2.6, coin: 10, scale: 1, radius: 0.4, height: 1.8,
    colors: { skin: 0x624341, shirt: 0x3b3040, pants: 0x292c3b },
    attackRange: 1.4, windup: 0.4, cooldown: 1.1, knockResist: 0,
  },
  runner: {
    name: '화염 사냥꾼', hp: 30, dmg: 9, speed: 5.0, coin: 12, scale: 0.9, radius: 0.36, height: 1.6,
    colors: { skin: 0xaa4938, shirt: 0x5e292e, pants: 0x302635 },
    attackRange: 1.3, windup: 0.3, cooldown: 0.9, knockResist: 0,
  },
  tank: {
    name: '마그마 골렘', hp: 170, dmg: 22, speed: 1.9, coin: 20, scale: 1.45, radius: 0.62, height: 2.6,
    colors: { skin: 0x593d3b, shirt: 0x302633, pants: 0x221e2b },
    attackRange: 1.9, windup: 0.6, cooldown: 1.5, knockResist: 0.7,
  },
  spitter: {
    name: '용암 분출자', hp: 40, dmg: 10, speed: 2.0, coin: 18, scale: 1, radius: 0.4, height: 1.8,
    colors: { skin: 0x974635, shirt: 0x493348, pants: 0x332b3d },
    attackRange: 14, windup: 0.5, cooldown: 2.2, knockResist: 0, ranged: true,
  },
  bomber: {
    name: '폭탄 망자', hp: 35, dmg: 28, speed: 3.4, coin: 14, scale: 0.95, radius: 0.4, height: 1.75,
    colors: { skin: 0x7a4a3a, shirt: 0x3a3a46, pants: 0x2a2a35 },
    attackRange: 1.6, windup: 0.9, cooldown: 1, knockResist: 0,
    bomber: true, blast: 3.2, // 다가와서 자폭. 처치하면 그 자리에서 폭발해 주변 좀비까지 휩쓴다
  },
  shield: {
    name: '방패 수비대', hp: 90, dmg: 14, speed: 2.2, coin: 22, scale: 1.1, radius: 0.48, height: 1.95,
    colors: { skin: 0x5d4846, shirt: 0x34404f, pants: 0x262b38 },
    attackRange: 1.5, windup: 0.5, cooldown: 1.2, knockResist: 0.6,
    shield: true, turnRate: 2.4, // 정면 공격은 85% 막힘. 천천히 돌아서므로 옆·뒤나 위(점프)에서 공격
  },
  golden: {
    name: '황금 망자', hp: 60, dmg: 0, speed: 4.2, coin: 70, scale: 0.9, radius: 0.38, height: 1.65,
    colors: { skin: 0xffcf4a, shirt: 0xd9a21b, pants: 0xa8790f },
    attackRange: 0, windup: 1, cooldown: 1, knockResist: 0,
    flee: true, fleeTime: 25, // 공격하지 않고 도망친다. 들킨 뒤 25초 안에 못 잡으면 사라짐
  },
  boss: {
    name: '화산 수문장', hp: 900, dmg: 24, speed: 2.6, coin: 200, scale: 2.4, radius: 1.0, height: 4.3,
    colors: { skin: 0x763d3b, shirt: 0x362335, pants: 0x262235 },
    attackRange: 3.2, windup: 0.8, cooldown: 2.0, knockResist: 0.85, boss: true,
  },
  brute: {
    name: '흑요석 기사', hp: 320, dmg: 22, speed: 2.3, coin: 35, scale: 1.65, radius: 0.7, height: 3.0,
    colors: { skin: 0x634148, shirt: 0x262133, pants: 0x231b29 },
    attackRange: 2.1, windup: 0.65, cooldown: 1.6, knockResist: 0.75, elite: true,
  },
  warlock: {
    name: '지옥불 집행자', hp: 260, dmg: 20, speed: 2.2, coin: 40, scale: 1.4, radius: 0.6, height: 2.5,
    colors: { skin: 0x8f414b, shirt: 0x402444, pants: 0x252134 },
    attackRange: 14, windup: 0.75, cooldown: 1.8, knockResist: 0.5, ranged: true, elite: true,
  },
  finalBoss: {
    name: '용암 군주 · 이그니스', hp: 1800, dmg: 26, speed: 2.4, coin: 600, scale: 3.1, radius: 1.3, height: 5.6,
    colors: { skin: 0x7d363c, shirt: 0x281c30, pants: 0x1d1928 },
    attackRange: 3.5, windup: 1.1, cooldown: 1.8, knockResist: 0.95, boss: true, finalBoss: true,
  },
};

// 층별 등장 가중치 (층 s 기준)
export function zombieWeights(s) {
  return {
    walker: s >= 7 ? 3 : 10,
    runner: s >= 2 ? 2 + s : 0,
    tank: s >= 3 ? 1 + (s - 2) * 0.6 : 0,
    spitter: s >= 4 ? 1 + (s - 3) * 0.7 : 0,
    brute: s >= 6 ? (s - 5) * 4 : 0,
    warlock: s >= 8 ? (s - 7) * 5 : 0,
    bomber: s >= 2 ? 1.5 + (s - 2) * 0.6 : 0,
    shield: s >= 3 ? 1.5 + (s - 3) * 0.6 : 0,
  };
}
// 황금 망자: 2층부터 층마다 이 확률로 한 마리
export const goldenChance = (s) => (s >= 2 ? 0.55 : 0);

export const hpScale = (s) => 1 + 0.18 * (s - 1);
export const dmgScale = (s) => 1 + 0.1 * (s - 1);
export const coinScale = (s) => ECON.zombieRewardMult * (1 + 0.25 * (s - 1));
