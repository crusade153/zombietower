import { STARS } from '../config/balance.js';

// 별 비트: 1 = ⏱ 목표 시간, 2 = 💔 피격 제한, 4 = 💰 공중 코인
export const STAR_TIME = 1;
export const STAR_HITS = 2;
export const STAR_COINS = 4;

export const starCount = (mask) => ((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1));

/** 한 층 도전 기록. 안전구역을 떠나 그 층 발판을 밟은 순간 시작, 다음 안전구역 도착으로 끝난다 */
export class StageRun {
  constructor(stage, platformCount, boss, airTotal) {
    this.stage = stage;
    this.par = STARS.parTime(platformCount, boss);
    this.airTotal = airTotal;
    this.t = 0;
    this.hits = 0;
    this.air = 0;
  }

  get mask() {
    let m = 0;
    if (this.t <= this.par) m |= STAR_TIME;
    if (this.hits <= STARS.maxHits) m |= STAR_HITS;
    if (this.airTotal === 0 || this.air >= Math.ceil(this.airTotal * STARS.airRate)) m |= STAR_COINS;
    return m;
  }

  /** 이전 기록(prevMask)과 합쳐 새로 딴 별과 보상을 계산 */
  settle(prevMask = 0) {
    const mask = this.mask;
    const gained = mask & ~prevMask;
    return { mask, total: prevMask | mask, gained, reward: starCount(gained) * STARS.reward(this.stage) };
  }
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
