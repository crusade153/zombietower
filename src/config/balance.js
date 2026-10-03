// 모든 게임 수치는 여기서 조정한다. (실기 플레이하며 튜닝)

export const PHYS = {
  gravity: 30,
  jumpSpeed: 12, // 높이 = v²/2g = 2.4m
  moveSpeed: 7,
  groundAccel: 90,
  airAccel: 40,
  coyote: 0.12,
  jumpBuffer: 0.12,
  jumpCut: 1, // 1 = 항상 풀 점프(터치 탭으로도 같은 높이). 0.5 등으로 낮추면 일찍 뗄 때 낮게 점프
  maxFall: 32,
  playerHalf: 0.4,
  playerHeight: 1.8,
  stepUp: 0.3,
  fixedDt: 1 / 120,
};

export const TOWER = {
  stages: 10,
  radius: 20, // 나선 반지름 (클수록 한 바퀴당 상승이 커서 위아래 발판이 안 겹침)
  pillarRadius: 4,
  wallRadius: 40, // 속이 빈 탑의 바깥 벽 반지름
  platformsPerStage: (s) => 28 + 2 * s,
  riseAvg: 0.85, // 발판당 평균 상승(m)
  riseMax: (d) => 1.45 + 0.4 * d, // 발판 간 최대 상승. 점프 높이(2.4)의 60~77%
  // 점프 가능 최대 거리 대비 간격 비율 (난이도 d: 0~1)
  gapRatioLow: (d) => 0.35 + 0.25 * d,
  gapRatioHigh: (d) => 0.55 + 0.3 * d,
  hardGapRatio: 0.92, // 어떤 경우에도 넘으면 안 되는 상한(테스트로 보장)
  halfSize: (d) => 2.6 - 1.5 * d, // 발판 절반 크기
  minHalf: 0.9,
  platformThickness: 0.6,
  safeHalf: 8,
  checkpointEvery: 10,
};

export const LAVA = {
  startDelay: 6,
  startGap: 14,
  speedBase: 0.5,
  speedPerStage: 0.035,
  catchUpGap: 26,
  catchUpMult: 1.6,
  warnGap: 8,
  deathResetGap: 10,
  deathFreeze: 4,
  waterFreeze: 6,
  waterBlink: 1.5,
  waterCharges: 2,
  waterCooldown: 3,
  deathCoinLoss: 0.1,
};

export const PLAYER = {
  maxHp: 100,
  iframes: 0.9,
  knockback: 9,
};

export const ECON = {
  upgradeBase: 40,
  upgradeGrowth: 1.35,
  upgradeDmgPerLevel: 0.12,
  maxLevel: 10,
  sellValue: [20, 50, 120, 300], // 중복 무기 판매가(등급별)
};

// 상자 등급 확률(층 1 → 10 선형 보간). [일반, 희귀, 영웅, 전설]
export const CHEST_ODDS = {
  first: [70, 25, 5, 0],
  last: [10, 35, 40, 15],
  bossMinRarity: 2,
};
