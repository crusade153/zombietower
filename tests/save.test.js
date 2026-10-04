import { describe, it, expect } from 'vitest';
import { normalizeSave } from '../src/core/Save.js';

describe('아이패드 저장 이전', () => {
  it('구형 저장에는 기본 그래픽·음량을 넣고 새 설정은 안전하게 복원한다', () => {
    const raw = { v: 1, weapons: [{ uid: 1, kind: 'bat', rarity: 0, level: 0 }] };
    const old = normalizeSave(raw);
    expect([old.graphicsStyle, old.musicVolume, old.effectsVolume]).toEqual(['polished', 0.35, 0.8]);
    const restored = normalizeSave({ ...raw, graphicsStyle: 'classic', musicVolume: 0, effectsVolume: 0.65 });
    expect([restored.graphicsStyle, restored.musicVolume, restored.effectsVolume]).toEqual(['classic', 0, 0.65]);
    const invalid = normalizeSave({ ...raw, graphicsStyle: 'unknown', musicVolume: -2, effectsVolume: 'loud' });
    expect([invalid.graphicsStyle, invalid.musicVolume, invalid.effectsVolume]).toEqual(['polished', 0, 0.8]);
  });
  it('구형 전설·탄약·층 진행을 이전한다', () => {
    const s = normalizeSave({ v: 1, coins: 80, lastSafe: 4, weapons: [{ uid: 5, kind: 'rifle', rarity: 3, level: 7, ammo: 0 }] });
    expect(s.weapons[0]).toEqual({ uid: 5, kind: 'rifle', rarity: 4, level: 7 });
    expect(s.resumeSafe).toBe(4);
    expect(s.equipped).toEqual([5, null, null]);
    expect(s.nextUid).toBe(6);
  });
  it('새 등급·보스 앞 저장·기록과 인벤토리를 복원한다', () => {
    const s = normalizeSave({ v: 1, rarityVersion: 2, coins: 900, lastSafe: 9, resumeSafe: 3, bossSanctuaryUnlocked: true, resumeAtBoss: true, nextUid: 12, weapons: [{ uid: 7, kind: 'axe', rarity: 6, level: 10 }], equipped: [7, 7, 999], openedChests: [1, 1, 5, 99] });
    expect(s.resumeSafe).toBe(3);
    expect(s.lastSafe).toBe(9);
    expect(s.resumeAtBoss).toBe(true);
    expect(s.equipped).toEqual([7, null, null]);
    expect(s.nextUid).toBe(12);
    expect(s.weapons[0].rarity).toBe(6);
    expect(s.openedChests).toEqual([1, 5]);
  });
  it('다른 파일이나 유효한 무기가 없는 저장은 거부한다', () => {
    expect(() => normalizeSave({ hello: 'world' })).toThrow();
    expect(() => normalizeSave({ v: 1, weapons: [{ kind: 'unknown', uid: 1 }] })).toThrow();
  });
});
