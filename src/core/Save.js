// localStorage 저장 (사파리 비공개 모드 등에서 실패해도 게임은 동작)
import { WEAPON_KINDS } from '../config/weapons.js';
const KEY = 'zombie-tower-save-v1';

function freshSave() {
  return {
    v: 1,
    rarityVersion: 2,
    econVersion: 2, // 2: 코인 가치 상향(보상 축소·강화비 인상)
    seed: (Math.random() * 1e9) | 0,
    coins: 0,
    nextUid: 2,
    weapons: [{ uid: 1, kind: 'bat', rarity: 0, level: 0 }],
    equipped: [1, null, null],
    lastSafe: 0, // 도착한 가장 높은 안전구역
    resumeSafe: 0, // 선택한 시작 지점 (최고 기록과 별도)
    bossSanctuaryUnlocked: false,
    resumeAtBoss: false,
    finalBossDefeated: false,
    openedChests: [], // 연 상자의 안전구역 번호
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
    let rarity = clamp(w.rarity, 0, 6);
    if (!raw.rarityVersion && rarity === 3) rarity = 4;
    s.weapons.push({ uid, kind: w.kind, rarity, level: clamp(w.level, 0, 10) });
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
  s.rarityVersion = 2;
  s.finalBossDefeated = !!raw.finalBossDefeated || (!raw.rarityVersion && !!raw.cleared);
  s.bossSanctuaryUnlocked = !!raw.bossSanctuaryUnlocked;
  s.resumeAtBoss = !!raw.resumeAtBoss && s.bossSanctuaryUnlocked;
  s.cleared = !!raw.cleared;
  s.muted = !!raw.muted;
  s.graphicsStyle = raw.graphicsStyle === 'classic' ? 'classic' : 'polished';
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
