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
  return Math.round(ECON.upgradeBase * ECON.upgradeGrowth ** w.level * RARITY[w.rarity].cost);
}
export const canUpgrade = (w) => w.level < ECON.maxLevel;
export const sellValue = (w) => ECON.sellValue[w.rarity];

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
