// 꾸미기: 능력에 영향 없음. 상점에서 사서 장착(영구 보유). 첫 항목은 기본(무료)
export const COSMETICS = {
  hat: {
    label: '모자',
    list: [
      { id: 'none', name: '없음', cost: 0 },
      { id: 'bunny', name: '토끼 귀', cost: 150 },
      { id: 'wizard', name: '마법사 모자', cost: 200 },
      { id: 'horns', name: '악마 뿔', cost: 250 },
      { id: 'crown', name: '왕관', cost: 300 },
      { id: 'halo', name: '천사 고리', cost: 350 },
    ],
  },
  color: {
    label: '옷 색',
    list: [
      { id: 'red', name: '빨강', cost: 0, hex: 0xff635e },
      { id: 'blue', name: '파랑', cost: 80, hex: 0x4f8dff },
      { id: 'green', name: '초록', cost: 80, hex: 0x3fbf7a },
      { id: 'purple', name: '보라', cost: 120, hex: 0x9b6bff },
      { id: 'black', name: '검정', cost: 150, hex: 0x2e3440 },
      { id: 'gold', name: '금색', cost: 250, hex: 0xffc93a },
    ],
  },
  trail: {
    label: '점프 효과',
    list: [
      { id: 'none', name: '기본', cost: 0, hex: 0xc1ffe9 },
      { id: 'fire', name: '불꽃', cost: 150, hex: 0xff7a1a },
      { id: 'star', name: '별빛', cost: 150, hex: 0xffe14a },
      { id: 'heart', name: '하트', cost: 150, hex: 0xff7fb0 },
      { id: 'rainbow', name: '무지개', cost: 300, hex: null },
    ],
  },
};
export const COSMETIC_KINDS = Object.keys(COSMETICS);
export const cosmetic = (kind, id) => COSMETICS[kind]?.list.find((c) => c.id === id) || null;
export const defaultCosmetics = () => ({
  owned: COSMETIC_KINDS.map((k) => `${k}:${COSMETICS[k].list[0].id}`),
  hat: 'none', color: 'red', trail: 'none',
});
