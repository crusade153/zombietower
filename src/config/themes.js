// 층 테마: 2개 층씩 한 테마. 벽 질감·안개색·발판 색·장애물 구성이 바뀐다.
export const THEMES = [
  {
    id: 'frost', name: '서리 관문', stages: [1, 2],
    fog: 0x829eb6, sky: 0xd9f2ff, light: 0xe8f6ff,
    platform: { h: 0.53, s: 0.42, l: 0.68 }, accent: 0x91eeff, wall: 0x88adca,
    hazards: { spinner: 0, fire: 0.3 },
  },
  {
    id: 'glacier', name: '빙하 회랑', stages: [3, 4],
    fog: 0x748da9, sky: 0xd5ecff, light: 0xcfe9ff,
    platform: { h: 0.57, s: 0.4, l: 0.63 }, accent: 0xb2ceff, wall: 0x729bc1,
    hazards: { spinner: 0.45, fire: 0.25 },
  },
  {
    id: 'crystal', name: '얼음 수정궁', stages: [5, 6],
    fog: 0x7a87ad, sky: 0xe2e7ff, light: 0xe9e2ff,
    platform: { h: 0.62, s: 0.35, l: 0.67 }, accent: 0xd4baff, wall: 0x8f9ec7,
    hazards: { spinner: 0.45, fire: 0.45 },
  },
  {
    id: 'blizzard', name: '영원의 설원', stages: [7, 8],
    fog: 0x677c9a, sky: 0xcfe6ff, light: 0xd4e6ff,
    platform: { h: 0.55, s: 0.34, l: 0.7 }, accent: 0x92fff1, wall: 0x7099b4,
    hazards: { spinner: 0.5, fire: 0.5 },
  },
  {
    id: 'summit', name: '천상의 빙왕좌', stages: [9, 10],
    fog: 0x94bdd7, sky: 0xeff9ff, light: 0xffffff,
    platform: { h: 0.53, s: 0.4, l: 0.77 }, accent: 0xdaf8ff, wall: 0xaecbdf,
    hazards: { spinner: 0.55, fire: 0.55 },
  },
];

export function themeIndexForStage(s) {
  return Math.min(THEMES.length - 1, Math.max(0, Math.floor((Math.max(1, s) - 1) / 2)));
}
export const themeForStage = (s) => THEMES[themeIndexForStage(s)];
