// localStorage 저장 (사파리 비공개 모드 등에서 실패해도 게임은 동작)
const KEY = 'zombie-tower-save-v1';

function freshSave() {
  return {
    v: 1,
    seed: (Math.random() * 1e9) | 0,
    coins: 0,
    nextUid: 2,
    weapons: [{ uid: 1, kind: 'bat', rarity: 0, level: 0 }],
    equipped: [1, null, null],
    lastSafe: 0, // 도착한 가장 높은 안전구역
    openedChests: [], // 연 상자의 안전구역 번호
    best: 0,
    muted: false,
    difficulty: 'normal',
    cleared: false,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return { ...freshSave(), ...s };
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
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 무시 */ }
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
