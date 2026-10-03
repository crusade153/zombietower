// 층 테마: 2개 층씩 한 테마. 벽 질감·안개색·발판 색·장애물 구성이 바뀐다.
export const THEMES = [
  {
    id: 'dungeon', name: '지하 감옥', stages: [1, 2],
    fog: 0x2a0f0a, sky: 0xffe2c0, light: 0xfff0dd,
    platform: { h: 0.30, s: 0.28, l: 0.52 }, accent: 0xff8a2a, wall: 0x5a4a40,
    hazards: { spinner: 0, fire: 0.3 },
  },
  {
    id: 'library', name: '고서 도서관', stages: [3, 4],
    fog: 0x1a1230, sky: 0xd8d0ff, light: 0xe8e0ff,
    platform: { h: 0.08, s: 0.45, l: 0.45 }, accent: 0xffd070, wall: 0x4a3626,
    hazards: { spinner: 0.45, fire: 0.25 },
  },
  {
    id: 'machine', name: '기계 공장', stages: [5, 6],
    fog: 0x2a1a0c, sky: 0xffe0b0, light: 0xfff0d8,
    platform: { h: 0.58, s: 0.22, l: 0.5 }, accent: 0xffa030, wall: 0x4a4e58,
    hazards: { spinner: 0.45, fire: 0.45 },
  },
  {
    id: 'obsidian', name: '흑요석 성', stages: [7, 8],
    fog: 0x280612, sky: 0xffb0b0, light: 0xffd8d8,
    platform: { h: 0.95, s: 0.45, l: 0.36 }, accent: 0xff4a3a, wall: 0x2a2030,
    hazards: { spinner: 0.5, fire: 0.5 },
  },
  {
    id: 'sky', name: '하늘 신전', stages: [9, 10],
    fog: 0x6a4a66, sky: 0xfff0e0, light: 0xffffff,
    platform: { h: 0.12, s: 0.5, l: 0.68 }, accent: 0xffe08a, wall: 0xd8d0c8,
    hazards: { spinner: 0.55, fire: 0.55 },
  },
];

export function themeIndexForStage(s) {
  return Math.min(THEMES.length - 1, Math.max(0, Math.floor((Math.max(1, s) - 1) / 2)));
}
export const themeForStage = (s) => THEMES[themeIndexForStage(s)];
