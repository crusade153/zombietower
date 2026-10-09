export const RARITY = [
  { id: 'trash', name: '쓰레기', color: '#8b929e', mult: 0.65, cost: 0.85 },
  { id: 'common', name: '일반', color: '#c9ced6', mult: 1.0, cost: 1.0 },
  { id: 'uncommon', name: '드문', color: '#70de92', mult: 1.25, cost: 1.1 },
  { id: 'rare', name: '레어', color: '#4ea3ff', mult: 1.6, cost: 1.2 },
  { id: 'epic', name: '에픽', color: '#b366ff', mult: 2.2, cost: 1.35 },
  { id: 'legendary', name: '전설', color: '#ffb020', mult: 3.2, cost: 1.6 },
  { id: 'mythic', name: '신화', color: '#ff668a', mult: 4.5, cost: 1.8 },
  { id: 'overpowered', name: '사기급', color: '#65efff', mult: 7.5, cost: 2.0 },
];

// 등급별 추가 특성 (누적)
export const RARITY_PERKS = [
  [],
  [],
  ['coin'],
  ['coin'],
  ['coin', 'burn'],
  ['coin', 'burn', 'lifesteal'],
  ['coin', 'burn', 'lifesteal'],
  ['coin', 'burn', 'lifesteal'],
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
    special: { name: '홈런 스윙', desc: '360° 강타로 주변 좀비를 하늘로 날린다', mult: 2.5, radius: 3.4, knock: 24 },
  },
  axe: {
    name: '도끼', icon: '🪓', kind: 'melee', shape: 'arc',
    dmg: 40, interval: 1.0, windup: 0.28, range: 2.6, arc: 170, maxTargets: 99, knockback: 3,
    desc: '느리지만 광역 강타',
    special: { name: '회오리 베기', desc: '1.2초간 회전하며 주변을 계속 벤다 (이동 가능)', mult: 0.9, radius: 3.1, duration: 1.2, tick: 0.2, knock: 6 },
  },
  whip: {
    name: '채찍', icon: '〰️', kind: 'melee', shape: 'line',
    dmg: 10, interval: 0.36, windup: 0.08, range: 5.2, width: 1.3, maxTargets: 99, knockback: 0, slow: 0.4,
    desc: '긴 사거리 관통 + 둔화',
    special: { name: '끌어당기기', desc: '앞쪽 좀비를 한꺼번에 끌어와 묶는다 (황금 망자도!)', mult: 1.5, range: 9, width: 2.6, slow: 0.6 },
  },
  pistol: {
    name: '권총', icon: '🔫', kind: 'gun',
    dmg: 14, interval: 0.4, range: 32, pellets: 1, spread: 0, knockback: 2,
    desc: '정확한 원거리 사격 · 무한 탄약',
    special: { name: '정밀 연사', desc: '주변 좀비 최대 6마리를 동시에 조준 사격 (방패 무시)', mult: 2.5, range: 26, shots: 6 },
  },
  rifle: {
    name: '소총', icon: '🔫', kind: 'gun',
    dmg: 9, interval: 0.2, range: 36, pellets: 1, spread: 1.5, knockback: 1,
    desc: '무한 탄약 연사 — 누르고 있으면 계속 발사',
    special: { name: '탄막 난사', desc: '1.5초간 초고속 연사', mult: 1, duration: 1.5, tick: 0.05 },
  },
  shotgun: {
    name: '샷건', icon: '💥', kind: 'gun',
    dmg: 8, interval: 0.9, range: 11, pellets: 6, spread: 9, knockback: 4,
    desc: '근거리 산탄 · 강한 넉백 · 무한 탄약',
    special: { name: '관통 산탄', desc: '좀비를 꿰뚫는 넓은 산탄 14발', mult: 1.2, range: 16, pellets: 14, spread: 20, knock: 8 },
  },
};
// 상자에서는 기본 무기를 발견하고, 합성 전용 무기는 대장간에서 제작한다.
export const DROP_WEAPON_KINDS = Object.keys(WEAPONS);
const fused = (baseKind, name, icon, dmg, color, desc, changes = {}) => ({
  ...WEAPONS[baseKind], baseKind, fusion: true, name, icon, dmg, color, desc, ...changes,
  special: { ...WEAPONS[baseKind].special, name: `${name} · ${WEAPONS[baseKind].special.name}`, mult: WEAPONS[baseKind].special.mult * 1.15 },
});
Object.assign(WEAPONS, {
  thunderHammer: fused('bat', '뇌명 전투망치', '🔨', 34, '#72eaff', '전격 코어를 품은 대형 망치 · 광역 강타', { range: 3.1, arc: 150, maxTargets: 8, knockback: 16 }),
  eclipseReaper: fused('axe', '월식 쌍날낫', '🌙', 78, '#c593ff', '양쪽 초승달 칼날로 넓은 범위를 벤다', { range: 3.5, arc: 200 }),
  infernoChain: fused('whip', '지옥불 사슬', '⛓️', 23, '#ff8754', '가시 사슬과 불꽃 코어 · 긴 관통 공격', { range: 6.5, width: 1.8, slow: 0.55 }),
  pulsePistol: fused('pistol', '성광 펄스건', '✨', 31, '#8dffba', '이중 코일이 응축한 강력한 광탄', { range: 38 }),
  tempestRifle: fused('rifle', '폭풍 레일소총', '⚡', 20, '#66dfff', '노출된 전자 레일에서 고속 에너지탄 발사', { range: 44, spread: 0.5 }),
  dragonShotgun: fused('shotgun', '용염 삼연포', '🐉', 21, '#ffb35c', '삼중 포신에서 쏟아지는 9발의 화염 산탄', { pellets: 9, range: 14 }),
});
export const FUSION_KINDS = Object.keys(WEAPONS).filter(k => WEAPONS[k].fusion);
export const WEAPON_KINDS = Object.keys(WEAPONS);
export const baseWeaponKind = w => WEAPONS[w.kind].baseKind || w.kind;
