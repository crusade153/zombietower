import * as THREE from 'three';
import { PHYS, PLAYER } from '../config/balance.js';
import { WEAPONS } from '../config/weapons.js';
import { moveAndCollide } from '../core/physics.js';
import { makeHumanoid, makeBlob, makeWeaponMesh, disposeWorld } from '../world/models.js';

export function groundYBelow(x, y, z, plats) {
  let best = null;
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i];
    if (!p.solid) continue;
    if (x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ && p.maxY <= y + 0.5) {
      if (best === null || p.maxY > best) best = p.maxY;
    }
  }
  return best;
}

const ease = (t) => 1 - (1 - t) * (1 - t);

export class Player {
  constructor(scene) {
    const h = makeHumanoid();
    this.h = h;
    this.root = h.root;
    this.parts = h.parts;
    scene.add(this.root);
    this.blob = makeBlob(0.55);
    scene.add(this.blob);

    this.body = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      hw: PHYS.playerHalf, h: PHYS.playerHeight, grounded: false, ground: null, hitWall: false,
    };
    this.maxHp = PLAYER.maxHp;
    this.hp = this.maxHp;
    this.alive = true;
    this.controllable = true;
    this.facing = 0;
    this.mv = { x: 0, z: 0 };
    this.kn = { x: 0, z: 0 };
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumping = false;
    this.cutDone = false;
    this.iframes = 0;
    this.animT = 0;
    this.faceLock = 0;
    this.wasGrounded = false;
    this.swing = null; // {t, dur, kind}
    this.weaponKind = null;
    this.weaponMesh = null;
    this.events = { jumped: false, landed: false };
    this.lastGround = null;
  }

  reset(x, y, z, facing = null) {
    const b = this.body;
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0;
    b.grounded = false; b.ground = null;
    this.mv.x = this.mv.z = 0;
    this.kn.x = this.kn.z = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.iframes = 1.2;
    this.swing = null;
    this.lastGround = null;
    this.wasGrounded = false;
    this.coyote = this.jumpBuf = this.faceLock = 0;
    this.jumping = false;
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    if (facing !== null) this.facing = facing;
  }

  setWeapon(w) {
    const key = w ? `${w.uid}:${w.kind}:${w.rarity}:${w.level}` : null;
    if (key === this.weaponKey) return;
    this.weaponKey = key;
    if (this.weaponMesh) {
      this.parts.hand.remove(this.weaponMesh);
      disposeWorld(this.weaponMesh);
    }
    this.weaponMesh = null;
    this.weaponKind = w ? w.kind : null;
    if (!w) return;
    this.weaponMesh = makeWeaponMesh(w);
    this.parts.hand.add(this.weaponMesh);
  }

  startSwing(dur, kind) { this.swing = { t: 0, dur, kind }; }

  faceDir(dx, dz, lock = 0.35) {
    this.facing = Math.atan2(dx, dz);
    this.faceLock = lock;
  }

  hurt(dmg, fromX, fromZ, knock = PLAYER.knockback) {
    if (!this.alive || this.iframes > 0) return false;
    this.hp -= dmg;
    this.iframes = PLAYER.iframes;
    const b = this.body;
    let dx = b.x - fromX; let dz = b.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    this.kn.x = dx * knock; this.kn.z = dz * knock;
    if (b.grounded) b.vy = 4.5;
    return true;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  update(dt, input, cam, plats) {
    const b = this.body;
    this.events.jumped = false;
    this.events.landed = false;
    this.iframes = Math.max(0, this.iframes - dt);

    const ctl = this.controllable && this.alive;
    const mv = ctl ? input.getMove() : { x: 0, y: 0 };
    const f = cam.forward;
    const r = cam.right;
    const wx = f.x * mv.y + r.x * mv.x;
    const wz = f.z * mv.y + r.z * mv.x;
    const tx = wx * PHYS.moveSpeed;
    const tz = wz * PHYS.moveSpeed;
    const acc = (b.grounded ? PHYS.groundAccel : PHYS.airAccel) * dt;
    const dx = tx - this.mv.x;
    const dz = tz - this.mv.z;
    const dl = Math.hypot(dx, dz);
    if (dl <= acc) { this.mv.x = tx; this.mv.z = tz; } else { this.mv.x += (dx / dl) * acc; this.mv.z += (dz / dl) * acc; }
    const kd = Math.exp(-7 * dt);
    this.kn.x *= kd; this.kn.z *= kd;
    b.vx = this.mv.x + this.kn.x;
    b.vz = this.mv.z + this.kn.z;
    // 컨베이어 위에서는 계속 떠밀린다
    if (b.ground && b.ground.belt) { b.vx += b.ground.belt.x; b.vz += b.ground.belt.z; }

    // 점프 (코요테 + 버퍼 + 가변 높이)
    if (ctl && input.consumeJump()) this.jumpBuf = PHYS.jumpBuffer;
    this.jumpBuf -= dt;
    this.coyote = b.grounded ? PHYS.coyote : this.coyote - dt;
    if (ctl && this.jumpBuf > 0 && this.coyote > 0) {
      b.vy = PHYS.jumpSpeed;
      this.jumpBuf = 0; this.coyote = 0;
      this.jumping = true; this.cutDone = false;
      this.events.jumped = true;
    }
    if (this.jumping && !input.jumpHeld && b.vy > 0 && !this.cutDone) { b.vy *= PHYS.jumpCut; this.cutDone = true; }
    if (b.vy <= 0) this.jumping = false;
    b.vy = Math.max(-PHYS.maxFall, b.vy - PHYS.gravity * dt);

    const prevVy = b.vy;
    moveAndCollide(b, dt, plats);
    if (b.grounded && !this.wasGrounded && prevVy < -8) this.events.landed = true;
    this.wasGrounded = b.grounded;
    if (b.ground) this.lastGround = b.ground;

    // 방향
    if (this.faceLock > 0) this.faceLock -= dt;
    else if (ctl && (mv.x !== 0 || mv.y !== 0)) {
      const want = Math.atan2(wx, wz);
      let diff = want - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxTurn = 16 * dt;
      this.facing += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
  }

  /** 렌더용: 위치 반영 + 애니메이션 */
  syncVisual(dt, plats, time) {
    const b = this.body;
    this.root.position.set(b.x, b.y, b.z);
    this.root.rotation.y = this.facing;
    const speed = Math.hypot(this.mv.x, this.mv.z);
    const run = Math.min(1, speed / PHYS.moveSpeed);
    const p = this.parts;
    const bob = b.grounded ? Math.sin(this.animT * 2) * 0.045 * run : 0;
    this.h.model.position.y = bob + Math.sin(time * 2.8) * 0.014 * (1 - run);
    this.h.model.rotation.z = Math.sin(this.animT) * 0.045 * run;
    const stretch = !b.grounded ? 1.04 : 1;
    this.h.model.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    if (!b.grounded) {
      p.legL.rotation.x = -0.55; p.legR.rotation.x = 0.45;
      p.armL.rotation.x = -2.6;
    } else {
      this.animT += dt * (6 + 8 * run);
      const s = Math.sin(this.animT) * 0.95 * run;
      p.legL.rotation.x = s; p.legR.rotation.x = -s;
      p.armL.rotation.x = -s * 0.9;
    }
    // 오른팔: 무기 자세 / 공격 모션
    const kind = this.weaponKind ? WEAPONS[this.weaponKind].kind : null;
    const shape = this.weaponKind ? WEAPONS[this.weaponKind].shape : null;
    let arm = kind === 'gun' ? -1.45 : (shape === 'line' ? -0.8 : -0.55);
    if (this.swing) {
      this.swing.t += dt;
      const k = Math.min(1, this.swing.t / this.swing.dur);
      if (this.swing.kind === 'gun') arm = -1.45 - 0.45 * (1 - k);
      else if (this.swing.kind === 'line') arm = -2.2 + 1.7 * ease(k);
      else arm = k < 0.35 ? -0.55 - 2.0 * (k / 0.35) : -2.55 + 2.3 * ease((k - 0.35) / 0.65);
      if (k >= 1) this.swing = null;
    } else if (b.grounded && run > 0.2) {
      arm += Math.sin(this.animT) * 0.25 * run;
    }
    p.armR.rotation.x = arm;
    const aura = this.weaponMesh?.userData.aura;
    if (aura) {
      aura.rotation.z = time * 1.2;
      aura.scale.setScalar(1 + Math.sin(time * 4) * 0.06);
      aura.material.opacity = 0.25 + Math.sin(time * 3) * 0.08;
    }
    // 피격 깜빡임
    this.root.visible = this.alive && !(this.iframes > 0 && Math.floor(time * 16) % 2 === 0);
    // 그림자 점
    const gy = groundYBelow(b.x, b.y, b.z, plats);
    if (gy === null) this.blob.visible = false;
    else {
      this.blob.visible = true;
      const h = Math.max(0, b.y - gy);
      const s = Math.max(0.35, 1 - h * 0.07);
      this.blob.position.set(b.x, gy + 0.03, b.z);
      this.blob.scale.set(s, 1, s);
      this.blob.material.opacity = Math.max(0.15, 0.5 - h * 0.03);
    }
  }
}
