export const RARITY = [
  { id: 'common', name: '일반', color: '#c9ced6', mult: 1.0, cost: 1.0 },
  { id: 'rare', name: '희귀', color: '#4ea3ff', mult: 1.4, cost: 1.5 },
  { id: 'epic', name: '영웅', color: '#b366ff', mult: 2.0, cost: 2.2 },
  { id: 'legendary', name: '전설', color: '#ffb020', mult: 3.0, cost: 3.0 },
];

// 등급별 추가 특성 (누적)
export const RARITY_PERKS = [
  [],
  ['coin'], // 코인 +15%
  ['coin', 'burn'], // 화상
  ['coin', 'burn', 'lifesteal'], // 처치 시 체력 회복
];
export const PERK_TEXT = {
  coin: '코인 +15%',
  burn: '화상(3초)',
  lifesteal: '처치 시 체력 +6',
};

// kind: melee(부채꼴/직선) | gun(히트스캔)
export const WEAPONS = {
  bat: {
    name: '방망이', icon: '🏏', kind: 'melee', shape: 'arc',
    dmg: 18, interval: 0.55, windup: 0.12, range: 2.4, arc: 110, maxTargets: 2, knockback: 11,
    desc: '강한 넉백 — 좀비를 날려버린다',
  },
  axe: {
    name: '도끼', icon: '🪓', kind: 'melee', shape: 'arc',
    dmg: 40, interval: 1.0, windup: 0.28, range: 2.6, arc: 170, maxTargets: 99, knockback: 3,
    desc: '느리지만 광역 강타',
  },
  whip: {
    name: '채찍', icon: '〰️', kind: 'melee', shape: 'line',
    dmg: 10, interval: 0.36, windup: 0.08, range: 5.2, width: 1.3, maxTargets: 99, knockback: 0, slow: 0.4,
    desc: '긴 사거리 관통 + 둔화',
  },
  pistol: {
    name: '권총', icon: '🔫', kind: 'gun',
    dmg: 14, interval: 0.4, range: 32, mag: 12, reload: 1.2, pellets: 1, spread: 0, knockback: 2,
    desc: '정확한 원거리 사격',
  },
  rifle: {
    name: '소총', icon: '🔫', kind: 'gun',
    dmg: 9, interval: 0.2, range: 36, mag: 30, reload: 1.7, pellets: 1, spread: 1.5, knockback: 1,
    desc: '연사 — 누르고 있으면 계속 발사',
  },
  shotgun: {
    name: '샷건', icon: '💥', kind: 'gun',
    dmg: 8, interval: 0.9, range: 11, mag: 6, reload: 1.9, pellets: 6, spread: 9, knockback: 4,
    desc: '근거리 산탄 — 넉백 강함',
  },
};
export const WEAPON_KINDS = Object.keys(WEAPONS);
