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
  leaper: {
    name: '도약 망자', hp: 45, dmg: 14, speed: 3.0, coin: 16, scale: 0.95, radius: 0.4, height: 1.75,
    colors: { skin: 0xb5553a, shirt: 0x5a2f2a, pants: 0x2e2633 },
    attackRange: 1.4, windup: 0.35, cooldown: 1.0, knockResist: 0,
    leap: { min: 3.2, max: 8.5, cooldown: 3.2 }, // 떨어진 곳에서 플레이어에게 덮쳐 온다
  },
  shaman: {
    name: '주술 망자', hp: 55, dmg: 8, speed: 2.0, coin: 24, scale: 1, radius: 0.4, height: 1.8,
    colors: { skin: 0x6f5a7d, shirt: 0x3b2a52, pants: 0x2a2238 },
    attackRange: 7, windup: 0.6, cooldown: 2.4, knockResist: 0, ranged: true,
    // 주변 좀비 회복(보스 제외) → 먼저 잡아야 한다. 7m까지 다가와 플레이어와 싸우는 동료를 범위 안에 둔다
    heal: { radius: 8, pct: 0.18, every: 3.5 },
  },
  splitter: {
    name: '분열 망자', hp: 80, dmg: 12, speed: 2.4, coin: 14, scale: 1.2, radius: 0.5, height: 2.1,
    colors: { skin: 0x6d7a3e, shirt: 0x3e4a2c, pants: 0x2b3024 },
    attackRange: 1.5, windup: 0.45, cooldown: 1.2, knockResist: 0.3,
    split: { type: 'mini', count: 2 }, // 쓰러지면 꼬마 망자 둘로 갈라진다
  },
  mini: {
    name: '꼬마 망자', hp: 18, dmg: 6, speed: 4.6, coin: 4, scale: 0.65, radius: 0.3, height: 1.2,
    colors: { skin: 0x7d8a48, shirt: 0x4a5632, pants: 0x30362a },
    attackRange: 1.1, windup: 0.25, cooldown: 0.8, knockResist: 0,
  },
  captain: {
    name: '망자 우두머리', hp: 380, dmg: 18, speed: 2.6, coin: 70, scale: 1.8, radius: 0.75, height: 3.2,
    colors: { skin: 0x6b3f3a, shirt: 0x4a2a22, pants: 0x2a2028 },
    attackRange: 2.2, windup: 0.7, cooldown: 1.7, knockResist: 0.8, boss: true, captain: true,
  },
  magmaGiant: {
    name: '마그마 거인', hp: 620, dmg: 20, speed: 2.2, coin: 140, scale: 2.2, radius: 0.95, height: 4.0,
    colors: { skin: 0x8a3b25, shirt: 0x3a2224, pants: 0x2a1d22 },
    attackRange: 3.0, windup: 0.9, cooldown: 2.1, knockResist: 0.85, boss: true,
    intro: '붉은 원이 퍼지면 점프로 피하라',
  },
  plagueQueen: {
    name: '역병 여왕', hp: 1300, dmg: 22, speed: 2.3, coin: 260, scale: 2.5, radius: 1.05, height: 4.5,
    colors: { skin: 0x5e4a6e, shirt: 0x2e2340, pants: 0x221b30 },
    attackRange: 3.2, windup: 0.85, cooldown: 1.9, knockResist: 0.9, boss: true,
    volley: true, // 멀면 산성탄 3발
    summon: { type: 'runner', count: 3, every: 9, max: 6 }, // 주기적으로 졸개 소환
    intro: '졸개를 부르고 멀리서 산성탄을 쏜다',
  },
  boss: {
    name: '화산 수문장', hp: 900, dmg: 24, speed: 2.6, coin: 200, scale: 2.4, radius: 1.0, height: 4.3,
    colors: { skin: 0x763d3b, shirt: 0x362335, pants: 0x262235 },
    attackRange: 3.2, windup: 0.8, cooldown: 2.0, knockResist: 0.85, boss: true,
    intro: '내려찍기 전에 붉은 원 밖으로',
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
    intro: '체력 절반에서 폭주한다 · 불길은 점프로 회피',
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
    leaper: s >= 3 ? 1.5 + (s - 3) * 0.5 : 0,
    shaman: s >= 4 ? 1 + (s - 4) * 0.35 : 0,
    splitter: s >= 5 ? 1.5 + (s - 5) * 0.5 : 0,
  };
}
// 보스 경기장 층과 보스. 그 밖의 2층 이상에는 우두머리(captain)가 한 마리씩
export const BOSS_BY_STAGE = { 3: 'magmaGiant', 5: 'boss', 7: 'plagueQueen', 10: 'finalBoss' };
export const captainStage = (s) => s >= 2 && !BOSS_BY_STAGE[s];

// 황금 망자: 2층부터 층마다 이 확률로 한 마리
export const goldenChance = (s) => (s >= 2 ? 0.55 : 0);

export const hpScale = (s) => 1 + 0.18 * (s - 1);
export const dmgScale = (s) => 1 + 0.1 * (s - 1);
export const coinScale = (s) => ECON.zombieRewardMult * (1 + 0.25 * (s - 1));
