import { describe, it, expect } from 'vitest';
import { normalizeSave } from '../src/core/Save.js';
import { unlockNew, achievementProgress, ownedTitles, recordView } from '../src/core/Achievements.js';
import { ACHIEVEMENTS } from '../src/config/achievements.js';
import { COSMETICS, COSMETIC_KINDS, cosmetic } from '../src/config/cosmetics.js';
import { Game } from '../src/core/Game.js';

const W = [{ uid: 1, kind: 'bat', rarity: 0, level: 0 }];
const fresh = () => normalizeSave({ v: 1, econVersion: 2, weapons: W });

describe('업적·칭호', () => {
  it('기록이 목표에 닿으면 한 번만 달성되고, 칭호가 생긴다', () => {
    const s = fresh();
    expect(unlockNew(s)).toEqual([]);
    s.record.kills = 300;
    const got = unlockNew(s).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['firstBlood', 'hunter']));
    expect(unlockNew(s)).toEqual([]);
    expect(ownedTitles(s)).toContain('사냥꾼');
  });

  it('별·최고 강화처럼 저장에서 계산되는 값으로도 판정한다', () => {
    const s = fresh();
    s.stars = Array(11).fill(7); s.stars[0] = 0; // 1~10층 모두 별 3개
    s.weapons[0].level = 15;
    const v = recordView(s);
    expect(v.stars).toBe(30);
    expect(v.maxWeaponLevel).toBe(15);
    const ids = unlockNew(s).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['stars15', 'stars30', 'smith']));
    const p = achievementProgress(ACHIEVEMENTS.find((a) => a.id === 'hunter'), s);
    expect(p).toEqual({ cur: 0, goal: 300, done: false });
  });

  it('저장 파일: 기록·업적·칭호를 정리해 복원하고, 얻지 않은 칭호는 버린다', () => {
    const s = normalizeSave({
      v: 1, econVersion: 2, weapons: W,
      record: { kills: 42.7, bestCombo: -3, bossTypes: ['boss', 'boss', 'walker'] },
      achievements: ['hunter', 'nope', 'hunter'], title: '사냥꾼',
    });
    expect(s.record.kills).toBe(42);
    expect(s.record.bestCombo).toBe(0);
    expect(s.record.bossTypes).toEqual(['boss']);
    expect(s.achievements).toEqual(['hunter']);
    expect(s.title).toBe('사냥꾼');
    expect(normalizeSave({ v: 1, weapons: W, title: '정복자' }).title).toBe('');
  });

  it('업적 보상은 달성 순간 코인으로 지급된다', () => {
    const s = fresh();
    s.record.kills = 1;
    const shown = [];
    const g = { save: s, hud: { showAchievement: (a) => shown.push(a.id), setCoins() {} }, audio: { play() {} }, markDirty() {} };
    Game.prototype.checkAchievements.call(g);
    expect(shown).toEqual(['firstBlood']);
    expect(s.coins).toBe(ACHIEVEMENTS.find((a) => a.id === 'firstBlood').reward);
  });
});

describe('꾸미기', () => {
  it('종류마다 첫 항목은 무료 기본값이고, 나머지는 살 만한 가격', () => {
    for (const k of COSMETIC_KINDS) {
      expect(COSMETICS[k].list[0].cost).toBe(0);
      for (const c of COSMETICS[k].list.slice(1)) { expect(c.cost).toBeGreaterThan(0); expect(c.cost).toBeLessThanOrEqual(400); }
    }
    expect(cosmetic('hat', 'crown').name).toBe('왕관');
  });

  it('처음엔 사고, 이미 가진 것은 공짜로 장착한다', () => {
    const s = fresh();
    s.coins = 500;
    const looks = [];
    const g = { save: s, player: { setLook: (l) => looks.push({ ...l }), setGhost() {} }, invisibleT: 0, hud: { setCoins() {} }, audio: { play() {} }, markDirty() {} };
    const buy = (k, id) => Game.prototype.buyOrEquipCosmetic.call(g, k, id);
    expect(buy('hat', 'crown')).toBe(true);
    expect(s.coins).toBe(200);
    expect(s.cosmetics.hat).toBe('crown');
    expect(buy('hat', 'halo')).toBe(false); // 350 > 200
    expect(buy('hat', 'none')).toBe(true);
    expect(buy('hat', 'crown')).toBe(true); // 이미 보유 → 무료
    expect(s.coins).toBe(200);
    expect(looks.at(-1).hat).toBe('crown');
  });

  it('저장 파일: 가진 것만 장착 상태로 복원', () => {
    const s = normalizeSave({ v: 1, weapons: W, cosmetics: { owned: ['hat:crown', 'hat:fake'], hat: 'crown', color: 'gold', trail: 'rainbow' } });
    expect(s.cosmetics.hat).toBe('crown');
    expect(s.cosmetics.color).toBe('red');
    expect(s.cosmetics.trail).toBe('none');
    expect(s.cosmetics.owned).not.toContain('hat:fake');
  });
});
