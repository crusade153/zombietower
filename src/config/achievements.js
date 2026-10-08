// 업적: goal(v)는 [현재값, 목표값]. v = 누적 기록 + 별 수·최고 강화 등 파생값 (core/Achievements.js의 recordView)
// title이 있으면 달성 시 칭호를 얻는다. 보상 코인은 달성 순간 한 번 지급.
export const ACHIEVEMENTS = [
  { id: 'firstBlood', name: '첫 사냥', desc: '좀비 1마리 처치', goal: (v) => [v.kills, 1], reward: 10 },
  { id: 'hunter', name: '좀비 사냥꾼', desc: '좀비 300마리 처치', goal: (v) => [v.kills, 300], reward: 120, title: '사냥꾼' },
  { id: 'slayer', name: '망자 학살자', desc: '좀비 2,000마리 처치', goal: (v) => [v.kills, 2000], reward: 500, title: '학살자' },
  { id: 'combo20', name: '콤보 장인', desc: '20콤보 달성', goal: (v) => [v.bestCombo, 20], reward: 100, title: '콤보 장인' },
  { id: 'combo50', name: '끝없는 연격', desc: '50콤보 달성', goal: (v) => [v.bestCombo, 50], reward: 300, title: '연격의 달인' },
  { id: 'special5', name: '필살의 일격', desc: '필살기 한 번으로 5마리 처치', goal: (v) => [v.bestSpecialKills, 5], reward: 150, title: '필살자' },
  { id: 'chain3', name: '폭파 전문가', desc: '폭발 한 번에 3마리 처치', goal: (v) => [v.bestChain, 3], reward: 120, title: '폭파 전문가' },
  { id: 'firstBoss', name: '보스 사냥', desc: '보스 처치', goal: (v) => [v.bossKills, 1], reward: 80 },
  { id: 'allBosses', name: '타워의 정복자', desc: '보스 4종 모두 처치', goal: (v) => [v.bossTypes, 4], reward: 600, title: '정복자' },
  { id: 'captains', name: '우두머리 사냥', desc: '우두머리 10마리 처치', goal: (v) => [v.captainKills, 10], reward: 200 },
  { id: 'golden', name: '황금 사냥꾼', desc: '황금 망자 10마리 처치', goal: (v) => [v.goldenKills, 10], reward: 250, title: '황금 사냥꾼' },
  { id: 'acrobat', name: '곡예사', desc: '아슬아슬 30회', goal: (v) => [v.nearMisses, 30], reward: 150, title: '곡예사' },
  { id: 'stars15', name: '별 수집가', desc: '별 15개 모으기', goal: (v) => [v.stars, 15], reward: 200 },
  { id: 'stars30', name: '완벽주의자', desc: '별 30개 모두 모으기', goal: (v) => [v.stars, 30], reward: 600, title: '완벽주의자' },
  { id: 'smith', name: '전설의 대장장이', desc: '무기를 +15까지 강화', goal: (v) => [v.maxWeaponLevel, 15], reward: 250, title: '대장장이' },
  { id: 'regular', name: '단골손님', desc: '아이템 20개 사용', goal: (v) => [v.itemsUsed, 20], reward: 100 },
  { id: 'summit', name: '정상 정복', desc: '타워 클리어', goal: (v) => [v.clears, 1], reward: 400, title: '정상 정복자' },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
