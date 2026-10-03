import * as THREE from 'three';
import { PHYS, LAVA, TOWER, PLAYER } from '../config/balance.js';
import { WEAPONS, RARITY } from '../config/weapons.js';
import { ZOMBIES, zombieWeights } from '../config/zombies.js';
import { generateTower } from '../world/TowerGenerator.js';
import { WorldView } from '../world/WorldView.js';
import { Lava } from '../world/Lava.js';
import { Effects } from '../world/Effects.js';
import { updatePlatforms, preparePlatforms, stepOn, buildNearCache } from '../world/Platforms.js';
import { updateHazards } from '../world/Hazards.js';
import { themeForStage } from '../config/themes.js';
import { makeHealPickup, makeWaterPickup, makeCoin } from '../world/models.js';
import { Player, groundYBelow } from '../entities/Player.js';
import { Zombie } from '../entities/Zombie.js';
import { moveAndCollide, rayBox } from './physics.js';
import { CameraRig } from './CameraRig.js';
import { Input } from './Input.js';
import { AudioSys } from './Audio.js';
import {
  loadSave, writeSave, newSave, addWeapon, weaponByUid,
} from './Save.js';
import {
  def as wdef, weaponDamage, hasPerk, upgradeCost, canUpgrade, sellValue, rollWeapon,
} from '../combat/Weapons.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { makeRng } from './rng.js';

const DIFFS = {
  easy: { hp: 0.8, lava: 0.85, zspeed: 0.9 },
  normal: { hp: 1, lava: 1, zspeed: 1 },
  hard: { hp: 1.3, lava: 1.15, zspeed: 1.1 },
};
const MAX_WEAPONS = 12;
const MAX_WATER = 3;

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.maxRatio = Math.min(dpr, 2);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this._frameEma = 1 / 60;
    this._adaptT = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.cam = new CameraRig(this.camera);
    this.input = new Input();
    this.audio = new AudioSys();
    this.fx = new Effects(this.scene);
    this.hud = new Hud(this);
    this.screens = new Screens(this);
    this.save = loadSave();
    this.audio.muted = !!this.save.muted;
    this.difficulty = this._difficulty();
    this.state = 'title'; // title | play | dead | modal | paused | clear
    this.time = 0;
    this.acc = 0;
    this.lastNow = 0;
    this.debug = new URLSearchParams(location.search).has('debug');

    this.zombies = [];
    this.pickups = [];
    this.acids = [];
    this.stats = { kills: 0, deaths: 0 };
    this._saveDirty = false;
    this._saveT = 0;

    this.buildWorld();
    this.bindUi();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (this.state === 'play') this.pause(); });

    this.screens.showTitle();
    this.cam.snapTo(this.tower.safeZones[0].safe.spawn, { x: 0, z: 1 });
    requestAnimationFrame((t) => this.frame(t));
  }

  _difficulty() {
    const base = DIFFS[this.save.difficulty] || DIFFS.normal;
    const loop = this.save.loop || 0;
    return { hp: base.hp * (1 + 0.6 * loop), lava: base.lava * (1 + 0.08 * loop), zspeed: base.zspeed };
  }

  // ------------------------------------------------------------------
  // 세계 구성
  // ------------------------------------------------------------------
  buildWorld() {
    // 이전 월드 정리
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    this.fx = new Effects(this.scene);
    this.zombies = [];
    this.pickups = [];
    this.acids = [];

    this.tower = generateTower(this.save.seed);
    preparePlatforms(this.tower);
    this.world = new WorldView(this.scene, this.tower);
    this.lava = new Lava(this.scene);
    this.near = buildNearCache(this.tower, this.lava.floor);
    this.player = new Player(this.scene);

    this.curGround = null;
    this.playerSafe = true;
    this.safeIdx = 0;
    this.checkpoint = this.tower.safeZones[0];
    this.slot = 0;
    this.cd = 0;
    this.reloading = 0;
    this.pending = null;
    this.water = { charges: LAVA.waterCharges, cd: 0 };
    this.climberT = 20;
    this.climberToast = new Set();
    this.stageCoins = 0;
    this.beatT = 0;
    this.deadT = 0;
    this.bandStage = 0;

    this.spawnStaticPickups();
    this.spawnZombies();
    this.resetToSafe(this.save.lastSafe);
    for (let k = 0; k <= TOWER.stages; k++) this.world.setChestOpened(k, this.save.openedChests.includes(k));
  }

  spawnZombies() {
    for (const st of this.tower.stages) {
      for (const sp of st.zombies) {
        const z = new Zombie(this, sp.type, st.index, sp);
        z.stageIdx = st.index;
        this.zombies.push(z);
      }
    }
  }

  spawnStaticPickups() {
    for (const st of this.tower.stages) {
      for (const c of st.aircoins) {
        const mesh = makeCoin();
        mesh.position.set(c.x, c.y, c.z);
        this.scene.add(mesh);
        this.pickups.push({ type: 'aircoin', mesh, x: c.x, y: c.y, z: c.z, stage: st.index, fixed: true, taken: false, value: c.value });
      }
      for (const sp of st.pickups) {
        const mesh = sp.type === 'water' ? makeWaterPickup() : makeHealPickup();
        mesh.position.set(sp.x, sp.y + 0.9, sp.z);
        this.scene.add(mesh);
        this.pickups.push({ type: sp.type, mesh, x: sp.x, y: sp.y, z: sp.z, stage: st.index, fixed: true, taken: false, value: sp.type === 'heal' ? 35 : 1 });
      }
    }
  }

  resetToSafe(k) {
    const sz = this.tower.safeZones[k];
    this.player.reset(sz.safe.spawn.x, sz.maxY + 0.05, sz.safe.spawn.z, Math.atan2(sz.next.x, sz.next.z));
    this.cam.snapTo(this.player.body, sz.next);
    this.checkpoint = sz;
    this.curGround = null;
    this.playerSafe = true;
    this.safeIdx = k;
    this.lava.reset(sz.maxY - LAVA.startGap, 0);
    this.lava.setIdle(sz.maxY - LAVA.startGap);
    this.lava.y = sz.maxY - LAVA.startGap;
    this.water.charges = Math.max(this.water.charges, LAVA.waterCharges);
    this.bandStage = k;
    this.world.setActiveStage(k);
    this.hud.setStage(k === 0 ? '출발' : `안전구역 ${k}`);
  }

  bindUi() {
    this.hud.el.pause.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pause(); });
    this.hud.el.mute.addEventListener('pointerdown', (e) => { e.preventDefault(); this.toggleMute(); });
    // 첫 터치에서 오디오 해제
    // iOS는 touchend/click 같은 '제스처 종료' 이벤트에서만 오디오가 풀리는 경우가 있어 여러 이벤트에 건다
    const unlock = () => this.audio.unlock();
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') { if (this.state === 'play') this.pause(); else if (this.state === 'paused') this.resume(); }
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 72 : 62;
    this.camera.updateProjectionMatrix();
    document.getElementById('rotate-hint').classList.toggle('hidden', !(h > w && this.input.touchDetected));
  }

  // ------------------------------------------------------------------
  // 흐름 제어
  // ------------------------------------------------------------------
  startRun(cont) {
    this.audio.unlock();
    if (!cont) {
      const keep = this.save.muted;
      this.save = newSave(keep);
      this.difficulty = this._difficulty();
      this.buildWorld();
    } else if (this.stateWasTitleWithOldWorld) {
      this.buildWorld();
    }
    this.stateWasTitleWithOldWorld = false;
    this.input.clearAll();
    {
      const g0 = this.player.lastGround || this.tower.safeZones[this.safeIdx] || this.tower.safeZones[0];
      this.cam.snapTo(this.player.body, g0.next);
    }
    this.hud.show(true);
    this.state = 'play';
    this.refreshSlots();
    this.hud.setCoins(this.save.coins);
    if (this.save.lastSafe === 0 && !this.save.tip) {
      this.save.tip = true;
      this.markDirty();
      this.hud.toast('왼쪽 십자키로 이동 · 오른쪽 ⤒ 점프!\n발판을 건너 위로 올라가자', 3200);
    } else {
      this.hud.toast(this.save.lastSafe === 0 ? '타워를 올라가라!' : `안전구역 ${this.save.lastSafe}에서 이어서!`, 1800);
    }
  }

  startNewGamePlus() {
    const s = this.save;
    s.loop = (s.loop || 0) + 1;
    s.seed = (Math.random() * 1e9) | 0;
    s.lastSafe = 0;
    s.openedChests = [];
    s.cleared = false;
    writeSave(s);
    this.difficulty = this._difficulty();
    this.buildWorld();
    this.startRun(true);
  }

  toTitle() {
    this.hud.show(false);
    this.state = 'title';
    this.input.clearAll();
    // 저장된 진행으로 월드 재구성(새로 시작 후 타이틀로 나온 경우 대비)
    this.buildWorld();
    this.screens.showTitle();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.input.clearAll();
    this.screens.showPause();
  }

  resume() { if (this.state === 'paused') this.state = 'play'; }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.save.muted = this.audio.muted;
    this.hud.el.mute.textContent = this.audio.muted ? '🔇' : '🔊';
    this.markDirty();
  }

  setDifficulty(v) {
    this.save.difficulty = v;
    this.difficulty = this._difficulty();
    this.markDirty(true);
  }

  openModal() { this.state = 'modal'; this.input.clearAll(); }
  closeModal() { if (this.state === 'modal') { this.state = 'play'; this.refreshSlots(); } }

  markDirty(now = false) {
    this._saveDirty = true;
    if (now) this.flushSave();
  }

  flushSave() {
    if (this._saveDirty) { writeSave(this.save); this._saveDirty = false; }
  }

  // ------------------------------------------------------------------
  // 메인 루프
  // ------------------------------------------------------------------
  frame(ms) {
    const now = ms / 1000;
    const dt = Math.min(0.1, now - (this.lastNow || now));
    this.lastNow = now;
    this.nowSec = now;

    if (!this.manualStep && (this.state === 'play' || this.state === 'dead')) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= PHYS.fixedDt && n < 12) {
        this.step(PHYS.fixedDt);
        this.acc -= PHYS.fixedDt;
        n++;
      }
      if (n >= 12) this.acc = 0;
    } else {
      this.acc = 0;
    }
    this.updateView(dt, now);
    this.renderer.render(this.scene, this.camera);
    this.adaptResolution(dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  /** 프레임이 느리면 해상도를 낮추고, 여유 있으면 다시 올린다 (오래된 아이패드 대비) */
  adaptResolution(dt) {
    if (dt <= 0 || dt > 0.25) return;
    this._frameEma += (dt - this._frameEma) * 0.05;
    this._adaptT += dt;
    if (this._adaptT < 1.5) return;
    this._adaptT = 0;
    let r = this.ratio;
    if (this._frameEma > 0.024 && r > 0.75) r = Math.max(0.75, r - 0.25);
    else if (this._frameEma < 0.0125 && r < this.maxRatio) r = Math.min(this.maxRatio, r + 0.25);
    if (r !== this.ratio) {
      this.ratio = r;
      this.renderer.setPixelRatio(r);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }

  /** 고정 스텝 로직 */
  step(dt) {
    this.time += dt;
    const P = this.player;
    const b = P.body;
    updatePlatforms(this.tower, dt, this.time);

    // 사망 연출 중에는 입력 불가
    P.controllable = this.state === 'play';
    const plats = this.near(b.y);
    P.update(dt, this.input, this.cam, plats);
    if (P.events.jumped) this.audio.play('jump');
    if (P.events.landed) this.audio.play('land');
    if (b.ground) this.onBodyStep(b.ground);
    if (b.ground !== this.curGround && b.ground && b.ground.type !== 'lavafloor') {
      this.curGround = b.ground;
      this.onLand(b.ground);
    }

    if (this.state === 'play') this.updateCombat(dt);
    updateHazards(this.tower, this.time, this);

    for (const z of this.zombies) {
      if (z.removed) continue;
      if (!z.climber && Math.abs(z.stageIdx - this.bandStage) > 1) continue;
      z.update(dt, this);
    }
    this.updateAcids(dt);
    this.updatePickups(dt);

    // 용암
    this.lava.update(dt, b.y);
    if (this.state === 'play' && P.alive) {
      if (!this.lava.frozen && b.y + 0.15 < this.lava.y) this.killPlayer('lava');
      else if (P.hp <= 0) this.killPlayer('hp');
    }
    this.updateLavaAmbience(dt);
    this.updateClimbers(dt);
    this.updateContext();

    if (this.state === 'dead') {
      this.deadT -= dt;
      if (this.deadT <= 0) this.respawn();
    }
    this.water.cd = Math.max(0, this.water.cd - dt);

    // 정리 + 주기 저장
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].removed) { this.zombies[i].dispose(this); this.zombies.splice(i, 1); }
    }
    this._saveT += dt;
    if (this._saveT > 4) { this._saveT = 0; this.flushSave(); }
  }

  onBodyStep(p) { stepOn(p); }

  // ------------------------------------------------------------------
  // 발판 이벤트
  // ------------------------------------------------------------------
  onLand(p) {
    if (p.type === 'safe') {
      this.enterSafe(p);
    } else {
      this.playerSafe = false;
      if (this.lava.state === 'idle') {
        const stage = Math.max(1, p.stage);
        const speed = (LAVA.speedBase + LAVA.speedPerStage * (stage - 1)) * this.difficulty.lava;
        this.lava.begin(speed, LAVA.startDelay);
        this.climberT = 14;
        this.hud.toast(`🔥 ${stage}층 · ${themeForStage(stage).name}
용암이 올라온다!`, 2200);
        this.audio.play('warn');
      }
      this.bandStage = p.stage;
      this.world.setActiveStage(p.stage);
      this.hud.setStage(`${p.stage}층`);
      if (p.checkpoint && this.checkpoint !== p) {
        this.checkpoint = p;
        this.hud.toast('🚩 체크포인트', 900);
        this.audio.play('checkpoint');
      }
    }
  }

  enterSafe(p) {
    const k = p.safe.stage;
    this.playerSafe = true;
    this.safeIdx = k;
    this.bandStage = k;
    this.world.setActiveStage(k);
    this.checkpoint = p;
    this.hud.setStage(k === 0 ? '출발' : (k === TOWER.stages ? '정상!' : `안전구역 ${k}`));
    this.lava.setIdle(p.maxY - LAVA.startGap);
    this.player.heal(this.player.maxHp);
    this.water.charges = Math.max(this.water.charges, LAVA.waterCharges);
    this.stageCoins = 0;
    if (k > this.save.lastSafe) {
      this.save.lastSafe = k;
      this.save.best = Math.max(this.save.best || 0, k);
      this.markDirty(true);
      this.audio.play('safe');
      if (k === TOWER.stages) {
        this.hud.toast('🚁 정상 도착!', 2500);
        this.save.cleared = true;
        this.markDirty(true);
        setTimeout(() => {
          if (this.state === 'play') { this.state = 'clear'; this.input.clearAll(); this.screens.showClear({ ...this.stats, coins: this.save.coins }); }
        }, 2200);
      } else {
        this.hud.toast(`✅ 안전구역 ${k} 도착! 상자를 열어보자`, 2200);
      }
    } else {
      this.markDirty();
    }
  }

  // ------------------------------------------------------------------
  // 사망 / 부활
  // ------------------------------------------------------------------
  killPlayer(cause) {
    const P = this.player;
    if (!P.alive) return;
    P.alive = false;
    this.state = 'dead';
    this.deadT = 1.6;
    this.stats.deaths++;
    this.audio.play('die');
    this.input.clearAll();
    const loss = Math.floor(this.stageCoins * LAVA.deathCoinLoss);
    if (loss > 0) { this.save.coins -= loss; this.stageCoins -= loss; this.markDirty(); }
    this.hud.toast(cause === 'lava' ? '🔥 용암에 빠졌다!' : '💀 좀비에게 당했다!', 1500);
    const b = P.body;
    this.fx.burst(b.x, b.y + 1, b.z, cause === 'lava' ? 0xff7a1a : 0x6fa05a, 18, 6, 0.8);
    this.cam.shake = 1;
  }

  respawn() {
    const cp = this.checkpoint;
    const P = this.player;
    P.reset(cp.x, cp.maxY + 0.05, cp.z, Math.atan2(cp.next.x, cp.next.z));
    this.curGround = null;
    this.pending = null;
    this.reloading = 0;
    this.playerSafe = cp.type === 'safe';
    if (cp.type === 'safe') {
      this.lava.setIdle(cp.maxY - LAVA.startGap);
      this.lava.y = cp.maxY - LAVA.startGap;
    } else {
      this.lava.reset(cp.maxY - LAVA.deathResetGap, LAVA.deathFreeze);
    }
    for (const a of this.acids) this.scene.remove(a.mesh);
    this.acids = [];
    this.cam.snapTo(P.body, cp.next);
    this.state = 'play';
    this.hud.setCoins(this.save.coins);
  }

  // ------------------------------------------------------------------
  // 전투
  // ------------------------------------------------------------------
  get currentWeapon() {
    const uid = this.save.equipped[this.slot];
    return uid ? weaponByUid(this.save, uid) : null;
  }

  refreshSlots() {
    // 현재 슬롯이 비었으면 장착된 첫 슬롯으로
    if (!this.currentWeapon) {
      const i = this.save.equipped.findIndex((u) => u);
      this.slot = i >= 0 ? i : 0;
    }
    this.player.setWeapon(this.currentWeapon);
    const w = this.currentWeapon;
    if (w && wdef(w).kind === 'gun' && w.ammo === undefined) w.ammo = wdef(w).mag;
  }

  switchSlot(i) {
    const uid = this.save.equipped[i];
    if (!uid || i === this.slot) return;
    this.slot = i;
    this.reloading = 0;
    this.pending = null;
    this.player.setWeapon(this.currentWeapon);
    const w = this.currentWeapon;
    if (w && wdef(w).kind === 'gun' && w.ammo === undefined) w.ammo = wdef(w).mag;
    this.audio.play('ui');
  }

  updateCombat(dt) {
    const P = this.player;
    this.cd = Math.max(0, this.cd - dt);
    const s = this.input.consumeSlot();
    if (s >= 0) this.switchSlot(s);
    if (this.input.consumeWater()) this.useWater();

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = this.currentWeapon;
        if (w) w.ammo = wdef(w).mag;
      }
    }
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { this.applyMelee(this.pending); this.pending = null; }
    }

    const w = this.currentWeapon;
    const pressed = this.input.consumeAttack();
    if (!w || !P.alive) return;
    if ((pressed || this.input.attackHeld) && this.cd <= 0 && this.reloading <= 0) this.startAttack(w);
  }

  /**
   * 자동 조준 대상. 터치로는 정확히 돌아보기 어려우므로
   * 1) 바라보는 방향 콘(coneDeg) 안의 가장 가까운 좀비 → 2) 없으면 fallbackRange 이내 전방위 가장 가까운 좀비
   */
  findTarget(range, coneDeg, fallbackRange = 0) {
    const P = this.player.body;
    const fx = Math.sin(this.player.facing);
    const fz = Math.cos(this.player.facing);
    const cos = Math.cos((coneDeg * Math.PI) / 180);
    let best = null;
    let bd = Infinity;
    let bestAny = null;
    let bdAny = Infinity;
    for (const z of this.zombies) {
      if (z.dead || z.removed) continue;
      const zb = z.body;
      const dx = zb.x - P.x;
      const dz = zb.z - P.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.01) continue;
      if (zb.y > P.y + 4 || zb.y + z.def.height < P.y - 6) continue;
      if (d <= fallbackRange + z.def.radius && d < bdAny) { bdAny = d; bestAny = z; }
      if (d > range + z.def.radius) continue;
      if ((dx * fx + dz * fz) / d < cos) continue;
      if (d < bd) { bd = d; best = z; }
    }
    return best || bestAny;
  }

  startAttack(w) {
    const P = this.player;
    const d = wdef(w);
    const b = P.body;
    if (d.kind === 'melee') {
      const t = this.findTarget(d.range + 1.5, 75, d.range + 0.6);
      if (t) P.faceDir(t.body.x - b.x, t.body.z - b.z, 0.4);
      else P.faceLock = 0.3;
      this.cd = d.interval;
      P.startSwing(Math.max(0.3, d.windup / 0.35), d.shape === 'line' ? 'line' : 'melee');
      this.pending = { t: d.windup, w, yaw: P.facing };
      this.audio.play(d.shape === 'line' ? 'whip' : 'swing');
    } else {
      if (w.ammo === undefined) w.ammo = d.mag;
      if (w.ammo <= 0) { this.startReload(w); return; }
      const t = this.findTarget(Math.min(d.range, 24), 45, 7);
      if (t) P.faceDir(t.body.x - b.x, t.body.z - b.z, 0.3);
      else P.faceLock = 0.25;
      w.ammo--;
      this.cd = d.interval;
      P.startSwing(0.18, 'gun');
      this.fireGun(w, d, t);
      if (w.ammo <= 0) this.startReload(w);
    }
  }

  startReload(w) {
    const d = wdef(w);
    if (this.reloading > 0) return;
    this.reloading = d.reload;
    this.audio.play('reload');
    this.hud.toast('재장전…', 500);
  }

  applyMelee(pend) {
    const P = this.player;
    const b = P.body;
    const w = pend.w;
    const d = wdef(w);
    if (!P.alive) return;
    const dmg = weaponDamage(w);
    const fx = Math.sin(pend.yaw);
    const fz = Math.cos(pend.yaw);
    const half = (((d.arc || 0) / 2) * Math.PI) / 180;
    const cosHalf = Math.cos(half);
    const hits = [];
    for (const z of this.zombies) {
      if (z.dead || z.removed) continue;
      const zb = z.body;
      if (zb.y > b.y + 2.0 || zb.y + z.def.height < b.y - 0.4) continue;
      const dx = zb.x - b.x;
      const dz = zb.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (d.shape === 'line') {
        const along = dx * fx + dz * fz;
        const lat = Math.abs(dx * fz - dz * fx);
        if (along > -0.3 && along <= d.range + z.def.radius && lat <= d.width / 2 + z.def.radius) hits.push({ z, dist, dx, dz });
      } else if (dist <= d.range + z.def.radius) {
        if (dist < z.def.radius + 0.6 || (dx * fx + dz * fz) / (dist || 1) >= cosHalf) hits.push({ z, dist, dx, dz });
      }
    }
    hits.sort((a, c) => a.dist - c.dist);
    const n = Math.min(hits.length, d.maxTargets);
    const burn = hasPerk(w, 'burn') ? dmg * 0.25 : 0;
    for (let i = 0; i < n; i++) {
      const h = hits[i];
      const l = h.dist || 1;
      this.hitZombie(h.z, dmg, { kx: h.dx / l, kz: h.dz / l, knock: d.knockback, burn, slow: d.slow || 0, weapon: w });
    }
    if (d.shape === 'line') {
      const ex = b.x + fx * d.range;
      const ez = b.z + fz * d.range;
      this.fx.line(b.x + fx * 0.5, b.y + 1.1, b.z + fz * 0.5, ex, b.y + 0.9, ez, 0xffe9a0, 0.09, 0.12);
    } else {
      this.fx.slash(b.x, b.y, b.z, pend.yaw, d.range, d.arc, 0xfff2b0);
    }
    if (n > 0) this.cam.shake = Math.max(this.cam.shake, 0.15);
  }

  fireGun(w, d, target) {
    const P = this.player;
    const b = P.body;
    const fx = Math.sin(P.facing);
    const fz = Math.cos(P.facing);
    const ox = b.x + fx * 0.5;
    const oy = b.y + 1.25;
    const oz = b.z + fz * 0.5;
    let dirx = fx; let diry = 0; let dirz = fz;
    if (target) {
      const tb = target.body;
      const tx = tb.x - ox;
      const ty = tb.y + target.def.height * 0.55 - oy;
      const tz = tb.z - oz;
      const l = Math.hypot(tx, ty, tz) || 1;
      dirx = tx / l; diry = ty / l; dirz = tz / l;
    }
    const dmg = weaponDamage(w);
    const burn = hasPerk(w, 'burn') ? dmg * 0.25 : 0;
    this.audio.play(w.kind);
    this.fx.burst(ox, oy, oz, 0xffd070, 3, 3, 0.15, 0.1);
    const plats = this.near(b.y);
    for (let i = 0; i < d.pellets; i++) {
      let dx = dirx; let dy = diry; let dz = dirz;
      if (d.spread) {
        const sp = (d.spread * Math.PI) / 180;
        const a = (Math.random() - 0.5) * 2 * sp;
        const c = Math.cos(a); const s = Math.sin(a);
        const nx = dx * c + dz * s;
        const nz = -dx * s + dz * c;
        dx = nx; dz = nz;
        dy += (Math.random() - 0.5) * sp;
        const l = Math.hypot(dx, dy, dz);
        dx /= l; dy /= l; dz /= l;
      }
      let tMax = d.range;
      for (const p of plats) {
        if (!p.solid || p === b.ground || p.type === 'lavafloor') continue;
        if (target && p === target.body.ground) continue;
        const t = rayBox(ox, oy, oz, dx, dy, dz, p, tMax);
        if (t !== null && t > 0.05 && t < tMax) tMax = t;
      }
      let hitZ = null;
      for (const z of this.zombies) {
        if (z.dead || z.removed) continue;
        const zb = z.body;
        const box = { minX: zb.x - zb.hw, maxX: zb.x + zb.hw, minY: zb.y, maxY: zb.y + zb.h, minZ: zb.z - zb.hw, maxZ: zb.z + zb.hw };
        const t = rayBox(ox, oy, oz, dx, dy, dz, box, tMax);
        if (t !== null && t < tMax) { tMax = t; hitZ = z; }
      }
      this.fx.line(ox, oy, oz, ox + dx * tMax, oy + dy * tMax, oz + dz * tMax, w.rarity >= 2 ? 0xd9a8ff : 0xffe38a, 0.045, 0.07);
      if (hitZ) {
        this.hitZombie(hitZ, dmg, { kx: dx, kz: dz, knock: d.knockback, burn, weapon: w });
      }
    }
  }

  hitZombie(z, dmg, o) {
    const zb = z.body;
    const killed = z.takeDamage(this, dmg, o);
    this.hud.floater({ x: zb.x, y: zb.y + z.def.height + 0.3, z: zb.z }, Math.round(dmg), killed ? '#ffd04a' : '#fff', killed ? 1.3 : 1);
    this.fx.burst(zb.x, zb.y + z.def.height * 0.6, zb.z, 0x6fa05a, 4, 3.5, 0.35, 0.12);
    this.audio.play('hit');
  }

  onZombieKilled(z, o) {
    this.stats.kills++;
    const zb = z.body;
    const w = o.weapon || this.currentWeapon;
    let total = z.coin;
    if (w && hasPerk(w, 'coin') && !o.burn) total *= 1.15;
    total = Math.max(1, Math.round(total));
    const n = Math.max(1, Math.min(6, Math.round(total / 6)));
    let left = total;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.round(total / n);
      left -= v;
      this.spawnCoin(zb.x, zb.y + 0.8, zb.z, v);
    }
    if (w && hasPerk(w, 'lifesteal')) this.player.heal(6);
    if (Math.random() < 0.08 + (z.def.boss ? 1 : 0)) {
      const mesh = makeHealPickup();
      this.scene.add(mesh);
      this.pickups.push({ type: 'heal', mesh, x: zb.x, y: zb.y, z: zb.z, stage: z.stageIdx ?? 0, fixed: true, taken: false, value: 25, life: 20 });
      mesh.position.set(zb.x, zb.y + 0.9, zb.z);
    }
    this.fx.burst(zb.x, zb.y + 1, zb.z, 0x6fa05a, 10, 5, 0.5);
    if (z.def.boss) {
      this.hud.toast('👑 보스 처치!', 2000);
      this.cam.shake = 1;
    }
  }

  spawnCoin(x, y, z, value) {
    const mesh = makeCoin();
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 2.5;
    this.pickups.push({
      type: 'coin', mesh, value, life: 25, taken: false,
      body: { x, y, z, vx: Math.cos(a) * sp, vy: 5 + Math.random() * 3, vz: Math.sin(a) * sp, hw: 0.2, h: 0.4, grounded: false, ground: null },
      x, y, z,
    });
  }

  // ------------------------------------------------------------------
  // 투사체 / 아이템
  // ------------------------------------------------------------------
  spawnAcid(x, y, z, target, dmg) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb6ff3a }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const tx = target.x - x; const ty = target.y + 1.1 - y; const tz = target.z - z;
    const l = Math.hypot(tx, ty, tz) || 1;
    const sp = 12;
    this.acids.push({ mesh, x, y, z, vx: (tx / l) * sp, vy: (ty / l) * sp, vz: (tz / l) * sp, life: 3, dmg });
  }

  updateAcids(dt) {
    const P = this.player;
    const pb = P.body;
    for (let i = this.acids.length - 1; i >= 0; i--) {
      const a = this.acids[i];
      a.life -= dt;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      a.mesh.position.set(a.x, a.y, a.z);
      let dead = a.life <= 0;
      if (!dead && P.alive && Math.abs(a.x - pb.x) < 0.6 && Math.abs(a.z - pb.z) < 0.6 && a.y > pb.y - 0.1 && a.y < pb.y + 1.9) {
        if (P.hurt(a.dmg, a.x - a.vx, a.z - a.vz, 6)) this.onPlayerHurt(a.dmg);
        dead = true;
      }
      if (!dead) {
        const plats = this.near(a.y);
        for (const p of plats) {
          if (p.solid && a.x > p.minX && a.x < p.maxX && a.y > p.minY && a.y < p.maxY && a.z > p.minZ && a.z < p.maxZ) { dead = true; break; }
        }
      }
      if (dead) {
        this.fx.burst(a.x, a.y, a.z, 0xb6ff3a, 5, 3, 0.3);
        this.scene.remove(a.mesh);
        a.mesh.geometry.dispose();
        a.mesh.material.dispose();
        this.acids.splice(i, 1);
      }
    }
  }

  updatePickups(dt) {
    const P = this.player;
    const pb = P.body;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      if (it.taken) { this.scene.remove(it.mesh); this.pickups.splice(i, 1); continue; }
      if (it.fixed && Math.abs(it.stage - this.bandStage) > 1) { it.mesh.visible = false; continue; }
      it.mesh.visible = true;
      if (it.type === 'coin') {
        it.life -= dt;
        const body = it.body;
        const dx = pb.x - body.x; const dy = pb.y + 0.9 - body.y; const dz = pb.z - body.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 3.6 && P.alive) {
          const k = Math.min(1, dt * 12);
          body.x += dx * k; body.y += dy * k; body.z += dz * k;
        } else {
          body.vy = Math.max(-PHYS.maxFall, body.vy - PHYS.gravity * dt);
          moveAndCollide(body, dt, this.near(body.y));
          if (body.grounded) { body.vx *= 0.8; body.vz *= 0.8; }
        }
        it.mesh.position.set(body.x, body.y + 0.2, body.z);
        it.mesh.rotation.y += dt * 5;
        if (d < 0.9 && P.alive) {
          it.taken = true;
          this.save.coins += it.value;
          this.stageCoins += it.value;
          this.markDirty();
          this.hud.setCoins(this.save.coins);
          this.audio.play('coin');
        } else if (it.life <= 0 || body.y < this.lava.y - 1) it.taken = true;
      } else if (it.type === 'aircoin') {
        it.mesh.rotation.y += dt * 4;
        it.mesh.position.y = it.y + Math.sin(this.time * 3 + it.x) * 0.1;
        if (P.alive && Math.hypot(pb.x - it.x, pb.z - it.z) < 1.25 && Math.abs(pb.y + 0.9 - it.y) < 1.6) {
          it.taken = true;
          this.save.coins += it.value;
          this.stageCoins += it.value;
          this.markDirty();
          this.hud.setCoins(this.save.coins);
          this.audio.play('coin');
          this.fx.burst(it.x, it.y, it.z, 0xffd24a, 5, 3, 0.35, 0.1);
        }
      } else {
        it.mesh.rotation.y += dt * 2;
        it.mesh.position.y = it.y + 0.9 + Math.sin(this.time * 3 + it.x) * 0.12;
        if (it.life !== undefined) { it.life -= dt; if (it.life <= 0) it.taken = true; }
        const dx = pb.x - it.x; const dz = pb.z - it.z; const dy = pb.y - it.y;
        if (P.alive && Math.hypot(dx, dz) < 1.3 && dy > -1 && dy < 2) {
          if (it.type === 'heal') {
            if (P.hp >= P.maxHp) continue;
            P.heal(it.value);
            this.hud.floater({ x: pb.x, y: pb.y + 2, z: pb.z }, `+${it.value}`, '#5dff8a');
            this.audio.play('heal');
          } else if (it.type === 'water') {
            if (this.water.charges >= MAX_WATER) continue;
            this.water.charges++;
            this.hud.toast('💧 물대포 +1', 900);
            this.audio.play('heal');
          }
          it.taken = true;
        }
      }
    }
  }

  onPlayerHurt(dmg) {
    this.audio.play('hurt');
    this.cam.shake = Math.max(this.cam.shake, 0.5);
    const b = this.player.body;
    this.hud.floater({ x: b.x, y: b.y + 2, z: b.z }, `-${Math.round(dmg)}`, '#ff6a6a');
  }

  // ------------------------------------------------------------------
  // 물대포 / 용암 연출 / 클라이머
  // ------------------------------------------------------------------
  useWater() {
    if (!this.player.alive) return;
    if (this.lava.state === 'idle') { this.hud.toast('지금은 용암이 없어요', 800); return; }
    if (this.water.charges <= 0) { this.hud.toast('물이 없어요! 안전구역에서 충전', 1100); this.audio.play('empty'); return; }
    if (this.water.cd > 0) return;
    if (this.lava.state === 'frozen') { this.hud.toast('이미 굳어 있어요', 700); return; }
    if (!this.lava.freeze(LAVA.waterFreeze)) return;
    this.water.charges--;
    this.water.cd = LAVA.waterCooldown + LAVA.waterFreeze;
    const b = this.player.body;
    this.audio.play('water');
    this.audio.play('steam');
    this.hud.toast(`💧 용암이 ${LAVA.waterFreeze}초간 굳었다!`, 1500);
    for (let i = 0; i < 40; i++) {
      this.fx.burst(b.x + (Math.random() - 0.5) * 14, this.lava.y + 0.4, b.z + (Math.random() - 0.5) * 14, i % 2 ? 0xdff3ff : 0x8ac8ff, 1, 4, 0.9, 0.3);
    }
    this.cam.shake = Math.max(this.cam.shake, 0.4);
  }

  updateLavaAmbience(dt) {
    const b = this.player.body;
    const gap = b.y - this.lava.y;
    const rising = this.lava.state === 'rising' && this.lava.delay <= 0;
    let vig = 0;
    if (rising && this.player.alive) {
      const w = LAVA.warnGap;
      vig = Math.max(0, Math.min(1, (w + 4 - gap) / (w + 4)));
      if (gap < w) {
        this.cam.shake = Math.max(this.cam.shake, 0.06 + (1 - gap / w) * 0.18);
        this.beatT -= dt;
        if (this.beatT <= 0) { this.audio.play('beat'); this.beatT = 0.35 + gap * 0.07; }
      }
    }
    this.audio.setLavaProximity(this.lava.state === 'idle' ? 0 : Math.max(0, 1 - gap / 28) * 0.8);
    this.vig = vig;
  }

  updateClimbers(dt) {
    if (this.lava.state !== 'rising' || this.lava.delay > 0 || this.bandStage < 2 || this.playerSafe) return;
    this.climberT -= dt;
    if (this.climberT > 0) return;
    const stage = this.bandStage;
    this.climberT = Math.max(16, 38 - 2.4 * stage);
    if (this.zombies.filter((z) => z.climber && !z.dead).length >= 5) return;
    const b = this.player.body;
    // 용암선 바로 위의 발판에서 출발
    const chain = this.tower.chain;
    let spawn = null;
    for (const p of chain) {
      if (p.type === 'safe' || p.motion || p.type === 'falling') continue;
      if (p.maxY > this.lava.y + 1.2 && p.maxY < this.lava.y + 7 && p.maxY < b.y - 8) spawn = p;
    }
    if (!spawn) return;
    const n = 1 + Math.floor(stage / 3);
    const w = zombieWeights(stage);
    delete w.spitter; delete w.tank;
    const rng = makeRng((Math.random() * 1e9) | 0);
    for (let i = 0; i < n; i++) {
      const type = rng.weighted(w);
      const z = new Zombie(this, type, stage, {
        x: spawn.x + rng.range(-0.5, 0.5) * spawn.hx, y: spawn.maxY, z: spawn.z + rng.range(-0.5, 0.5) * spawn.hz, platform: spawn,
      }, { climber: true });
      z.stageIdx = stage;
      this.zombies.push(z);
    }
    this.fx.burst(spawn.x, spawn.maxY + 0.5, spawn.z, 0xff7a1a, 14, 5, 0.7);
    this.audio.play('zgrowl');
    if (!this.climberToast.has(stage)) {
      this.climberToast.add(stage);
      this.hud.toast('🧟 좀비 떼가 아래에서 올라온다!', 1800);
    }
  }

  // ------------------------------------------------------------------
  // 대장간 / 상자 API (Screens에서 호출)
  // ------------------------------------------------------------------
  updateContext() {
    const buttons = [];
    if (this.playerSafe && this.state === 'play') {
      const sz = this.tower.safeZones[this.safeIdx];
      const pb = this.player.body;
      if (sz && sz.safe) {
        const near = (pt, r) => Math.hypot(pb.x - pt.x, pb.z - pt.z) < r;
        if (this.safeIdx >= 1 && !this.save.openedChests.includes(this.safeIdx) && near(sz.safe.chest, 5)) {
          buttons.push({ id: 'chest', label: '📦 상자 열기', onTap: () => this.openChestUi(this.safeIdx) });
        }
        if (near(sz.safe.forge, 5.5)) {
          buttons.push({ id: 'forge', label: '⚒ 대장간 · 장비', onTap: () => this.openForgeUi() });
        }
      }
    }
    this.hud.setContext(buttons);
  }

  openChestUi(k) {
    if (this.save.openedChests.includes(k)) return;
    this.openModal();
    this.screens.showChest(k);
  }

  openForgeUi() {
    this.openModal();
    this.screens.showForge();
  }

  rollChest(k) {
    const boss = k === 5 || k === 10;
    const weapon = rollWeapon(k, Math.random, boss);
    this.save.openedChests.push(k);
    let sold = 0;
    let w = null;
    if (this.save.weapons.length >= MAX_WEAPONS) {
      sold = sellValue(weapon);
      this.save.coins += sold;
    } else {
      w = addWeapon(this.save, weapon);
    }
    this.world.setChestOpened(k, true);
    this.markDirty(true);
    this.hud.setCoins(this.save.coins);
    return { weapon: w || { ...weapon, uid: -1 }, sold };
  }

  upgradeWeapon(w) {
    const cost = upgradeCost(w);
    if (!canUpgrade(w) || this.save.coins < cost) return false;
    this.save.coins -= cost;
    w.level++;
    this.markDirty(true);
    this.hud.setCoins(this.save.coins);
    return true;
  }

  equipWeapon(uid, slot) {
    const s = this.save;
    const old = s.equipped.indexOf(uid);
    if (old >= 0) s.equipped[old] = s.equipped[slot];
    s.equipped[slot] = uid;
    this.markDirty(true);
  }

  unequipWeapon(uid) {
    const s = this.save;
    // 최소 1개는 장착 유지
    if (s.equipped.filter((u) => u).length <= 1) return;
    const i = s.equipped.indexOf(uid);
    if (i >= 0) s.equipped[i] = null;
    this.markDirty(true);
  }

  sellWeapon(uid) {
    const s = this.save;
    if (s.weapons.length <= 1) return;
    const w = weaponByUid(s, uid);
    if (!w) return;
    s.coins += sellValue(w) + w.level * 10;
    s.weapons = s.weapons.filter((x) => x.uid !== uid);
    s.equipped = s.equipped.map((u) => (u === uid ? null : u));
    if (!s.equipped.some((u) => u)) s.equipped[0] = s.weapons[0].uid;
    this.markDirty(true);
    this.hud.setCoins(s.coins);
  }

  groundYAt(x, y, z) {
    return groundYBelow(x, y, z, this.near(y));
  }

  // ------------------------------------------------------------------
  // 렌더 갱신 (매 프레임)
  // ------------------------------------------------------------------
  updateView(dt, now) {
    const P = this.player;
    const b = P.body;
    this.world.sync(this.time, b, this.lava.y);
    this.fx.update(dt);

    if (this.state === 'title') {
      // 타이틀 배경: 시작 안전구역 주변을 천천히 선회
      const sz = this.tower.safeZones[this.save.lastSafe || 0];
      this.cam.yaw += dt * 0.12;
      this.cam.pitch = 0.3;
      this.cam.target.set(sz.x, sz.maxY + 2, sz.z);
      this.cam._apply(dt, now);
      this.lava.update(dt, sz.maxY);
      P.syncVisual(dt, this.near(b.y), this.time);
      this.zombies.forEach((z) => z.syncVisual(dt, this));
      this.hud.setVignette(0);
      return;
    }

    const hint = P.lastGround && P.lastGround.next;
    const mv = this.input.getMove();
    const autoAlign = mv.y > 0.1 && P.alive;
    if (this.state === 'play' || this.state === 'dead' || this.state === 'paused' || this.state === 'modal') {
      this.cam.update(this.state === 'play' || this.state === 'dead' ? dt : 0, b, this.input, hint, autoAlign, now, this.state !== 'dead');
    }
    P.syncVisual(dt, this.near(b.y), this.time);
    for (const z of this.zombies) {
      const active = z.climber || Math.abs(z.stageIdx - this.bandStage) <= 1;
      z.root.visible = active || z.dead;
      if (!active && !z.dead) { z.blob.visible = false; z.bar.visible = false; continue; }
      z.syncVisual(dt, this);
    }

    // HUD
    this.hud.setHp(P.hp, P.maxHp);
    const gap = b.y - this.lava.y;
    this.hud.setLava(gap, this.lava.state, LAVA.warnGap);
    this.hud.setVignette(this.vig || 0);
    this.hud.setWater(this.water.charges, this.lava.state !== 'idle' && this.water.cd <= 0);
    this.hud.setCoins(this.save.coins);
    const eq = this.save.equipped.map((u) => (u ? weaponByUid(this.save, u) : null));
    this.hud.renderSlots(eq, this.slot, (w) => (this.reloading > 0 && w === this.currentWeapon ? '…' : `${w.ammo ?? wdef(w).mag}`));
    if (this.debug) {
      this.hud.debug(`fps ${(1 / Math.max(dt, 0.001)).toFixed(0)}  y ${b.y.toFixed(1)}  lava ${this.lava.y.toFixed(1)} (${this.lava.state})\ngap ${gap.toFixed(1)}  stage ${this.bandStage}  zombies ${this.zombies.length}`);
    }
  }
}
