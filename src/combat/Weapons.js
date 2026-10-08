import { WEAPONS, RARITY, RARITY_PERKS, WEAPON_KINDS } from '../config/weapons.js';
import { ECON, CHEST_ODDS, TOWER } from '../config/balance.js';

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
  const level = Math.max(0, Math.min(ECON.softCapLevel, w.level || 0));
  const tier = level >= 10 ? 4 : level >= 7 ? 3 : level >= 4 ? 2 : level >= 1 ? 1 : 0;
  return {
    tier, level,
    name: ['기본형', '강철 보강', '룬 각인', '플라즈마', '황금 각성'][tier],
    color: [RARITY[w.rarity].color, '#c8e5ff', '#64f5de', '#c49aff', '#ffda63'][tier],
    next: [1, 4, 7, 10, null][tier],
  };
}

/** 초당 피해(참고용 표시) */
export function weaponDps(w) {
  const d = WEAPONS[w.kind];
  const dmg = weaponDamage(w) * (d.pellets || 1);
  return dmg / d.interval;
}

/** 상자 등급 확률 (층 1 → 10 보간) */
export function chestOdds(stage) {
  const t = Math.max(0, Math.min(1, (stage - 1) / (TOWER.stages - 1)));
  return CHEST_ODDS.first.map((a, i) => a + (CHEST_ODDS.last[i] - a) * t);
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
  const kind = WEAPON_KINDS[Math.floor(rng() * WEAPON_KINDS.length)];
  const rar = rollRarity(stage, rng, isBoss ? CHEST_ODDS.bossMinRarity : 0);
  return { kind, rarity: rar, level: 0 };
}
