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
  upgradeGrowth: 1.35, // 일반 +10까지 약 2,200 · 무적 약 4,400코인
  upgradeDmgPerLevel: 0.12,
  maxLevel: 10,
  zombieRewardMult: 0.75, // 몬스터가 많아진 만큼 1마리당 코인은 낮춘다
  airCoinRewardMult: 2,
  floorReward: (floor) => 40 + floor * 20,
  sellValue: [15, 35, 70, 120, 180, 260, 380], // 중복 무기 판매가(등급별)
};

// 손맛: 치명타·히트스톱·킬 콤보·아슬아슬 보너스
export const THRILL = {
  critChance: 0.1,
  critMult: 2,
  // 명중 순간 게임을 잠깐 멈춰 타격감을 준다(초). 연사 무기는 치명타·처치 때만 멈춘다.
  hitstop: { melee: 0.04, crit: 0.07, kill: 0.06, boss: 0.2, max: 0.2 },
  comboWindow: 3, // 마지막 처치 후 이 시간 안에 다시 처치하면 콤보 유지
  comboTiers: [
    { at: 5, mult: 1.5 },
    { at: 10, mult: 2 },
    { at: 20, mult: 3 },
  ],
  nearMissReward: (stage) => 5 + 2 * stage,
  nearMissCooldown: 1.2,
  lavaCloseGap: 1.0, // 발밑 용암이 이 거리 안까지 오면 '위기'
  lavaEscapeGap: 5, // 위기 후 이만큼 벌리면 탈출 성공
  lastSecond: 0.25, // 사라지기 직전 이 시간 안에 뛰어오르면 아슬아슬
};

// 이동 능력: 대장간에서 코인으로 해금(영구). 타워는 기본 점프만으로도 항상 클리어 가능하다.
export const ABILITIES = {
  doubleJump: { name: '2단 점프', icon: '⏫', cost: 250, desc: '공중에서 점프를 한 번 더', jumpMult: 0.85 },
  dash: { name: '대시', icon: '💨', cost: 450, desc: '이동 방향으로 순간 돌진 (공중에서는 1회)', speed: 17, time: 0.17, cooldown: 0.6 },
};
export const ABILITY_IDS = Object.keys(ABILITIES);

// 차지 필살기: 공격 버튼을 time초 이상 누르고 있다가 떼면 발동, 이후 cooldown초 재충전
export const CHARGE = {
  time: 0.9,
  cooldown: 6,
};

// 층별 별 3개: ⏱ 목표 시간 안에 · 💔 피격 maxHits회 이하 · 💰 공중 코인 airRate 이상.
// 별마다 처음 딸 때만 reward 지급. 이미 클리어한 층은 다시 도전하면 좀비·공중 코인이 되살아난다.
export const STARS = {
  parTime: (platforms, boss) => Math.round(platforms * 2 + (boss ? 50 : 0)), // 초
  maxHits: 3,
  airRate: 0.8,
  reward: (stage) => 25 + 12 * stage,
};

// [일반, 레어, 에픽, 신화, 전설, 천상, 무적]. 최상위도 1층부터 획득 가능.
export const CHEST_ODDS = {
  first: [25, 20, 18, 12, 10, 8, 7],
  last: [4, 6, 10, 12, 18, 22, 28],
  bossMinRarity: 3,
};
