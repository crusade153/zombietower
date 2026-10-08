import { THRILL } from '../config/balance.js';

/** 치명타 판정. rand는 0~1 난수 함수 */
export function rollCrit(rand = Math.random) {
  return rand() < THRILL.critChance;
}

/** 콤보 수에 해당하는 코인 배율 */
export function comboMult(count) {
  let mult = 1;
  for (const t of THRILL.comboTiers) if (count >= t.at) mult = t.mult;
  return mult;
}

/** 킬 콤보: 제한 시간 안에 연속 처치하면 쌓이고, 끊기면 0으로 돌아간다 */
export class Combo {
  constructor() {
    this.count = 0;
    this.timer = 0;
    this.best = 0;
  }

  /** 처치 1회. tierUp: 이번 처치로 배율 단계가 올랐는지 */
  add() {
    const before = comboMult(this.count);
    this.count++;
    this.timer = THRILL.comboWindow;
    this.best = Math.max(this.best, this.count);
    const mult = comboMult(this.count);
    return { count: this.count, mult, tierUp: mult > before };
  }

  get mult() { return comboMult(this.count); }
  /** 남은 시간 비율 0~1 (HUD 막대) */
  get left() { return this.count ? this.timer / THRILL.comboWindow : 0; }

  update(dt) {
    if (!this.count) return;
    this.timer -= dt;
    if (this.timer <= 0) this.reset();
  }

  reset() { this.count = 0; this.timer = 0; }
}

/**
 * 용암 탈출 감지: 발밑까지 용암이 차오른(위기) 뒤 살아서 거리를 벌리거나
 * 안전구역에 도착하면 한 번 성공을 알린다.
 */
export class LavaEscape {
  constructor() { this.armed = false; }

  /** gap: 발과 용암 높이차, rising: 용암이 실제로 오르는 중, idle: 용암이 멈춘 상태 */
  update(gap, rising, idle) {
    if (!this.armed) {
      if (rising && gap < THRILL.lavaCloseGap) this.armed = true;
      return false;
    }
    if (idle || gap > THRILL.lavaEscapeGap) {
      this.armed = false;
      return true;
    }
    return false;
  }

  reset() { this.armed = false; }
}
