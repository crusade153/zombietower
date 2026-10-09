import { WEAPONS, RARITY, RARITY_PERKS, DROP_WEAPON_KINDS, FUSION_KINDS, baseWeaponKind } from '../config/weapons.js';
import { ECON, CHEST_ODDS } from '../config/balance.js';

export const def = (w) => WEAPONS[w.kind];
export const rarity = (w) => RARITY[w.rarity];
export const weaponName = (w) => `${RARITY[w.rarity].name} ${WEAPONS[w.kind].name}`;
export const perks = (w) => RARITY_PERKS[w.rarity];
export const hasPerk = (w, p) => RARITY_PERKS[w.rarity].includes(p);

/** 1타(또는 1발) 공격력 */
export function weaponDamage(w) {
  return WEAPONS[w.kind].dmg * RARITY[w.rarity].mult * (1 + ECON.upgradeDmgPerLevel * w.level);
}

export function upgradeCost(w) {
  const early = Math.min(w.level, ECON.softCapLevel);
  const late = Math.max(0, w.level - ECON.softCapLevel);
  return Math.round(ECON.upgradeBase * ECON.upgradeGrowth ** early * (1 + ECON.upgradeLateGrowth * late) * RARITY[w.rarity].cost);
}
export const canUpgrade = (w) => w.level < ECON.levelLimit;
export const sellValue = (w) => ECON.sellValue[w.rarity];

export function sellPrice(w) {
  let spent = 0;
  for (let level = 0; level < w.level; level++) spent += upgradeCost({ ...w, level });
  return sellValue(w) + Math.floor(spent * 0.5);
}

export function weaponAppearance(w) {
  const level = Math.max(0, Math.min(15, w.level || 0));
  const tier = level > 10 ? 3 : level >= 6 ? 2 : level >= 1 ? 1 : 0;
  return {
    tier, level,
    name: ['기본형', '강철 보강', '룬 에너지', '황금 각성'][tier],
    color: [WEAPONS[w.kind].color || RARITY[w.rarity].color, '#c8e5ff', '#64f5de', '#ffda63'][tier],
    next: [1, 6, 11, null][tier],
  };
}

/** 초당 피해(참고용 표시) */
export function weaponDps(w) {
  const d = WEAPONS[w.kind];
  const dmg = weaponDamage(w) * (d.pellets || 1);
  return dmg / d.interval;
}

/** 사기급은 0.2%, 다른 등급은 요청한 수치 비율대로 99.8%를 배분. */
export function chestOdds(_stage, isBoss = false) {
  const sum = CHEST_ODDS.weights.reduce((a, b) => a + b, 0);
  const odds = [...CHEST_ODDS.weights.map(a => a / sum * 99.8), 0.2];
  if (isBoss) for (let i = 0; i < CHEST_ODDS.bossMinRarity; i++) {
    odds[CHEST_ODDS.bossMinRarity] += odds[i]; odds[i] = 0;
  }
  return odds;
}

export function rollRarity(stage, rng = Math.random, minRarity = 0) {
  const odds = chestOdds(stage);
  let total = 0;
  for (const o of odds) total += o;
  let r = rng() * total;
  let pick = 0;
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i];
    if (r < 0) { pick = i; break; }
  }
  return Math.max(pick, minRarity);
}

export function rollWeapon(stage, rng = Math.random, isBoss = false) {
  const kind = DROP_WEAPON_KINDS[Math.floor(rng() * DROP_WEAPON_KINDS.length)];
  const rar = rollRarity(stage, rng, isBoss ? CHEST_ODDS.bossMinRarity : 0);
  return { kind, rarity: rar, level: 0 };
}

/** 첫 재료가 설계도. 최고 등급 +1, 최고 강화 유지. 합성 실패 없음. */
export function fusionPreview(weapons) {
  if (weapons.length !== 3 || new Set(weapons.map(w => w.uid)).size !== 3) return null;
  const base = baseWeaponKind(weapons[0]);
  return {
    kind: FUSION_KINDS.find(k => WEAPONS[k].baseKind === base),
    rarity: Math.min(RARITY.length - 1, Math.max(...weapons.map(w => w.rarity)) + 1),
    level: Math.max(...weapons.map(w => w.level)),
  };
}

export function weaponEffect(w) {
  const look = weaponAppearance(w);
  return { color: Number.parseInt((look.tier >= 2 ? look.color : WEAPONS[w.kind].color || RARITY[w.rarity].color).slice(1), 16),
    strength: look.tier + (WEAPONS[w.kind].fusion ? 2 : 0) + (w.rarity >= 5 ? 1 : 0) };
}
