// localStorage 저장 (사파리 비공개 모드 등에서 실패해도 게임은 동작)
import { WEAPON_KINDS } from '../config/weapons.js';
import { ABILITY_IDS, ITEMS, ITEM_IDS, ECON } from '../config/balance.js';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS } from '../config/achievements.js';
import { COSMETICS, COSMETIC_KINDS, defaultCosmetics } from '../config/cosmetics.js';
import { freshRecord, RECORD_KEYS, BOSS_TYPES } from './Achievements.js';
import { fusionPreview } from '../combat/Weapons.js';
const KEY = 'zombie-tower-save-v1';

function freshSave() {
  return {
    v: 1,
    rarityVersion: 3,
    econVersion: 2, // 2: 코인 가치 상향(보상 축소·강화비 인상)
    seed: (Math.random() * 1e9) | 0,
    coins: 0,
    nextUid: 2,
    weapons: [{ uid: 1, kind: 'bat', rarity: 1, level: 0 }],
    equipped: [1, null, null],
    lastSafe: 0, // 도착한 가장 높은 안전구역
    resumeSafe: 0, // 선택한 시작 지점 (최고 기록과 별도)
    bossSanctuaryUnlocked: false,
    resumeAtBoss: false,
    finalBossDefeated: false,
    openedChests: [], // 연 상자의 안전구역 번호
    stars: Array(11).fill(0), // 층별 별 비트(1 시간·2 피격·4 공중 코인), 인덱스 = 층
    bestTimes: Array(11).fill(0), // 층별 최고 기록(초), 0 = 없음
    abilities: { doubleJump: false, dash: false }, // 해금한 이동 능력
    items: { spring: 0, cloak: 0, potion: 0, magnet: 0 }, // 소모 아이템 보유 수
    stickMode: 'float', // 이동 패드: float = 터치한 곳에 생김, fixed = 고정 위치
    record: freshRecord(), // 누적 기록(업적·통계)
    achievements: [], // 달성한 업적 id
    title: '', // 장착한 칭호
    cosmetics: defaultCosmetics(), // 꾸미기 보유·장착
    best: 0,
    muted: false,
    graphicsStyle: 'polished',
    musicVolume: 0.35,
    effectsVolume: 0.8,
    difficulty: 'normal',
    cleared: false,
  };
}

export function normalizeSave(raw) {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.weapons)) throw new Error('올바른 좀비 타워 저장 파일이 아닙니다.');
  const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, integer(value)));
  const defaults = freshSave();
  const s = { ...defaults };
  for (const key of Object.keys(defaults)) if (key in raw) s[key] = raw[key];
  s.loop = Math.max(0, integer(raw.loop));
  s.seed = integer(raw.seed, defaults.seed);
  s.coins = Math.max(0, integer(raw.coins));
  // 경제 개편 이전 저장의 코인은 새 가치에 맞게 1/8로 환산
  if (!raw.econVersion) s.coins = Math.floor(s.coins / 8);
  s.econVersion = 2;
  s.lastSafe = clamp(raw.lastSafe, 0, 10);
  s.resumeSafe = clamp(raw.resumeSafe ?? s.lastSafe, 0, s.lastSafe);
  s.best = Math.max(s.lastSafe, clamp(raw.best, 0, 10));
  s.difficulty = ['easy', 'normal', 'hard'].includes(raw.difficulty) ? raw.difficulty : 'normal';
  const ids = new Set();
  s.weapons = [];
  for (const w of raw.weapons) {
    const uid = integer(w?.uid);
    if (!w || !WEAPON_KINDS.includes(w.kind) || uid <= 0 || ids.has(uid) || s.weapons.length >= 12) continue;
    ids.add(uid);
    let rarity = clamp(w.rarity, 0, raw.rarityVersion >= 3 ? 7 : 6);
    if (!raw.rarityVersion && rarity === 3) rarity = 4;
    if (!(raw.rarityVersion >= 3)) rarity = [1, 3, 4, 6, 5, 6, 7][rarity];
    s.weapons.push({ uid, kind: w.kind, rarity, level: clamp(w.level, 0, ECON.levelLimit) });
  }
  if (!s.weapons.length) throw new Error('저장 파일에 유효한 무기가 없습니다.');
  s.nextUid = Math.max(integer(raw.nextUid), Math.max(...ids) + 1);
  const equipped = new Set();
  s.equipped = [0, 1, 2].map(i => {
    const uid = integer(raw.equipped?.[i]);
    if (!ids.has(uid) || equipped.has(uid)) return null;
    equipped.add(uid);
    return uid;
  });
  if (!equipped.size) s.equipped[0] = s.weapons[0].uid;
  s.openedChests = [...new Set((Array.isArray(raw.openedChests) ? raw.openedChests : []).map(value => integer(value)).filter(k => k >= 1 && k <= 10))];
  s.rarityVersion = 3;
  s.stars = Array.from({ length: 11 }, (_, k) => (k >= 1 ? clamp(raw.stars?.[k], 0, 7) : 0));
  s.bestTimes = Array.from({ length: 11 }, (_, k) => {
    const t = Number(raw.bestTimes?.[k]);
    return k >= 1 && Number.isFinite(t) && t > 0 ? Math.round(t * 10) / 10 : 0;
  });
  s.items = Object.fromEntries(ITEM_IDS.map((id) => [id, clamp(raw.items?.[id], 0, ITEMS[id].max)]));
  s.abilities = Object.fromEntries(ABILITY_IDS.map((id) => [id, raw.abilities?.[id] === true]));
  s.finalBossDefeated = !!raw.finalBossDefeated || (!raw.rarityVersion && !!raw.cleared);
  s.bossSanctuaryUnlocked = !!raw.bossSanctuaryUnlocked;
  s.resumeAtBoss = !!raw.resumeAtBoss && s.bossSanctuaryUnlocked;
  s.cleared = !!raw.cleared;
  s.muted = !!raw.muted;
  s.graphicsStyle = raw.graphicsStyle === 'classic' ? 'classic' : 'polished';
  s.stickMode = raw.stickMode === 'fixed' ? 'fixed' : 'float';
  s.record = freshRecord();
  for (const k of RECORD_KEYS) s.record[k] = Math.max(0, integer(raw.record?.[k]));
  s.record.bossTypes = [...new Set((Array.isArray(raw.record?.bossTypes) ? raw.record.bossTypes : []).filter((t) => BOSS_TYPES.includes(t)))];
  s.achievements = [...new Set((Array.isArray(raw.achievements) ? raw.achievements : []).filter((id) => ACHIEVEMENT_IDS.includes(id)))];
  const titles = ACHIEVEMENTS.filter((a) => a.title && s.achievements.includes(a.id)).map((a) => a.title);
  s.title = titles.includes(raw.title) ? raw.title : '';
  const cos = defaultCosmetics();
  const valid = new Set(COSMETIC_KINDS.flatMap((k) => COSMETICS[k].list.map((c) => `${k}:${c.id}`)));
  const owned = new Set([...cos.owned, ...(Array.isArray(raw.cosmetics?.owned) ? raw.cosmetics.owned : []).filter((x) => valid.has(x))]);
  cos.owned = [...owned];
  for (const k of COSMETIC_KINDS) if (owned.has(`${k}:${raw.cosmetics?.[k]}`)) cos[k] = raw.cosmetics[k];
  s.cosmetics = cos;
  for (const key of ['musicVolume', 'effectsVolume']) {
    s[key] = typeof raw[key] === 'number' && Number.isFinite(raw[key])
      ? Math.max(0, Math.min(1, raw[key])) : defaults[key];
  }
  return s;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      return normalizeSave(JSON.parse(raw));
    }
  } catch (e) { /* 무시 */ }
  return freshSave();
}

export function hasSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    return !!s && s.v === 1 && (s.lastSafe > 0 || s.coins > 0 || s.weapons.length > 1);
  } catch (e) { return false; }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}

export function newSave(keepMuted) {
  const s = freshSave();
  if (keepMuted !== undefined) s.muted = keepMuted;
  writeSave(s);
  return s;
}

export function addWeapon(save, w) {
  const weapon = { uid: save.nextUid++, kind: w.kind, rarity: w.rarity, level: w.level || 0 };
  save.weapons.push(weapon);
  // 빈 장착 슬롯이 있으면 자동 장착
  const empty = save.equipped.indexOf(null);
  if (empty >= 0) save.equipped[empty] = weapon.uid;
  return weapon;
}

export function weaponByUid(save, uid) {
  return save.weapons.find((w) => w.uid === uid) || null;
}

export function fuseWeapons(save, uids) {
  if (!Array.isArray(uids) || uids.length !== 3 || new Set(uids).size !== 3) return null;
  const materials = uids.map(uid => weaponByUid(save, uid));
  if (materials.some(w => !w)) return null;
  const result = fusionPreview(materials);
  const consumed = new Set(uids);
  const slot = save.equipped.findIndex(uid => consumed.has(uid));
  save.weapons = save.weapons.filter(w => !consumed.has(w.uid));
  save.equipped = save.equipped.map(uid => consumed.has(uid) ? null : uid);
  const w = { ...result, uid: save.nextUid++ };
  save.weapons.push(w);
  const destination = slot >= 0 ? slot : save.equipped.indexOf(null);
  if (destination >= 0) save.equipped[destination] = w.uid;
  return w;
}
