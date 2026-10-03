// 층 테마: 2개 층씩 한 테마. 벽 질감·안개색·발판 색·장애물 구성이 바뀐다.
export const THEMES = [
  {
    id: 'dungeon', name: '지하 감옥', stages: [1, 2],
    fog: 0x9abdc0, sky: 0xdffff4, light: 0xfff3df,
    platform: { h: 0.46, s: 0.75, l: 0.48 }, accent: 0x7ff0d2, wall: 0x78959d,
    hazards: { spinner: 0, fire: 0.3 },
  },
  {
    id: 'library', name: '고서 도서관', stages: [3, 4],
    fog: 0xa4a3bf, sky: 0xf3e7ff, light: 0xffedcf,
    platform: { h: 0.76, s: 0.48, l: 0.67 }, accent: 0xffcf67, wall: 0x8983a2,
    hazards: { spinner: 0.45, fire: 0.25 },
  },
  {
    id: 'machine', name: '기계 공장', stages: [5, 6],
    fog: 0x91b3c3, sky: 0xd9f4ff, light: 0xfff0d8,
    platform: { h: 0.56, s: 0.6, l: 0.58 }, accent: 0xffce52, wall: 0x7c93a3,
    hazards: { spinner: 0.45, fire: 0.45 },
  },
  {
    id: 'obsidian', name: '흑요석 성', stages: [7, 8],
    fog: 0x927e9e, sky: 0xffd6e8, light: 0xffe6dc,
    platform: { h: 0.95, s: 0.61, l: 0.64 }, accent: 0xff95ad, wall: 0x70687e,
    hazards: { spinner: 0.5, fire: 0.5 },
  },
  {
    id: 'sky', name: '하늘 신전', stages: [9, 10],
    fog: 0xb8e2e7, sky: 0xf0fcff, light: 0xffffff,
    platform: { h: 0.13, s: 0.7, l: 0.67 }, accent: 0xffe08a, wall: 0xbdcdd3,
    hazards: { spinner: 0.55, fire: 0.55 },
  },
];

export function themeIndexForStage(s) {
  return Math.min(THEMES.length - 1, Math.max(0, Math.floor((Math.max(1, s) - 1) / 2)));
}
export const themeForStage = (s) => THEMES[themeIndexForStage(s)];
