import { ACHIEVEMENTS } from '../config/achievements.js';
import { starCount } from './StageRun.js';

// 저장 파일에 남는 누적 기록(전체 플레이)
export const RECORD_KEYS = [
  'kills', 'bossKills', 'captainKills', 'goldenKills', 'bestCombo', 'nearMisses',
  'bestSpecialKills', 'bestChain', 'itemsUsed', 'deaths', 'clears',
];
export const BOSS_TYPES = ['magmaGiant', 'boss', 'plagueQueen', 'finalBoss'];

export function freshRecord() {
  const r = Object.fromEntries(RECORD_KEYS.map((k) => [k, 0]));
  r.bossTypes = [];
  return r;
}

/** 업적 판정에 쓰는 값: 누적 기록 + 저장에서 계산되는 값 */
export function recordView(save) {
  const r = save.record;
  return {
    ...r,
    bossTypes: r.bossTypes.length,
    stars: (save.stars || []).reduce((a, m) => a + starCount(m || 0), 0),
    maxWeaponLevel: Math.max(0, ...save.weapons.map((w) => w.level || 0)),
  };
}

export function achievementProgress(a, save, view = recordView(save)) {
  const [cur, goal] = a.goal(view);
  return { cur: Math.min(cur, goal), goal, done: cur >= goal || save.achievements.includes(a.id) };
}

/** 새로 달성한 업적을 저장에 표시하고 목록으로 돌려준다 (보상 지급은 호출한 쪽에서) */
export function unlockNew(save) {
  const view = recordView(save);
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id)) continue;
    const [cur, goal] = a.goal(view);
    if (cur >= goal) { save.achievements.push(a.id); got.push(a); }
  }
  return got;
}

export const ownedTitles = (save) => ACHIEVEMENTS.filter((a) => a.title && save.achievements.includes(a.id)).map((a) => a.title);
