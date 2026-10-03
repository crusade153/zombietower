import * as THREE from 'three';
import { PHYS } from '../config/balance.js';
import { ZOMBIES, hpScale, dmgScale, coinScale } from '../config/zombies.js';
import { moveAndCollide, groundBelow } from '../core/physics.js';
import { makeHumanoid, makeBlob } from '../world/models.js';

const barGeo = new THREE.PlaneGeometry(1, 0.14);
const barBg = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 0.7 });
const barFg = new THREE.MeshBasicMaterial({ color: 0xff4040, depthTest: false });

export class Zombie {
  constructor(game, type, stage, sp, opts = {}) {
    const d = ZOMBIES[type];
    this.def = d;
    this.type = type;
    this.stage = stage;
    this.climber = !!opts.climber;
    this.maxHp = d.hp * hpScale(stage) * game.difficulty.hp;
    this.hp = this.maxHp;
    this.dmg = d.dmg * dmgScale(stage);
    this.coin = d.coin * coinScale(stage) * (this.climber ? 0.6 : 1);
    this.body = {
      x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0,
      hw: d.radius, h: d.height, grounded: false, ground: null, hitWall: false,
    };
    this.home = sp.platform || null;
    this.facing = Math.random() * Math.PI * 2;
    this.kn = { x: 0, z: 0 };
    this.mv = { x: 0, z: 0 };
    this.air = null; // 점프 중 수평 속도
    this.alerted = !!opts.climber;
    this.state = 'idle'; // idle | chase | windup | cooldown
    this.timer = 0;
    this.attackKind = 'melee';
    this.flashT = 0;
    this.burnT = 0; this.burnDps = 0;
    this.slowT = 0;
    this.dead = false; this.dying = 0; this.removed = false;
    this.animT = Math.random() * 6;
    this.jumpCd = 0;
    this.growlT = 2 + Math.random() * 5;
    this.phase = 1;

    const h = makeHumanoid({
      skin: d.colors.skin, shirt: d.colors.shirt, pants: d.colors.pants, scale: d.scale, zombie: true, ownMaterials: true, variant: type,
    });
    this.h = h;
    this.root = h.root;
    this.parts = h.parts;
    this.parts.armL.rotation.x = -1.4;
    this.parts.armR.rotation.x = -1.4;
    game.scene.add(this.root);
    this.blob = makeBlob(d.radius * 1.3);
    game.scene.add(this.blob);

    // 체력바
    this.bar = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, barBg);
    bg.renderOrder = 10;
    this.fill = new THREE.Mesh(barGeo, barFg);
    this.fill.renderOrder = 11;
    this.fill.position.z = 0.001;
    this.bar.add(bg, this.fill);
    this.bar.scale.set(d.boss ? 2.4 : 1.1, 1, 1);
    this.bar.visible = false;
    game.scene.add(this.bar);
    this.syncVisual(0, game);
  }

  /** @returns 사망 여부 */
  takeDamage(g, dmg, o = {}) {
    if (this.dead) return false;
    if (this.def.finalBoss && !g.finalBattle) return false;
    this.hp -= dmg;
    this.flashT = 0.12;
    this.alerted = true;
    if (o.knock) {
      const k = o.knock * (1 - this.def.knockResist);
      this.kn.x += (o.kx || 0) * k;
      this.kn.z += (o.kz || 0) * k;
      if (k > 1) this.body.vy = Math.max(this.body.vy, 3.5 * (1 - this.def.knockResist));
    }
    if (o.slow) this.slowT = Math.max(this.slowT, o.slow * 4);
    if (o.burn) { this.burnT = 3; this.burnDps = o.burn; }
    if (this.hp <= 0) { this.die(g, o); return true; }
    if (this.state === 'windup') { this.state = 'cooldown'; this.timer = 0.5; } // 맞으면 공격 끊김(보스 제외)
    if (this.def.boss && this.state === 'cooldown') this.state = 'chase';
    return false;
  }

  die(g, o = {}) {
    if (this.dead) return;
    this.dead = true;
    this.dying = 0;
    this.bar.visible = false;
    g.audio.play('zdie');
    if (!o.silent) g.onZombieKilled(this, o);
  }

  resetForBattle() {
    const p = this.home;
    if (!p || this.dead) return;
    this.hp = this.maxHp;
    this.phase = 1;
    this.body.x = p.x; this.body.y = p.maxY; this.body.z = p.z;
    this.body.vx = this.body.vy = this.body.vz = 0;
    this.body.ground = null; this.body.grounded = false;
    this.kn.x = this.kn.z = this.mv.x = this.mv.z = 0;
    this.alerted = false;
    this.state = 'idle'; this.timer = 0;
    this.burnT = this.slowT = 0;
  }

  update(dt, g) {
    const b = this.body;
    const P = g.player;
    const pb = P.body;

    if (this.dead) {
      this.dying += dt;
      this.root.rotation.x = -Math.min(1.5, this.dying * 4);
      if (this.dying > 1.2) this.removed = true;
      return;
    }
    if (this.def.finalBoss && !g.finalBattle) return;
    if (this.def.finalBoss && this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      g.hud.toast('🔥 이그니스 폭주! 화염탄과 충격파를 피하세요!', 2400);
      g.fx.ring(b.x, b.y + 0.05, b.z, 6, 0xff4d38, 0.9, true);
      g.cam.shake = 0.8;
    }

    // 상태이상
    this.flashT = Math.max(0, this.flashT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.hp -= this.burnDps * dt;
      if (Math.random() < dt * 8) g.fx.burst(b.x, b.y + this.def.height, b.z, 0xff8a1a, 1, 1.5, 0.4, 0.1);
      if (this.hp <= 0) { this.die(g, { burn: true }); return; }
    }
    this.jumpCd = Math.max(0, this.jumpCd - dt);

    // 용암에서 태어난 몬스터는 불에 면역. 낙하로 이탈하면 정리한다.
    if (!this.def.finalBoss && !g.lava.frozen && b.y < g.lava.y - 8) {
      this.die(g, { silent: true });
      g.fx.burst(b.x, g.lava.y + 0.3, b.z, 0xff7a1a, 10, 5, 0.6);
      return;
    }
    if (b.y < -80) { this.die(g, { silent: true }); return; }

    const dx = pb.x - b.x;
    const dz = pb.z - b.z;
    const dist = Math.hypot(dx, dz);
    const dy = pb.y - b.y;
    const playerOk = P.alive && !g.playerSafe;

    if (!this.alerted && playerOk && dist < 14 && Math.abs(dy) < 6) {
      this.alerted = true;
      g.audio.play('zgrowl');
    }
    if (this.alerted && (!playerOk || (!this.climber && dist > 28))) this.alerted = this.climber && playerOk;

    const speed = this.def.speed * (this.phase === 2 ? 1.25 : 1) * (this.slowT > 0 ? 0.55 : 1) * g.difficulty.zspeed;
    let wantX = 0; let wantZ = 0;

    if (this.state === 'windup') {
      this.timer -= dt;
      this.facing = Math.atan2(dx, dz);
      if (this.timer <= 0) this.resolveAttack(g, dx, dz, dist, dy);
    } else if (this.state === 'cooldown') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = this.alerted ? 'chase' : 'idle';
    } else if (this.alerted && playerOk) {
      this.state = 'chase';
      const reach = this.def.finalBoss ? 13 : this.def.ranged ? Math.min(this.def.attackRange, 11) : this.def.attackRange;
      const canAttack = dist <= reach && Math.abs(dy) < (this.def.ranged ? 4 : 1.7);
      if (canAttack && b.grounded) {
        this.state = 'windup';
        this.attackKind = 'melee';
        this.timer = this.def.windup;
        if (this.def.boss) {
          if (dist > this.def.attackRange - 0.4 && dist <= 9) this.attackKind = 'slam';
          else if (Math.random() < 0.4) this.attackKind = 'slam';
          if (this.attackKind === 'slam') {
            this.timer = 1.0;
            g.fx.ring(b.x, b.y, b.z, 5.8, 0xff3a2a, 1.0, true);
            g.audio.play('warn');
          }
        }
        if (this.def.finalBoss) {
          this.attackKind = dist > 5.8 ? 'volley' : 'slam';
          this.timer = this.def.windup / (this.phase === 2 ? 1.15 : 1);
          g.fx.ring(b.x, b.y + 0.03, b.z, this.attackKind === 'slam' ? 5.8 : 2, 0xff593d, this.timer, true);
        }
      } else if (!this.climber || this.sameBand(P)) {
        const l = dist || 1;
        wantX = (dx / l) * speed;
        wantZ = (dz / l) * speed;
        this.facing = Math.atan2(dx, dz);
      }
    } else {
      this.state = 'idle';
    }

    // 클라이머: 발판 따라 올라가기 (점프)
    if (this.climber && this.alerted && playerOk && this.state === 'chase' && b.grounded && !this.sameBand(P)) {
      const r = this.climbMove(g, b, speed);
      wantX = r.x; wantZ = r.z;
    }

    // 낭떠러지 앞에서는 멈춤 (스스로 떨어지지 않음). 점프 중에는 제외
    if ((wantX || wantZ) && b.grounded) {
      const l = Math.hypot(wantX, wantZ);
      const ax = b.x + (wantX / l) * (b.hw + 0.5);
      const az = b.z + (wantZ / l) * (b.hw + 0.5);
      if (!groundBelow(ax, b.y, az, g.near(b.y), 1.6, 0.15)) { wantX = 0; wantZ = 0; }
    }

    if (b.grounded) {
      const acc = 40 * dt;
      const ddx = wantX - this.mv.x;
      const ddz = wantZ - this.mv.z;
      const dl = Math.hypot(ddx, ddz);
      if (dl <= acc) { this.mv.x = wantX; this.mv.z = wantZ; } else { this.mv.x += (ddx / dl) * acc; this.mv.z += (ddz / dl) * acc; }
      this.air = null;
    }
    const kd = Math.exp(-6 * dt);
    this.kn.x *= kd; this.kn.z *= kd;
    if (this.air) { b.vx = this.air.vx + this.kn.x; b.vz = this.air.vz + this.kn.z; }
    else { b.vx = this.mv.x + this.kn.x; b.vz = this.mv.z + this.kn.z; }
    b.vy = Math.max(-PHYS.maxFall, b.vy - PHYS.gravity * dt);
    moveAndCollide(b, dt, g.near(b.y));

    this.growlT -= dt;
    if (this.growlT <= 0 && this.alerted && dist < 18) { g.audio.play('zgrowl'); this.growlT = 4 + Math.random() * 5; }
  }

  sameBand(P) {
    const a = this.body.ground;
    const c = P.lastGround;
    if (!a || !c || a.chainIndex === undefined || c.chainIndex === undefined) return true;
    return a.chainIndex >= c.chainIndex || a === c;
  }

  /** 다음 발판으로 가는 이동. 가장자리에 서면 점프 */
  climbMove(g, b, speed) {
    const cur = b.ground;
    const chain = g.tower.chain;
    if (!cur || cur.chainIndex === undefined) return { x: 0, z: 0 };
    const next = chain[cur.chainIndex + 1];
    if (!next || next.type === 'safe') return { x: 0, z: 0 };
    // 출발 지점: 현재 발판 위에서 next 중심에 가장 가까운 점
    const px = Math.max(cur.minX + 0.5, Math.min(cur.maxX - 0.5, next.x));
    const pz = Math.max(cur.minZ + 0.5, Math.min(cur.maxZ - 0.5, next.z));
    const dx = px - b.x;
    const dz = pz - b.z;
    const d = Math.hypot(dx, dz);
    this.facing = Math.atan2(next.x - b.x, next.z - b.z);
    if (d < 0.55 && this.jumpCd <= 0) {
      const tx = Math.max(next.minX + 0.5, Math.min(next.maxX - 0.5, b.x));
      const tz = Math.max(next.minZ + 0.5, Math.min(next.maxZ - 0.5, b.z));
      const ddx = tx - b.x;
      const ddz = tz - b.z;
      const dd = Math.hypot(ddx, ddz);
      const t = Math.max(0.35, Math.min(0.95, dd / 7));
      b.vy = Math.min(13, (next.maxY - b.y) / t + 0.5 * PHYS.gravity * t);
      this.air = { vx: ddx / t, vz: ddz / t };
      b.grounded = false;
      this.jumpCd = 0.8;
      return { x: 0, z: 0 };
    }
    if (d < 0.01) return { x: 0, z: 0 };
    return { x: (dx / d) * speed, z: (dz / d) * speed };
  }

  resolveAttack(g, dx, dz, dist, dy) {
    const b = this.body;
    const P = g.player;
    const d = this.def;
    this.state = 'cooldown';
    this.timer = d.cooldown / (this.phase === 2 ? 1.35 : 1);
    if (g.playerSafe || !P.alive) return;
    if (this.attackKind === 'volley') {
      g.audio.play('spit');
      const count = this.phase === 2 ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 1.6;
        g.spawnAcid(b.x, b.y + 2.2, b.z, { x: P.body.x + offset, y: P.body.y, z: P.body.z - offset }, this.dmg);
      }
      return;
    }
    if (this.attackKind === 'slam') {
      g.audio.play('slam');
      g.cam.shake = Math.max(g.cam.shake, 0.8);
      g.fx.ring(b.x, b.y, b.z, 5.8, 0xffa040, 0.4);
      g.fx.burst(b.x, b.y + 0.2, b.z, 0xffa040, 18, 7, 0.6);
      const pb = P.body;
      if (Math.hypot(pb.x - b.x, pb.z - b.z) < 5.8 && Math.abs(pb.y - b.y) < 1.1) {
        if (P.hurt(this.dmg, b.x, b.z, 13)) g.onPlayerHurt(this.dmg);
      }
      return;
    }
    if (d.ranged) {
      g.audio.play('spit');
      g.spawnAcid(b.x, b.y + d.height * 0.8, b.z, g.player.body, this.dmg);
      return;
    }
    const pb = P.body;
    if (dist <= d.attackRange + 0.5 && Math.abs(pb.y - b.y) < 1.9) {
      g.audio.play('hit');
      if (P.hurt(this.dmg, b.x, b.z, d.boss ? 11 : 8)) g.onPlayerHurt(this.dmg);
    }
  }

  syncVisual(dt, g) {
    const b = this.body;
    this.root.position.set(b.x, b.y, b.z);
    if (!this.dead) this.root.rotation.y = this.facing;
    const p = this.parts;
    if (this.dead) {
      this.blob.visible = false;
      return;
    }
    const sp = Math.hypot(this.mv.x, this.mv.z);
    this.animT += dt * (3 + sp * 1.6);
    const run = Math.min(1, sp / 4);
    this.h.model.position.y = Math.sin(this.animT * 2) * 0.04 * run;
    this.h.model.rotation.z = Math.sin(this.animT) * 0.07;
    p.head.rotation.z = Math.sin(this.animT * 0.6) * 0.08;
    p.legL.rotation.x = Math.sin(this.animT) * 0.7 * run;
    p.legR.rotation.x = -Math.sin(this.animT) * 0.7 * run;
    let arm = -1.4 + Math.sin(this.animT * 0.7) * 0.08;
    if (this.state === 'windup') arm = -2.6 + (1 - Math.max(0, this.timer) / Math.max(0.01, this.def.windup)) * 0.3;
    else if (this.state === 'cooldown' && this.timer > this.def.cooldown - 0.2) arm = -0.6;
    p.armL.rotation.x = arm;
    p.armR.rotation.x = arm;
    // 피격 번쩍
    const f = this.flashT > 0 ? 0.7 : 0;
    for (const m of this.h.materials) m.emissive.copy(m.userData.baseEmissive || new THREE.Color()).addScalar(f);
    if (this.burnT > 0) for (const m of this.h.materials) m.emissive.setRGB(0.5, 0.18, 0);
    // 체력바
    const hurt = this.hp < this.maxHp;
    this.bar.visible = hurt || this.def.boss;
    if (this.bar.visible) {
      const r = Math.max(0, this.hp / this.maxHp);
      this.fill.scale.x = Math.max(0.001, r);
      this.fill.position.x = -(1 - r) * 0.5;
      this.bar.position.set(b.x, b.y + this.def.height + 0.45, b.z);
      this.bar.quaternion.copy(g.camera.quaternion);
    }
    // 그림자
    const gy = g.groundYAt(b.x, b.y, b.z);
    if (gy === null) this.blob.visible = false;
    else {
      this.blob.visible = true;
      this.blob.position.set(b.x, gy + 0.03, b.z);
    }
  }

  dispose(g) {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    g.scene.remove(this.root, this.blob, this.bar);
    this.blob.geometry.dispose();
    this.blob.material.dispose();
    for (const m of this.h.materials) m.dispose();
  }
}
