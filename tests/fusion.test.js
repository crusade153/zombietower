import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fuseWeapons, normalizeSave } from '../src/core/Save.js';
import { weaponDps, fusionPreview, weaponAppearance, chestOdds, rollRarity } from '../src/combat/Weapons.js';
import { RARITY, DROP_WEAPON_KINDS, FUSION_KINDS, WEAPONS } from '../src/config/weapons.js';
import { makeWeaponMesh, disposeWorld } from '../src/world/models.js';
import { startSpecial, updateSpecial } from '../src/combat/Specials.js';
import { Player } from '../src/entities/Player.js';

const save = () => normalizeSave({ v: 1, rarityVersion: 3, econVersion: 2, coins: 700, nextUid: 5,
  weapons: [ { uid: 1, kind: 'bat', rarity: 1, level: 2 }, { uid: 2, kind: 'axe', rarity: 4, level: 11 },
    { uid: 3, kind: 'rifle', rarity: 3, level: 6 }, { uid: 4, kind: 'shotgun', rarity: 2, level: 0 } ], equipped: [1, 2, 4] });

describe('3개 무기 합성', () => {
  it('서로 다른 종류 3개를 소모하고 최고 강화와 최고 등급 +1을 계승한다', () => {
    const s = save();
    const w = fuseWeapons(s, [1, 2, 3]);
    expect(w).toEqual({ uid: 5, kind: 'thunderHammer', rarity: 5, level: 11 });
    expect(s.weapons.map(w => w.uid)).toEqual([4, 5]);
    expect(s.equipped).toEqual([5, null, 4]);
    expect(s.coins).toBe(700);
    expect(normalizeSave(JSON.parse(JSON.stringify(s)))).toMatchObject({ weapons: s.weapons, equipped: s.equipped });
  });
  it('잘못된 수량·중복·없는 UID로 재료나 장착 상태를 손상시키지 않는다', () => {
    for (const ids of [[1, 2], [1, 1, 2], [1, 2, 99], [1, 2, 3, 4]]) {
      const s = save(), before = structuredClone(s);
      expect(fuseWeapons(s, ids)).toBeNull(); expect(s).toEqual(before);
    }
  });
  it('보관함이 가득 차거나 무기가 정확히 3개일 때도 합성 후 장착을 유지한다', () => {
    const s = save(); s.weapons.pop(); s.equipped = [1, 2, 3];
    const w = fuseWeapons(s, [3, 1, 2]);
    expect(s.weapons).toEqual([w]); expect(s.equipped).toEqual([w.uid, null, null]);
    const full = save();
    for (let uid = 5; uid <= 12; uid++) full.weapons.push({ uid, kind: 'bat', rarity: 1, level: 0 });
    full.nextUid = 13; expect(fuseWeapons(full, [1, 2, 3]).uid).toBe(13); expect(full.weapons).toHaveLength(10);
  });
  it('6종 전용 무기는 기본형보다 강하고 재합성 시 사기급 상한을 지킨다', () => {
    for (const kind of DROP_WEAPON_KINDS) {
      const core = { uid: 1, kind, rarity: 7, level: 27 };
      const w = fusionPreview([core, { ...core, uid: 2 }, { ...core, uid: 3 }]);
      expect(FUSION_KINDS).toContain(w.kind); expect(w.rarity).toBe(7); expect(w.level).toBe(27);
      expect(weaponDps(w)).toBeGreaterThan(weaponDps(core) * 1.7);
      expect(fusionPreview([{ ...w, uid: 1 }, { ...core, uid: 2 }, { ...core, uid: 3 }]).kind).toBe(w.kind);
    }
  });
  it('합성 무기의 필살기가 기본 무기의 동작 경로와 향상된 피해를 사용한다', () => {
    for (const kind of FUSION_KINDS) {
      const hits = [], shots = [];
      const zombie = { body: { x: 0, y: 0, z: 1, vy: 0, hw: 0.4, h: 1.8 },
        def: { radius: 0.4, height: 1.8, knockResist: 0 }, kn: { x: 0, z: 0 }, slowT: 0 };
      const g = { player: { body: { x: 0, y: 0, z: 0 }, facing: 0, alive: true,
        startSwing() {}, faceDir() {} }, zombies: [zombie], audio: { play() {} }, hud: { floater() {} },
        cam: { shake: 0 }, fx: { ring() {}, slash() {}, line() {} }, addHitstop() {}, near: () => [],
        findTarget: () => zombie, hitZombie: (...args) => hits.push(args), fireGun: (...args) => shots.push(args) };
      const w = { kind, rarity: 5, level: 6 };
      startSpecial(g, w);
      if (g.special) updateSpecial(g, 0.1);
      expect(hits.length + shots.length).toBeGreaterThan(0);
      if (hits.length) expect(hits[0][1]).toBeGreaterThan(WEAPONS[WEAPONS[kind].baseKind].dmg);
      if (shots.length) expect(shots[0][1].dmg).toBe(WEAPONS[kind].dmg);
    }
  });
});

describe('발견 확률·저장 이전·강화 외형', () => {
  it('정확한 8등급 순서, 수치 비율 및 사기급 0.2%를 유지한다', () => {
    expect(RARITY.map(r => r.name)).toEqual(['쓰레기', '일반', '드문', '레어', '에픽', '전설', '신화', '사기급']);
    const o = chestOdds(1); expect(o[0] / o[1]).toBeCloseTo(50 / 42, 10);
    expect(chestOdds(5, true)[7]).toBe(0.2);
    expect(chestOdds(5, true).slice(0, 6)).toEqual(Array(6).fill(0));
    // Deterministic quantiles check the tiny top tier, avoiding a loose Monte Carlo tolerance.
    let top = 0;
    for (let i = 0; i < 100000; i++) if (rollRarity(1, () => (i + 0.5) / 100000) === 7) top++;
    expect(top).toBe(200);
  });
  it('기존 7등급의 뜻과 강화 수치를 이전하며 새 저장을 두 번 바꾸지 않는다', () => {
    const old = { v: 1, rarityVersion: 2, weapons: Array.from({ length: 7 }, (_, i) => ({ uid: i + 1, kind: 'bat', rarity: i, level: 27 })) };
    const s = normalizeSave(old); expect(s.weapons.map(w => w.rarity)).toEqual([1, 3, 4, 6, 5, 6, 7]);
    expect(normalizeSave(s).weapons).toEqual(s.weapons);
  });
  it('0 / 1~5 / 6~10 / 11 이상에서 외형이 바뀌고 모든 기본·합성 모델이 존재한다', () => {
    const w = { kind: 'bat', rarity: 1, level: 0 };
    for (const [level, tier] of [[0, 0], [1, 1], [5, 1], [6, 2], [10, 2], [11, 3], [999, 3]]) {
      expect(weaponAppearance({ ...w, level }).tier).toBe(tier);
    }
    for (const kind of [...DROP_WEAPON_KINDS, ...FUSION_KINDS]) for (const level of [0, 1, 6, 11]) {
      const model = makeWeaponMesh({ ...w, kind, level });
      const box = new THREE.Box3().setFromObject(model);
      expect(box.isEmpty()).toBe(false);
      expect(model.children.length).toBeLessThan(12);
      expect(!!model.userData.aura).toBe(level >= 11 || WEAPONS[kind].fusion === true);
      if (WEAPONS[kind].kind === 'gun') expect(model.userData.muzzle).toBeInstanceOf(THREE.Vector3);
      disposeWorld(model);
    }
  });
  it('타격 준비·몸통 회전·총기 반동 뒤에 중립 자세로 복귀한다', () => {
    const scene = new THREE.Scene(), p = new Player(scene);
    p.body.grounded = true; p.setWeapon({ uid: 1, kind: 'thunderHammer', rarity: 5, level: 11 });
    p.startSwing(0.42, 'melee', 0.12); p.syncVisual(0.06, [], 0);
    expect(p.h.model.rotation.y).toBeLessThan(0);
    expect(p.parts.elbowR.rotation.x).toBeLessThan(-0.18);
    p.syncVisual(0.15, [], 0.2); expect(p.h.model.rotation.y).toBeGreaterThan(0);
    p.syncVisual(0.3, [], 0.5); p.syncVisual(0, [], 0.5);
    expect(p.h.model.rotation.y).toBe(0);
    p.setWeapon({ uid: 2, kind: 'dragonShotgun', rarity: 5, level: 6 });
    p.startSwing(0.18, 'gun'); p.syncVisual(0.02, [], 0.6);
    expect(p.h.model.position.z).toBeLessThan(0); expect(p.parts.armL.rotation.x).toBeLessThan(-1);
    disposeWorld(scene);
  });
});
