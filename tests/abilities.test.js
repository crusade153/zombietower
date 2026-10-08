import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player.js';
import { PHYS, ABILITIES } from '../src/config/balance.js';
import { setBounds } from '../src/core/physics.js';
import { normalizeSave } from '../src/core/Save.js';

function floor() {
  const p = { x: 0, y: -0.3, z: 0, hx: 50, hy: 0.3, hz: 50, solid: true, moved: false, dx: 0, dy: 0, dz: 0 };
  setBounds(p);
  return p;
}

/** 버튼을 누른 순간만 true가 되는 가짜 입력 */
function fakeInput() {
  return {
    jumpHeld: false, jumpPressed: false, dashPressed: false, move: { x: 0, y: 0 },
    getMove() { return this.move; },
    consumeJump() { const v = this.jumpPressed; this.jumpPressed = false; return v; },
    consumeDash() { const v = this.dashPressed; this.dashPressed = false; return v; },
  };
}
const cam = { forward: { x: 0, z: 1 }, right: { x: 1, z: 0 } };

function setup(abilities) {
  const P = new Player({ add() {} });
  P.reset(0, 0, 0, 0);
  P.abilities = abilities;
  const input = fakeInput();
  const plats = [floor()];
  const run = (sec) => { let top = -Infinity; for (let t = 0; t < sec; t += PHYS.fixedDt) { P.update(PHYS.fixedDt, input, cam, plats); top = Math.max(top, P.body.y); } return top; };
  run(0.2); // 착지
  return { P, input, run };
}

describe('이동 능력', () => {
  it('2단 점프는 해금해야 되고, 공중에서 한 번만, 기본 점프보다 높이 오른다', () => {
    const plain = setup({});
    plain.input.jumpPressed = true; plain.input.jumpHeld = true;
    plain.run(0.3);
    plain.input.jumpPressed = true; // 공중에서 다시 눌러도
    const plainTop = plain.run(1.2);
    expect(plainTop).toBeCloseTo(PHYS.jumpSpeed ** 2 / (2 * PHYS.gravity), 0);

    const dj = setup({ doubleJump: true });
    dj.input.jumpPressed = true; dj.input.jumpHeld = true;
    dj.run(0.3);
    dj.input.jumpPressed = true;
    let doubled = false;
    const t0 = dj.P.body.y;
    for (let i = 0; i < 3; i++) { dj.P.update(PHYS.fixedDt, dj.input, cam, [floor()]); doubled ||= dj.P.events.doubleJumped; }
    expect(doubled).toBe(true);
    dj.input.jumpPressed = true; // 세 번째는 안 됨
    const top = dj.run(1.5);
    expect(top).toBeGreaterThan(plainTop + 1);
    expect(top - t0).toBeLessThan((PHYS.jumpSpeed * ABILITIES.doubleJump.jumpMult) ** 2 / (2 * PHYS.gravity) + 0.3);
    expect(dj.P.airJumped).toBe(false); // 착지하면 다시 충전
  });

  it('대시는 해금해야 되고, 공중에서는 한 번만, 돌진 거리가 걷기보다 길다', () => {
    const plain = setup({});
    plain.input.dashPressed = true;
    plain.run(0.2);
    expect(Math.abs(plain.P.body.z)).toBeLessThan(0.01);

    const d = setup({ dash: true });
    d.input.dashPressed = true;
    d.run(ABILITIES.dash.time);
    const dist = d.P.body.z;
    expect(dist).toBeGreaterThan(ABILITIES.dash.speed * ABILITIES.dash.time * 0.9);
    expect(dist).toBeGreaterThan(PHYS.moveSpeed * ABILITIES.dash.time * 2);

    // 공중: 첫 대시는 되고, 재사용 대기 후에도 착지 전에는 다시 안 된다
    d.run(1);
    d.input.jumpPressed = true; d.input.jumpHeld = true;
    d.run(0.1);
    d.input.dashPressed = true;
    d.run(ABILITIES.dash.time + 0.02);
    expect(d.P.dashUsed).toBe(true);
    expect(d.P.body.grounded).toBe(false);
    const z1 = d.P.body.z;
    d.P.dashCd = 0;
    d.input.dashPressed = true;
    d.run(0.05);
    expect(d.P.dashT).toBeLessThanOrEqual(0);
    expect(d.P.body.z - z1).toBeLessThan(ABILITIES.dash.speed * 0.05 * 0.6);
  });

  it('저장 파일의 능력 해금을 복원하고 이상한 값은 버린다', () => {
    const w = [{ uid: 1, kind: 'bat', rarity: 0, level: 0 }];
    expect(normalizeSave({ v: 1, weapons: w }).abilities).toEqual({ doubleJump: false, dash: false });
    expect(normalizeSave({ v: 1, weapons: w, abilities: { doubleJump: true, dash: 'yes', fly: true } }).abilities).toEqual({ doubleJump: true, dash: false });
  });
});
