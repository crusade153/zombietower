import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PHYS, LAVA, TOWER, PLAYER, ECON, THRILL, STARS, CHARGE, ABILITIES, ITEMS } from '../config/balance.js';
import { WEAPONS, RARITY, baseWeaponKind } from '../config/weapons.js';
import { ZOMBIES, zombieWeights } from '../config/zombies.js';
import { generateTower, bossStage } from '../world/TowerGenerator.js';
import { WorldView } from '../world/WorldView.js';
import { Lava } from '../world/Lava.js';
import { Effects } from '../world/Effects.js';
import { updatePlatforms, preparePlatforms, stepOn, buildNearCache, vanishingIn } from '../world/Platforms.js';
import { updateHazards } from '../world/Hazards.js';
import { themeForStage } from '../config/themes.js';
import { makeHealPickup, makeWaterPickup, makeCoin, disposeWorld, setModelStyle } from '../world/models.js';
import { Player, groundYBelow } from '../entities/Player.js';
import { Zombie } from '../entities/Zombie.js';
import { moveAndCollide, rayBox } from './physics.js';
import { CameraRig } from './CameraRig.js';
import { SceneRenderer } from './SceneRenderer.js';
import { Input } from './Input.js';
import { AudioSys } from './Audio.js';
import {
  loadSave, writeSave, newSave, addWeapon, weaponByUid, fuseWeapons,
} from './Save.js';
import {
  def as wdef, weaponDamage, hasPerk, upgradeCost, canUpgrade, sellValue, sellPrice, rollWeapon, weaponEffect,
} from '../combat/Weapons.js';
import { Combo, LavaEscape, rollCrit } from '../combat/Thrills.js';
import { StageRun } from './StageRun.js';
import { startSpecial, updateSpecial } from '../combat/Specials.js';
import { unlockNew, BOSS_TYPES } from './Achievements.js';
import { cosmetic, COSMETICS } from '../config/cosmetics.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { makeRng } from './rng.js';
import { Lobby } from '../world/Lobby.js';
import { setSoundIcon } from '../ui/icons.js';

const DIFFS = {
  easy: { hp: 0.8, lava: 0.85, zspeed: 0.9 },
  normal: { hp: 1, lava: 1, zspeed: 1 },
  hard: { hp: 1.3, lava: 1.15, zspeed: 1.1 },
};
const MAX_WEAPONS = 12;
const MAX_WATER = 3;

export class Game {
  constructor() {
    this.save = loadSave();
    setModelStyle(this.save.graphicsStyle);
    this.canvas = document.getElementById('game');
    const dpr = window.devicePixelRatio || 1;
    this.touchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.maxRatio = Math.min(dpr, this.touchDevice ? 1.5 : 2);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sceneRenderer = new SceneRenderer(this.renderer, { touchDevice: this.touchDevice });
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lobby = new Lobby();
    this._frameEma = 1 / 60;
    this._adaptT = 0;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.lobby.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.28;
    this.lobby.scene.environmentIntensity = 0.65;
    room.dispose();
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.cam = new CameraRig(this.camera);
    this.input = new Input();
    this.input.setFloating(this.save.stickMode !== 'fixed');
    this.audio = new AudioSys(this.save);
    this.fx = new Effects(this.scene, { capacity: this.touchDevice ? 256 : 512 });
    this.hud = new Hud(this);
    this.screens = new Screens(this);
    this.audio.muted = !!this.save.muted;
    this.applyGraphicsLighting();
    setSoundIcon(this.hud.el.mute, this.audio.muted);
    this.difficulty = this._difficulty();
    this.state = 'title'; // title | play | dead | modal | paused | clear
    this.time = 0;
    this.acc = 0;
    this.lastNow = 0;
    this.debug = new URLSearchParams(location.search).has('debug');

    this.zombies = [];
    this.pickups = [];
    this.acids = [];
    this.stats = { kills: 0, deaths: 0, nearMisses: 0 };
    this.combo = new Combo();
    this.lavaEscape = new LavaEscape();
    this.hitstop = 0;
    this.nearT = 0;
    this.charge = 0; // 차지 필살기 게이지(초)
    this.specialCd = 0;
    this.special = null; // 지속형 필살기(회오리 베기·탄막 난사) 진행 상태
    this.invisibleT = 0; // 투명 망토 남은 시간
    this.bossIntro = null; // 보스 등장 연출 { z, t }
    this.slowmo = 0; // 보스 격파 슬로모션 남은 시간(실제 초)
    this.specialWindow = 0; // 필살기 처치 집계 시간
    this.specialKills = 0;
    this._achT = 0;
    this.magnetT = 0; // 코인 자석 남은 시간
    this._saveDirty = false;
    this._saveT = 0;

    this.buildWorld();
    this.bindUi();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.lastNow = 0;
      this._frameEma = 1 / 60;
      this._adaptT = this._recoverT = 0;
      this.audio.setBackground(document.hidden);
      if (document.hidden && this.state === 'play') this.pause();
    });
    window.addEventListener('pagehide', () => { this.audio.setBackground(true); this.flushSave(); });
    window.addEventListener('pageshow', () => this.audio.setBackground(document.hidden));
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
    this.fx.dispose();
    disposeWorld(this.scene);
    this.fx = new Effects(this.scene, { capacity: this.touchDevice ? 256 : 512 });
    this.zombies = [];
    this.pickups = [];
    this.acids = [];

    this.tower = generateTower(this.save.seed);
    preparePlatforms(this.tower);
    this.world = new WorldView(this.scene, this.tower, { touchDevice: this.touchDevice });
    this.lava = new Lava(this.scene);
    this.lava.setGraphicsStyle(this.save.graphicsStyle);
    this.near = buildNearCache(this.tower, this.lava.floor);
    this.player = new Player(this.scene);
    this.player.abilities = this.save.abilities;
    this.player.setLook(this.save.cosmetics);

    this.curGround = null;
    this.playerSafe = true;
    this.safeIdx = 0;
    this.checkpoint = this.tower.safeZones[0];
    this.slot = 0;
    this.cd = 0;
    this.pending = null;
    this.water = { charges: LAVA.waterCharges, cd: 0 };
    this.climberT = 20;
    this.climberToast = new Set();
    this.stageCoins = 0;
    this.beatT = 0;
    this.deadT = 0;
    this.bandStage = 0;
    this.finalBattle = false;
    this.run = null; // 현재 층 도전 기록(별)

    this.spawnStaticPickups();
    this.spawnZombies();
    this.resetToSafe(this.save.resumeSafe, this.save.resumeAtBoss ? this.tower.bossSanctuary : undefined);
    for (let k = 0; k <= TOWER.stages; k++) this.world.setChestOpened(k, this.save.openedChests.includes(k));
  }

  spawnZombies() {
    for (const st of this.tower.stages) {
      for (const sp of st.zombies) {
        if (sp.type === 'finalBoss' && this.save.finalBossDefeated) continue;
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

  resetToSafe(k, sz = this.tower.safeZones[k]) {
    if (!sz) return;
    this.player.reset(sz.safe.spawn.x, sz.maxY + 0.05, sz.safe.spawn.z, Math.atan2(sz.next.x, sz.next.z));
    this.cam.snapTo(this.player.body, sz.next);
    this.checkpoint = sz;
    this.curGround = null;
    this.pending = null;
    this.cd = 0;
    this.stageCoins = 0;
    this.water.cd = 0;
    this.playerSafe = true;
    this.safeIdx = k;
    this.activeSafe = sz;
    this.finalBattle = false;
    this.combo.reset();
    this.lavaEscape.reset();
    this.resetCharge();
    this.lava.reset(sz.maxY - LAVA.startGap, 0);
    this.lava.setIdle(sz.maxY - LAVA.startGap);
    this.lava.y = sz.maxY - LAVA.startGap;
    this.water.charges = Math.max(this.water.charges, LAVA.waterCharges);
    this.bandStage = sz.stage;
    this.world.setActiveStage(sz.stage);
    this.renderer.shadowMap.needsUpdate = true;
    this.hud.setStage(sz.safe.bossPrep ? '최종 보스 준비' : k === 0 ? '출발' : `안전구역 ${k}`);
  }

  bindUi() {
    this.hud.el.pause.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pause(); });
    this.hud.el.mute.addEventListener('pointerdown', (e) => { e.preventDefault(); this.toggleMute(); });
    this.hud.el.graphics.addEventListener('click', () => this.toggleGraphicsStyle());
    this.hud.setGraphicsStyle(this.save.graphicsStyle);
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
    this.sceneRenderer.setSize();
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 72 : 62;
    this.camera.updateProjectionMatrix();
    this.lobby.resize(w, h);
    document.getElementById('rotate-hint').classList.add('hidden');
  }

  // ------------------------------------------------------------------
  // 흐름 제어
  // ------------------------------------------------------------------
  startRun(cont) {
    this.audio.unlock();
    if (!cont) {
      const keep = this.save.muted;
      const preferences = { graphicsStyle: this.save.graphicsStyle, musicVolume: this.save.musicVolume, effectsVolume: this.save.effectsVolume, stickMode: this.save.stickMode };
      this.save = newSave(keep);
      Object.assign(this.save, preferences);
      this.markDirty(true);
      this.difficulty = this._difficulty();
      this.buildWorld();
    } else if (this.stateWasTitleWithOldWorld) {
      this.buildWorld();
    }
    this.stateWasTitleWithOldWorld = false;
    this.input.clearAll();
    this.cam.pitch = 0.38;
    {
      const g0 = this.player.lastGround || this.tower.safeZones[this.safeIdx] || this.tower.safeZones[0];
      this.cam.snapTo(this.player.body, g0.next);
    }
    this.hud.show(true);
    this.state = 'play';
    this.syncAudioState();
    this.refreshSlots();
    this.hud.setCoins(this.save.coins);
    if (this.save.lastSafe === 0 && !this.save.tip) {
      this.save.tip = true;
      this.markDirty();
      this.hud.toast('모험 시작!', 1600);
    } else {
      this.hud.toast(this.safeIdx === 0 ? '타워를 올라가라!' : `안전구역 ${this.safeIdx}에서 이어서!`, 1800);
    }
  }

  startNewGamePlus() {
    const s = this.save;
    s.loop = (s.loop || 0) + 1;
    s.seed = (Math.random() * 1e9) | 0;
    s.lastSafe = 0;
    s.resumeSafe = 0;
    s.bossSanctuaryUnlocked = s.resumeAtBoss = s.finalBossDefeated = false;
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
    this.syncAudioState();
    this.input.clearAll();
    // 저장된 진행으로 월드 재구성(새로 시작 후 타이틀로 나온 경우 대비)
    this.buildWorld();
    this.screens.showTitle();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.syncAudioState();
    this.input.clearAll();
    this.screens.showPause();
  }

  resume() { if (this.state === 'paused') { this.state = 'play'; this.syncAudioState(); } }

  restartFromFloor(k, bossPrep = false) {
    if (!['title', 'paused'].includes(this.state) || !Number.isInteger(k) || k < 0 || k > this.save.lastSafe) return false;
    if (bossPrep && !this.save.bossSanctuaryUnlocked) return false;
    this.save.resumeSafe = k;
    this.save.resumeAtBoss = bossPrep;
    this.markDirty(true);
    // 다시 도전: 좀비·공중 코인·회복 아이템이 되살아난 타워로 다시 만든다
    this.buildWorld();
    this.input.clearAll();
    this.screens.hide();
    this.startRun(true);
    return true;
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.save.muted = this.audio.muted;
    setSoundIcon(this.hud.el.mute, this.audio.muted);
    this.markDirty(true);
  }

  syncAudioState() { this.audio.setPlaying(['play', 'dead', 'modal'].includes(this.state)); }

  setAudioVolume(channel, volume) {
    this.audio.unlock();
    this.audio.setVolume(channel, volume);
    this.save[`${channel}Volume`] = this.audio[`${channel}Volume`];
    this.markDirty(true);
  }

  applyGraphicsLighting() {
    const classic = this.save.graphicsStyle === 'classic';
    this.renderer.shadowMap.enabled = !classic;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMappingExposure = classic ? 0.9 : 1.0;
    this.scene.environment = this.lobby.scene.environment = classic ? null : this.environment.texture;
  }

  toggleGraphicsStyle() {
    this.setGraphicsStyle(this.save.graphicsStyle === 'classic' ? 'polished' : 'classic');
  }

  setGraphicsStyle(style) {
    if (!['polished', 'classic'].includes(style) || style === this.save.graphicsStyle) return;
    this.save.graphicsStyle = style;
    setModelStyle(style);
    // Rebuild only render objects. Platform state, enemies, inventory and camera survive.
    this.world.dispose();
    this.world = new WorldView(this.scene, this.tower, { touchDevice: this.touchDevice });
    this.world.setActiveStage(this.bandStage);
    for (const k of this.save.openedChests) this.world.setChestOpened(k, true);
    this.player.setGraphicsStyle();
    for (const z of this.zombies) if (!z.removed) z.setGraphicsStyle();
    for (const pickup of this.pickups) {
      const next = ['coin', 'aircoin'].includes(pickup.type) ? makeCoin()
        : pickup.type === 'water' ? makeWaterPickup() : makeHealPickup();
      next.position.copy(pickup.mesh.position);
      next.rotation.copy(pickup.mesh.rotation);
      next.visible = pickup.mesh.visible;
      pickup.mesh.removeFromParent();
      disposeWorld(pickup.mesh);
      pickup.mesh = next;
      this.scene.add(next);
    }
    this.lava.setGraphicsStyle(style);
    disposeWorld(this.lobby.scene);
    this.lobby = new Lobby();
    this.lobby.resize(window.innerWidth, window.innerHeight);
    this.lobby.scene.environmentIntensity = 0.65;
    this.applyGraphicsLighting();
    this.hud.setGraphicsStyle(style);
    this.markDirty(true);
    this.hud.toast(style === 'classic' ? '초기 블록 그래픽' : '현재 그래픽', 1100);
  }

  setStickMode(mode) {
    this.save.stickMode = mode === 'fixed' ? 'fixed' : 'float';
    this.input.setFloating(this.save.stickMode === 'float');
    this.markDirty(true);
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
    const dt = Math.max(0, Math.min(0.1, now - (this.lastNow || now))); // 시계가 거꾸로 가도 안전
    this.lastNow = now;
    this.nowSec = now;
    this.syncAudioState();

    if (this.bossIntro && this.state === 'play') {
      // 보스 등장 연출: 게임 시간은 멈추고 카메라만 보스를 비춘다
      this.bossIntro.t -= dt;
      this.acc = 0;
      if (this.bossIntro.t <= 0) this.endBossIntro();
    } else if (!this.manualStep && (this.state === 'play' || this.state === 'dead')) {
      if (this.hitstop > 0) {
        // 히트스톱: 게임 시간만 잠깐 멈추고 화면 흔들림·파티클은 계속 그린다
        this.hitstop = this.hitstop - dt > 0.002 ? this.hitstop - dt : 0;
        this.acc = 0;
      } else {
        // 보스 격파 직후 잠깐 슬로모션
        if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - dt);
        this.acc += dt * (this.slowmo > 0 ? 0.3 : 1);
        let n = 0;
        while (this.acc >= PHYS.fixedDt && n < 12) {
          this.step(PHYS.fixedDt);
          this.acc -= PHYS.fixedDt;
          n++;
          if (this.hitstop > 0) { this.acc = 0; break; }
        }
        if (n >= 12) this.acc = 0;
      }
    } else {
      this.acc = 0;
    }
    this.updateView(dt, now);
    // 태블릿: 그림자 지도를 2프레임(느려지면 3프레임)에 한 번만 갱신해 그림자 패스 비용을 줄인다
    if (this.touchDevice && this.renderer.shadowMap.enabled) {
      this._shadowFrame = (this._shadowFrame || 0) + 1;
      const every = this._frameEma > 0.024 ? 3 : 2;
      this.renderer.shadowMap.autoUpdate = false;
      if (this._shadowFrame % every === 0) this.renderer.shadowMap.needsUpdate = true;
    }
    if (this.state === 'title') {
      this.lobby.update(now, this.reducedMotion);
      this.renderScene(this.lobby.scene, this.lobby.camera);
    } else this.renderScene(this.scene, this.camera);
    this.adaptResolution(dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  renderScene(scene, camera) {
    this.sceneRenderer.render(scene, camera, this.save.graphicsStyle !== 'classic' && this.ratio > 0.75);
  }

  /** 프레임이 느리면 해상도를 낮추고, 여유 있으면 다시 올린다 (오래된 아이패드 대비) */
  adaptResolution(dt) {
    if (dt <= 0 || dt > 0.25) return;
    this._frameEma += (dt - this._frameEma) * 0.05;
    this._adaptT += dt;
    if (this._adaptT < 1.5) return;
    this._adaptT = 0;
    let r = this.ratio;
    // Recover on 60 Hz screens too, after three stable windows to avoid flicker.
    this._recoverT = this._frameEma < 0.018 ? (this._recoverT || 0) + 1.5 : 0;
    if (this._frameEma > 0.024 && r > 0.75) r = Math.max(0.75, r - 0.25);
    else if (this._recoverT >= 4.5 && r < this.maxRatio) { r = Math.min(this.maxRatio, r + 0.25); this._recoverT = 0; }
    if (r !== this.ratio) {
      this.ratio = r;
      this.renderer.setPixelRatio(r);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.sceneRenderer?.setSize();
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
    P.abilities = this.save.abilities;
    const plats = this.near(b.y);
    P.update(dt, this.input, this.cam, plats);
    if (P.events.jumped) {
      if (vanishingIn(P.lastGround, this.time) <= THRILL.lastSecond) this.onNearMiss('platform');
      this.audio.play('jump');
      this.fx.ring(b.x, b.y, b.z, 0.85, this.trailColor(), 0.32, true);
      this.fx.burst(b.x, b.y + 0.05, b.z, this.trailColor(0.15), 6, 1.7, 0.32, 0.09);
    }
    if (P.events.doubleJumped) {
      this.audio.play('jump2');
      this.fx.ring(b.x, b.y, b.z, 1.2, this.trailColor(), 0.3, true);
      this.fx.burst(b.x, b.y + 0.1, b.z, this.trailColor(0.3), 8, 2.4, 0.35, 0.08);
    }
    if (P.events.dashed) {
      this.audio.play('dash');
      this.fx.burst(b.x, b.y + 0.9, b.z, this.trailColor(), 10, 2.5, 0.3, 0.1);
      this.fx.line(b.x, b.y + 0.9, b.z, b.x - P.dashDir.x * 2.5, b.y + 0.9, b.z - P.dashDir.z * 2.5, this.trailColor(0.5), 0.12, 0.2);
    }
    if (P.events.landed) {
      this.audio.play('land');
      this.fx.ring(b.x, b.y, b.z, 1.05, 0xffffff, 0.25, true);
    }
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
      if (this.dormant(z, b)) continue;
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
    if (this.state === 'play' && P.alive) {
      const rising = this.lava.state === 'rising' && this.lava.delay <= 0;
      if (this.lavaEscape.update(b.y - this.lava.y, rising, this.lava.state === 'idle')) this.onNearMiss('lava');
    }
    this.combo.update(dt);
    this.nearT = Math.max(0, this.nearT - dt);
    this.updateItemEffects(dt);
    this.specialWindow = Math.max(0, this.specialWindow - dt);
    if ((this._achT += dt) > 0.5) { this._achT = 0; this.checkAchievements(); }
    if (this.run && !this.playerSafe) this.run.t += dt;
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

  /** 멀리서 가만히 서 있는 몬스터는 플레이어가 다가올 때까지 계산을 건너뛴다 */
  dormant(z, pb) {
    if (z.dead || z.alerted || z.spotted || z.climber || z.state !== 'idle') return false;
    const b = z.body;
    if (!b.grounded || (b.ground && (b.ground.blink || b.ground.motion || b.ground.type === 'falling'))) return false;
    if (Math.abs(z.kn.x) + Math.abs(z.kn.z) > 0.01 || z.burnT > 0) return false;
    const dx = b.x - pb.x; const dy = b.y - pb.y; const dz = b.z - pb.z;
    return dx * dx + dy * dy + dz * dz > 18 * 18;
  }

  // ------------------------------------------------------------------
  // 발판 이벤트
  // ------------------------------------------------------------------
  onLand(p) {
    if (p.type === 'sanctuary') {
      this.resetToSafe(9, p);
      this.curGround = p;
      this.save.bossSanctuaryUnlocked = this.save.resumeAtBoss = true;
      this.save.resumeSafe = 9;
      this.markDirty(true);
      this.hud.toast('❄️ 보스 직전 저장 완료! 회복·강화 후 다음 발판에서 최종 결전', 3000);
      this.audio.play('safe');
    } else if (p.type === 'safe') {
      this.enterSafe(p);
    } else {
      this.playerSafe = false;
      if (p.stage >= 1 && (!this.run || this.run.stage !== p.stage)) this.startStageRun(p.stage);
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
      if (p === this.tower.finalArena) {
        this.finalBattle = !this.save.finalBossDefeated;
        this.checkpoint = this.tower.bossSanctuary;
        this.lava.setIdle(p.maxY - LAVA.startGap);
        if (this.finalBattle) {
          const fb = this.zombies.find((z) => z.def.finalBoss && !z.dead);
          if (fb) this.startBossIntro(fb, '최종 결전');
        }
      } else if (p.checkpoint && this.checkpoint !== p) {
        this.checkpoint = p;
        this.hud.toast('🚩 체크포인트', 900);
        this.audio.play('checkpoint');
      }
    }
  }

  enterSafe(p) {
    const k = p.safe.stage;
    if (k === TOWER.stages && !this.save.finalBossDefeated) {
      this.resetToSafe(9, this.tower.bossSanctuary);
      this.hud.toast('정상을 해방하려면 최종 보스를 먼저 쓰러뜨리세요!', 2400);
      return;
    }
    this.playerSafe = true;
    this.safeIdx = k;
    this.activeSafe = p;
    this.finalBattle = false;
    this.bandStage = k;
    this.world.setActiveStage(k);
    this.checkpoint = p;
    this.hud.setStage(k === 0 ? '출발' : (k === TOWER.stages ? '정상!' : `안전구역 ${k}`));
    this.lava.setIdle(p.maxY - LAVA.startGap);
    this.player.heal(this.player.maxHp);
    this.water.charges = Math.max(this.water.charges, LAVA.waterCharges);
    this.stageCoins = 0;
    this.save.resumeSafe = k;
    this.save.resumeAtBoss = false;
    if (k > this.save.lastSafe) {
      const reward = ECON.floorReward(k);
      this.save.coins += reward;
      this.hud.setCoins(this.save.coins);
      this.save.lastSafe = k;
      this.save.best = Math.max(this.save.best || 0, k);
      this.markDirty(true);
      this.audio.play('safe');
      this.fx.confetti(p.x, p.maxY + 1.5, p.z);
      this.fx.ring(p.x, p.maxY, p.z, 4.5, 0xb8ffe0, 0.9, true);
      if (k === TOWER.stages) {
        this.hud.toast('🚁 정상 도착!', 2500);
        this.save.cleared = true;
        this.rec('clears');
        this.markDirty(true);
        setTimeout(() => {
          if (this.state === 'play') { this.state = 'clear'; this.input.clearAll(); this.screens.showClear({ ...this.stats, bestCombo: this.combo.best, coins: this.save.coins }); }
        }, 2200);
      } else {
        this.hud.toast(`✅ ${k}층 클리어! +${reward} 코인 · 상자를 열어보자`, 2400);
      }
    } else {
      this.markDirty();
    }
    this.finishStageRun(k);
  }

  startStageRun(stage) {
    const st = this.tower.stages.find((x) => x.index === stage);
    if (!st) return;
    this.run = new StageRun(stage, st.platforms.length, !!st.boss, st.aircoins.length);
  }

  /** 층 결과: 별 판정 → 새 별 보상 → 결과 카드 */
  finishStageRun(k) {
    const r = this.run;
    if (!r || r.stage !== k) return;
    this.run = null;
    const s = this.save;
    const res = r.settle(s.stars[k] || 0);
    s.stars[k] = res.total;
    const prevBest = s.bestTimes[k] || 0;
    const newBest = !prevBest || r.t < prevBest;
    if (newBest) s.bestTimes[k] = Math.round(r.t * 10) / 10;
    if (res.reward) {
      s.coins += res.reward;
      this.hud.setCoins(s.coins);
    }
    this.markDirty(true);
    this.hud.showStageResult({
      stage: k, t: r.t, par: r.par, hits: r.hits, air: r.air, airTotal: r.airTotal,
      airNeed: Math.ceil(r.airTotal * STARS.airRate), maxHits: STARS.maxHits,
      mask: res.mask, total: res.total, gained: res.gained, reward: res.reward,
      best: s.bestTimes[k], newBest: newBest && !!prevBest,
    });
    if (res.gained) this.audio.play('star');
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
    this.rec('deaths');
    if (this.run) this.run.hits++;
    this.resetCharge();
    this.endItemEffects();
    this.combo.reset();
    this.lavaEscape.reset();
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
    if (cp.type === 'sanctuary') {
      this.resetToSafe(9, cp);
      this.state = 'play';
      this.input.clearAll();
      this.refreshSlots();
      for (const a of this.acids) { this.scene.remove(a.mesh); disposeWorld(a.mesh); }
      this.acids = [];
      const boss = this.zombies.find((z) => z.def.finalBoss && !z.dead);
      if (boss) boss.resetForBattle();
      this.hud.toast('❄️ 보스 앞 안전구역에서 재도전!', 1800);
      return;
    }
    P.reset(cp.x, cp.maxY + 0.05, cp.z, Math.atan2(cp.next.x, cp.next.z));
    this.curGround = null;
    this.pending = null;
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
  }

  switchSlot(i) {
    const uid = this.save.equipped[i];
    if (!uid || i === this.slot) return;
    this.slot = i;
    this.pending = null;
    this.resetCharge(true);
    this.player.setWeapon(this.currentWeapon);
    this.audio.play('ui');
  }

  updateCombat(dt) {
    const P = this.player;
    this.cd = Math.max(0, this.cd - dt);
    const s = this.input.consumeSlot();
    if (s >= 0) this.switchSlot(s);
    if (this.input.consumeWater()) this.useWater();
    const item = this.input.consumeItem();
    if (item) this.useItem(item);

    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { this.applyMelee(this.pending); this.pending = null; }
    }

    const w = this.currentWeapon;
    const pressed = this.input.consumeAttack();
    const released = this.input.consumeAttackRelease();
    this.specialCd = Math.max(0, this.specialCd - dt);
    if (this.special) updateSpecial(this, dt);
    if (!w || !P.alive) { this.charge = 0; return; }

    // 차지: 누르고 있는 동안 게이지가 차고(일반 공격은 계속), 다 찬 뒤 떼면 필살기
    if (this.input.attackHeld && this.specialCd <= 0 && !this.special) {
      const before = this.charge;
      this.charge = Math.min(CHARGE.time, this.charge + dt);
      if (before < CHARGE.time && this.charge >= CHARGE.time) this.onChargeReady(w);
    }
    if (released) {
      if (this.charge >= CHARGE.time && !this.special) {
        this.specialCd = CHARGE.cooldown;
        this.cd = Math.max(this.cd, 0.25);
        this.pending = null;
        startSpecial(this, w);
        this.specialWindow = (WEAPONS[w.kind].special.duration || 0) + 0.5;
        this.specialKills = 0;
      }
      this.charge = 0;
    }
    if (!this.special && (pressed || this.input.attackHeld) && this.cd <= 0) this.startAttack(w);
  }

  onChargeReady(w) {
    const b = this.player.body;
    this.audio.play('charged');
    this.fx.ring(b.x, b.y + 0.05, b.z, 1.4, 0xffd04a, 0.35, true);
    if (!this._chargeTip) {
      this._chargeTip = true;
      this.hud.toast(`⚡ 손을 떼면 필살기 · ${WEAPONS[w.kind].special.name}`, 1600);
    }
  }

  /** keepCooldown: 무기 교체처럼 게이지만 비우고 재충전 시간은 유지 */
  resetCharge(keepCooldown = false) {
    this.charge = 0;
    this.special = null;
    if (!keepCooldown) this.specialCd = 0;
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
      P.startSwing(Math.min(d.interval, d.windup + 0.3), d.shape === 'line' ? 'line' : 'melee', d.windup);
      this.pending = { t: d.windup, w, yaw: P.facing };
      this.audio.play(d.shape === 'line' ? 'whip' : `swing-${baseWeaponKind(w)}`);
    } else {
      const t = this.findTarget(Math.min(d.range, 24), 45, 7);
      if (t) P.faceDir(t.body.x - b.x, t.body.z - b.z, 0.3);
      else P.faceLock = 0.25;
      this.cd = d.interval;
      P.startSwing(0.18, 'gun');
      this.fireGun(w, d, t);
    }
  }

  applyMelee(pend) {
    const P = this.player;
    const b = P.body;
    const w = pend.w;
    const d = wdef(w);
    if (!P.alive) return;
    const dmg = weaponDamage(w);
    const effect = weaponEffect(w);
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
      this.fx.line(b.x + fx * 0.5, b.y + 1.1, b.z + fz * 0.5, ex, b.y + 0.9, ez, effect.color, 0.09 + effect.strength * 0.025, 0.18);
    } else {
      this.fx.slash(b.x, b.y, b.z, pend.yaw, d.range, d.arc, effect.color);
      if (effect.strength >= 2) this.fx.slash(b.x, b.y + 0.25, b.z, pend.yaw - 0.1, d.range * 0.9, d.arc, effect.color);
    }
    if (effect.strength >= 2) {
      this.fx.burst(b.x + fx * 1.7, b.y + 1, b.z + fz * 1.7, effect.color, 6 + effect.strength * 2, 4, 0.3, 0.09);
      if (effect.strength >= 3) this.fx.ring(b.x + fx * 1.7, b.y, b.z + fz * 1.7, 1 + effect.strength * 0.25, effect.color, 0.3, true);
    }
    if (n > 0) {
      this.cam.shake = Math.max(this.cam.shake, 0.15);
      this.addHitstop(THRILL.hitstop.melee);
    }
  }

  fireGun(w, d, target) {
    const P = this.player;
    const b = P.body;
    const fx = Math.sin(P.facing);
    const fz = Math.cos(P.facing);
    // Muzzle and traces originate at the rendered barrel, including fused models.
    P.syncVisual(0, this.near(b.y), this.time);
    P.root.updateMatrixWorld(true);
    const muzzle = P.weaponMesh?.userData.muzzle?.clone();
    if (muzzle) P.weaponMesh.localToWorld(muzzle);
    const ox = muzzle?.x ?? b.x + fx * 0.5;
    const oy = muzzle?.y ?? b.y + 1.25;
    const oz = muzzle?.z ?? b.z + fz * 0.5;
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
    const effect = weaponEffect(w);
    this.audio.play(baseWeaponKind(w));
    this.fx.burst(ox, oy, oz, effect.color, 4 + effect.strength * 2, 3, 0.16, 0.1 + effect.strength * 0.012);
    this.fx.line(ox, oy, oz, ox + dirx * 0.6, oy + diry * 0.6, oz + dirz * 0.6, 0xffffff, 0.12 + effect.strength * 0.02, 0.055);
    this.cam.shake = Math.max(this.cam.shake, baseWeaponKind(w) === 'shotgun' ? 0.18 : 0.035);
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
      this.fx.line(ox, oy, oz, ox + dx * tMax, oy + dy * tMax, oz + dz * tMax, effect.color, 0.045 + effect.strength * 0.018, 0.09 + effect.strength * 0.015);
      if (hitZ) {
        this.hitZombie(hitZ, dmg, { kx: dx, kz: dz, knock: d.knockback, burn, weapon: w });
        if (effect.strength >= 2) this.fx.burst(ox + dx * tMax, oy + dy * tMax, oz + dz * tMax, effect.color, 3, 3, 0.25, 0.09);
      }
    }
  }

  hitZombie(z, dmg, o) {
    const zb = z.body;
    const pb = this.player.body;
    o.fromAbove = !pb.grounded && pb.y > zb.y + 0.6; // 점프해서 위에서 치면 방패를 넘는다
    const crit = rollCrit();
    if (crit) dmg *= THRILL.critMult;
    const killed = z.takeDamage(this, dmg, o);
    const top = { x: zb.x, y: zb.y + z.def.height + 0.3, z: zb.z };
    if (o.blocked) {
      this.hud.floater(top, `막힘 ${Math.round(dmg * 0.15)}`, '#b9cadb', 1);
      this.fx.burst(zb.x + Math.sin(z.facing) * 0.6, zb.y + z.def.height * 0.5, zb.z + Math.cos(z.facing) * 0.6, 0xe8f4ff, 5, 4, 0.25, 0.08);
      if (this.time - (this._blockSfxT ?? -1) > 0.08) { this._blockSfxT = this.time; this.audio.play('block'); }
      if (!this._blockTip) { this._blockTip = true; this.hud.toast('🛡 방패에 막혔다! 옆·뒤로 돌거나 점프해서 공격', 2200); }
      return;
    }
    if (crit) {
      this.hud.floater(top, `치명타 ${Math.round(dmg)}`, '#ffb020', 1.6, 900);
      this.fx.burst(zb.x, zb.y + z.def.height * 0.6, zb.z, 0xffd04a, 9, 5.5, 0.4, 0.13);
      this.fx.ring(zb.x, zb.y + z.def.height * 0.5, zb.z, 1.4, 0xffd04a, 0.22, true);
      this.cam.shake = Math.max(this.cam.shake, 0.3);
      this.addHitstop(THRILL.hitstop.crit);
      if (this.time - (this._critSfxT ?? -1) > 0.06) { this._critSfxT = this.time; this.audio.play('crit'); }
    } else {
      this.hud.floater(top, Math.round(dmg), killed ? '#ffd04a' : '#fff', killed ? 1.3 : 1);
    }
    this.fx.burst(zb.x, zb.y + z.def.height * 0.6, zb.z, 0x6fa05a, 4, 3.5, 0.35, 0.12);
    this.audio.playImpact(o.weapon || this.currentWeapon, killed);
  }

  /** 폭탄 망자 폭발. self: 스스로 자폭(범위 전체), 아니면 처치당해 터짐(플레이어 피해 범위·피해 축소) */
  explode(src, self) {
    const b = src.body;
    const R = src.def.blast;
    src.exploded = true;
    this.audio.play('boom');
    this.fx.burst(b.x, b.y + 0.8, b.z, 0xff7a1a, 22, 8, 0.7, 0.16);
    this.fx.burst(b.x, b.y + 0.8, b.z, 0x3a3340, 12, 5, 0.9, 0.2);
    this.fx.ring(b.x, b.y + 0.05, b.z, R, 0xffb04a, 0.35, true);
    this.cam.shake = Math.max(this.cam.shake, 0.7);
    this.addHitstop(0.08);
    const dmg = src.dmg * 4;
    let chainKills = 0;
    for (const z of this.zombies) {
      if (z === src || z.dead || z.removed) continue;
      const zb = z.body;
      const dx = zb.x - b.x;
      const dz = zb.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist > R + z.def.radius || Math.abs(zb.y - b.y) > 2.5) continue;
      const l = dist || 1;
      const killed = z.takeDamage(this, dmg, { kx: dx / l, kz: dz / l, knock: 10, blast: true });
      if (killed) chainKills++;
      this.hud.floater({ x: zb.x, y: zb.y + z.def.height + 0.3, z: zb.z }, Math.round(dmg), killed ? '#ffd04a' : '#ffb070', 1.2);
    }
    this.recMax('bestChain', chainKills);
    const P = this.player;
    const pb = P.body;
    if (P.alive && Math.hypot(pb.x - b.x, pb.z - b.z) < (self ? R : R * 0.7) && Math.abs(pb.y - b.y) < 2) {
      const pd = src.dmg * (self ? 1 : 0.6);
      if (P.hurt(pd, b.x, b.z, 12)) this.onPlayerHurt(pd);
    }
  }

  onBossSpotted(z) {
    if (z.def.captain) {
      this.hud.toast(`⚠️ ${z.def.name} 등장!`, 1800);
      this.audio.play('warn');
    } else this.startBossIntro(z, `${z.stage}층 보스`);
  }

  // ------------------------------------------------------------------
  // 보스 연출
  // ------------------------------------------------------------------
  startBossIntro(z, label) {
    if (this.bossIntro) return;
    this.bossIntro = { z, t: 2.1 };
    const pb = this.player.body;
    z.facing = Math.atan2(pb.x - z.body.x, pb.z - z.body.z); // 보스가 플레이어를 노려본다
    this.input.clearAll();
    this.hud.bossIntro(label, z.def.name, z.def.intro || '');
    this.audio.play('bossroar');
    this.cam.shake = Math.max(this.cam.shake, 0.6);
  }

  endBossIntro() {
    const z = this.bossIntro.z;
    this.bossIntro = null;
    this.hud.bossIntroEnd();
    const b = this.player.body;
    const dx = z.body.x - b.x;
    const dz = z.body.z - b.z;
    const l = Math.hypot(dx, dz) || 1;
    this.cam.dist = 8.3;
    this.cam.snapTo(b, { x: dx / l, z: dz / l });
    this.player.faceDir(dx, dz, 0.3);
  }

  /** 등장 연출 중 카메라: 플레이어 뒤에서 보스를 크게 비춘다 */
  bossIntroCamera(dt) {
    const z = this.bossIntro.z;
    const b = this.player.body;
    const zb = z.body;
    const dx = zb.x - b.x;
    const dz = zb.z - b.z;
    // 플레이어 쪽에서, 플레이어보다 보스에 가까이 다가가 올려다보듯 비춘다 → 사이의 기둥에 가리지 않는다
    const want = Math.atan2(dx, dz);
    let diff = want - this.cam.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const k = 1 - Math.exp(-5 * dt);
    this.cam.yaw += diff * k;
    this.cam.pitch += (0.08 - this.cam.pitch) * k;
    const gap = Math.hypot(dx, dz);
    this.cam.dist += (Math.max(5, Math.min(gap * 0.75, 4 + z.def.height * 1.4)) - this.cam.dist) * k;
    const tx = zb.x;
    const ty = zb.y + z.def.height * 0.5;
    const tz = zb.z;
    this.cam.target.x += (tx - this.cam.target.x) * k;
    this.cam.target.y += (ty - this.cam.target.y) * k;
    this.cam.target.z += (tz - this.cam.target.z) * k;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.5);
    this.cam._apply(dt, 0);
  }

  // ------------------------------------------------------------------
  // 업적·기록
  // ------------------------------------------------------------------
  rec(key, n = 1) { this.save.record[key] = (this.save.record[key] || 0) + n; }
  recMax(key, v) { if (v > (this.save.record[key] || 0)) this.save.record[key] = v; }

  checkAchievements() {
    const got = unlockNew(this.save);
    if (!got.length) return;
    for (const a of got) {
      this.save.coins += a.reward;
      this.hud.showAchievement(a);
    }
    this.hud.setCoins(this.save.coins);
    this.audio.play('achieve');
    this.markDirty(true);
  }

  setTitle(t) {
    this.save.title = t || '';
    this.hud.setTitle(this.save.title);
    this.markDirty(true);
  }

  // ------------------------------------------------------------------
  // 꾸미기
  // ------------------------------------------------------------------
  /** 산 적 없으면 코인으로 사고, 이미 있으면 바로 장착 */
  buyOrEquipCosmetic(kind, id) {
    const c = cosmetic(kind, id);
    const s = this.save;
    if (!c) return false;
    const key = `${kind}:${id}`;
    if (!s.cosmetics.owned.includes(key)) {
      if (s.coins < c.cost) return false;
      s.coins -= c.cost;
      s.cosmetics.owned.push(key);
      this.hud.setCoins(s.coins);
      this.audio.play('upgrade');
    } else this.audio.play('ui');
    s.cosmetics[kind] = id;
    this.player.setLook(s.cosmetics);
    if (this.invisibleT > 0) this.player.setGhost(true);
    this.markDirty(true);
    return true;
  }

  /** 점프·대시 효과 색 (꾸미기). 무지개는 시간에 따라 바뀐다 */
  trailColor(lighten = 0) {
    const c = cosmetic('trail', this.save.cosmetics.trail) || COSMETICS.trail.list[0];
    const col = this._trailCol || (this._trailCol = new THREE.Color());
    if (c.hex === null) col.setHSL((this.time * 0.6) % 1, 0.9, 0.62 + lighten * 0.3);
    else col.setHex(c.hex).lerp(new THREE.Color(0xffffff), lighten);
    return col.getHex();
  }

  /** 좀비 하나를 지정 위치에 만들어 바로 플레이어를 쫓게 한다 */
  spawnZombieAt(type, src, x, z) {
    const sb = src.body;
    const nz = new Zombie(this, type, src.stage, { x, y: sb.y + 0.2, z, platform: sb.ground || src.home });
    nz.stageIdx = src.stageIdx;
    nz.alerted = true;
    this.zombies.push(nz);
    return nz;
  }

  /** 분열 망자가 쓰러지면 꼬마 망자로 갈라진다 */
  spawnSplit(src) {
    const s = src.def.split;
    const b = src.body;
    for (let i = 0; i < s.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const m = this.spawnZombieAt(s.type, src, b.x + Math.cos(a) * 0.4, b.z + Math.sin(a) * 0.4);
      m.kn.x = Math.cos(a) * 4;
      m.kn.z = Math.sin(a) * 4;
      m.body.vy = 5;
    }
    this.fx.burst(b.x, b.y + 1, b.z, 0x9fbf5a, 12, 4, 0.5, 0.12);
  }

  /** 역병 여왕의 졸개 소환 */
  spawnMinions(src) {
    const s = src.def.summon;
    const alive = this.zombies.filter((z) => z.summoner === src && !z.dead).length;
    const n = Math.min(s.count, s.max - alive);
    if (n <= 0) return;
    const b = src.body;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const m = this.spawnZombieAt(s.type, src, b.x + Math.cos(a) * 2.2, b.z + Math.sin(a) * 2.2);
      m.summoner = src;
      this.fx.burst(m.body.x, m.body.y + 0.5, m.body.z, 0xb98aff, 8, 3, 0.5, 0.1);
    }
    this.fx.ring(b.x, b.y + 0.05, b.z, 3, 0xb98aff, 0.6, true);
    this.audio.play('zgrowl');
  }

  /** 주술 망자: 주변 좀비 회복(보스 제외) */
  healZombies(src) {
    const h = src.def.heal;
    const b = src.body;
    let any = false;
    for (const z of this.zombies) {
      if (z.dead || z.removed || z.def.boss || z.hp >= z.maxHp) continue;
      const zb = z.body;
      if (Math.hypot(zb.x - b.x, zb.z - b.z) > h.radius || Math.abs(zb.y - b.y) > 3) continue;
      const amt = Math.min(z.maxHp - z.hp, z.maxHp * h.pct);
      z.hp += amt;
      any = true;
      this.hud.floater({ x: zb.x, y: zb.y + z.def.height + 0.3, z: zb.z }, `+${Math.round(amt)}`, '#7dff9a', 0.9);
    }
    if (!any) return;
    this.fx.ring(b.x, b.y + 0.05, b.z, h.radius, 0x7dff9a, 0.5, true);
    this.fx.burst(b.x, b.y + 2, b.z, 0x8dffb0, 8, 2.5, 0.5, 0.1);
  }

  onGoldenSpotted() {
    this.hud.toast('💰 황금 망자 발견! 도망가기 전에 잡아라', 1800);
    this.audio.play('gold');
  }

  onGoldenEscaped(z) {
    const b = z.body;
    this.fx.burst(b.x, b.y + 1, b.z, 0xffd24a, 16, 4, 0.8, 0.12);
    z.die(this, { silent: true });
    z.dying = 1.2; // 쓰러지지 않고 바로 사라짐
    z.root.visible = false;
    this.hud.toast('황금 망자가 사라졌다…', 1400);
  }

  addHitstop(t) {
    this.hitstop = Math.min(THRILL.hitstop.max, Math.max(this.hitstop, t));
  }

  /** 아슬아슬 보너스: kind = 'lava' | 'platform' | 'spinner' */
  onNearMiss(kind) {
    const P = this.player;
    if (!P.alive || this.state !== 'play' || this.nearT > 0) return;
    this.nearT = THRILL.nearMissCooldown;
    const reward = Math.round(THRILL.nearMissReward(Math.max(1, this.bandStage)) * (kind === 'lava' ? 2 : 1));
    this.save.coins += reward;
    this.stageCoins += reward;
    this.stats.nearMisses++;
    this.rec('nearMisses');
    this.markDirty();
    this.hud.setCoins(this.save.coins);
    const b = P.body;
    const label = kind === 'lava' ? '용암 탈출!' : '아슬아슬!';
    this.hud.floater({ x: b.x, y: b.y + 2.4, z: b.z }, `${label} +${reward}`, '#7df9ff', 1.5, 1300);
    this.fx.ring(b.x, b.y + 0.1, b.z, 1.8, 0x7df9ff, 0.45, true);
    this.fx.burst(b.x, b.y + 1, b.z, 0xbffcff, 10, 4, 0.5, 0.1);
    this.audio.play('nearmiss');
  }

  onZombieKilled(z, o) {
    this.stats.kills++;
    if (z.def.finalBoss) {
      this.save.finalBossDefeated = true;
      this.finalBattle = false;
      this.markDirty(true);
      this.hud.toast('다음 안전구역에서 성채 해방!', 3500);
      this.audio.play('rare');
      this.fx.confetti(z.body.x, z.body.y + 2, z.body.z);
    }
    const zb = z.body;
    const w = o.weapon || this.currentWeapon;
    const c = this.combo.add();
    this.rec('kills');
    this.recMax('bestCombo', c.count);
    if (this.specialWindow > 0) this.recMax('bestSpecialKills', ++this.specialKills);
    if (z.def.flee) this.rec('goldenKills');
    if (z.def.captain) this.rec('captainKills');
    else if (z.def.boss) {
      this.rec('bossKills');
      if (BOSS_TYPES.includes(z.type) && !this.save.record.bossTypes.includes(z.type)) this.save.record.bossTypes.push(z.type);
      this.slowmo = 1.4;
      this.hud.bossDefeated(z.def.name);
      this.audio.play('victory');
      this.audio.setBossMode(false);
    }
    let total = z.coin;
    if (w && hasPerk(w, 'coin') && !o.burn) total *= 1.15;
    if (!z.def.boss) total *= c.mult;
    if (c.tierUp) {
      const b = this.player.body;
      this.hud.floater({ x: b.x, y: b.y + 2.6, z: b.z }, `${c.count} 콤보! 코인 ×${c.mult}`, '#ffd04a', 1.5, 1300);
      this.audio.play('combo');
    }
    this.addHitstop(z.def.boss ? THRILL.hitstop.boss : THRILL.hitstop.kill);
    total = Math.max(1, Math.round(total));
    const n = Math.max(1, Math.min(6, Math.round(total / 6)));
    let left = total;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.round(total / n);
      left -= v;
      this.spawnCoin(zb.x, zb.y + 0.8, zb.z, v);
    }
    if (w && hasPerk(w, 'lifesteal')) this.player.heal(6);
    if (z.def.flee) {
      this.hud.floater({ x: zb.x, y: zb.y + z.def.height + 0.8, z: zb.z }, `💰 황금 망자 +${total}`, '#ffd84a', 1.5, 1300);
      this.fx.confetti(zb.x, zb.y + 1, zb.z);
      this.audio.play('gold');
    }
    if (Math.random() < 0.08 + (z.def.boss ? 1 : 0)) {
      const mesh = makeHealPickup();
      this.scene.add(mesh);
      this.pickups.push({ type: 'heal', mesh, x: zb.x, y: zb.y, z: zb.z, stage: z.stageIdx ?? 0, fixed: true, taken: false, value: 25, life: 20 });
      mesh.position.set(zb.x, zb.y + 0.9, zb.z);
    }
    this.fx.burst(zb.x, zb.y + 1, zb.z, 0xff7a32, 10, 5, 0.5);
    if (z.def.boss && !z.def.finalBoss) {
      if (z.def.captain) this.hud.toast(`👑 ${z.def.name} 처치!`, 2000);
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
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff823d }));
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
        this.fx.burst(a.x, a.y, a.z, 0xff823d, 5, 3, 0.3);
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
      if (it.taken) { this.scene.remove(it.mesh); disposeWorld(it.mesh); this.pickups.splice(i, 1); continue; }
      if (it.fixed && Math.abs(it.stage - this.bandStage) > 1) { it.mesh.visible = false; continue; }
      it.mesh.visible = true;
      if (it.type === 'coin') {
        it.life -= dt;
        const body = it.body;
        const dx = pb.x - body.x; const dy = pb.y + 0.9 - body.y; const dz = pb.z - body.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < (this.magnetT > 0 ? ITEMS.magnet.radius : 3.6) && P.alive) {
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
        const mag = this.magnetT > 0;
        if (P.alive && Math.hypot(pb.x - it.x, pb.z - it.z) < (mag ? 5 : 1.25) && Math.abs(pb.y + 0.9 - it.y) < (mag ? 4 : 1.6)) {
          it.taken = true;
          this.save.coins += it.value;
          this.stageCoins += it.value;
          this.markDirty();
          this.hud.setCoins(this.save.coins);
          this.audio.play('coin');
          this.fx.burst(it.x, it.y, it.z, 0xffd24a, 5, 3, 0.35, 0.1);
          if (this.run && it.stage === this.run.stage) this.run.air++;
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
    if (this.run) this.run.hits++;
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
    if (this.lava.state !== 'rising' || this.lava.delay > 0 || this.bandStage < 1 || this.playerSafe) return;
    this.climberT -= dt;
    if (this.climberT > 0) return;
    const stage = this.bandStage;
    this.climberT = Math.max(9, 26 - 1.7 * stage);
    if (this.zombies.filter((z) => z.climber && !z.dead).length >= 10) return;
    const b = this.player.body;
    // 용암선 바로 위의 발판에서 출발
    const chain = this.tower.chain;
    let spawn = null;
    for (const p of chain) {
      if (p.type === 'safe' || p.motion || p.type === 'falling') continue;
      if (p.maxY > this.lava.y + 1.2 && p.maxY < this.lava.y + 7 && p.maxY < b.y - 8) spawn = p;
    }
    if (!spawn) return;
    const n = 1 + Math.floor(stage / 2);
    const w = zombieWeights(stage);
    delete w.spitter; delete w.tank; delete w.shaman;
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
      const sz = this.activeSafe;
      const pb = this.player.body;
      if (sz && sz.safe) {
        const near = (pt, r) => Math.hypot(pb.x - pt.x, pb.z - pt.z) < r;
        if (sz.safe.chest && this.safeIdx >= 1 && !this.save.openedChests.includes(this.safeIdx) && near(sz.safe.chest, 5)) {
          buttons.push({ id: 'chest', label: '📦 상자 열기', onTap: () => this.openChestUi(this.safeIdx) });
        }
        if (near(sz.safe.forge, 5.5)) {
          buttons.push({ id: 'forge', label: '⚒ 대장간 · 장비', onTap: () => this.openForgeUi() });
        }
      }
      buttons.push({ id: 'shop', label: '🛒 상점', onTap: () => this.openShopUi() });
    }
    this.hud.setContext(buttons);
  }

  openChestUi(k) {
    if (this.save.openedChests.includes(k)) return;
    this.openModal();
    this.screens.showChest(k);
  }

  openShopUi() {
    this.openModal();
    this.screens.showShop();
  }

  // ------------------------------------------------------------------
  // 상점 아이템
  // ------------------------------------------------------------------
  get invisible() { return this.invisibleT > 0; }

  buyItem(id) {
    const it = ITEMS[id];
    const s = this.save;
    if (!it || s.coins < it.cost || (s.items[id] || 0) >= it.max) return false;
    s.coins -= it.cost;
    s.items[id] = (s.items[id] || 0) + 1;
    this.markDirty(true);
    this.hud.setCoins(s.coins);
    this.audio.play('coin');
    return true;
  }

  useItem(id) {
    const it = ITEMS[id];
    const s = this.save;
    const P = this.player;
    const b = P.body;
    if (!it || !(s.items[id] > 0) || !P.alive || this.state !== 'play') return false;
    if (id === 'potion' && P.hp >= P.maxHp) { this.hud.toast('체력이 가득 찼어요', 800); return false; }
    if (id === 'cloak' && this.invisibleT > 0) return false;
    s.items[id]--;
    this.rec('itemsUsed');
    this.markDirty();
    if (id === 'spring') {
      b.vy = it.power;
      b.grounded = false;
      P.coyote = 0;
      P.airJumped = false; // 스프링 뒤에도 2단 점프 가능
      this.audio.play('spring');
      this.fx.ring(b.x, b.y + 0.05, b.z, 1.6, 0x9ff7c8, 0.4, true);
      this.fx.burst(b.x, b.y + 0.2, b.z, 0xc8ffe0, 12, 4, 0.4, 0.1);
    } else if (id === 'cloak') {
      this.invisibleT = it.time;
      P.setGhost(true);
      this.audio.play('cloak');
      this.fx.burst(b.x, b.y + 1, b.z, 0xbff6ff, 16, 3, 0.6, 0.1);
      this.hud.toast(`👻 ${it.time}초간 투명! 몬스터가 나를 못 본다`, 1500);
    } else if (id === 'potion') {
      const amt = Math.round(P.maxHp * it.heal);
      P.heal(amt);
      this.hud.floater({ x: b.x, y: b.y + 2, z: b.z }, `+${amt}`, '#5dff8a', 1.3);
      this.audio.play('heal');
    } else if (id === 'magnet') {
      this.magnetT = it.time;
      this.audio.play('gold');
      this.fx.ring(b.x, b.y + 0.1, b.z, ITEMS.magnet.radius, 0xffd24a, 0.6, true);
      this.hud.toast(`🧲 ${it.time}초간 코인 자석`, 1300);
    }
    return true;
  }

  updateItemEffects(dt) {
    if (this.invisibleT > 0) {
      this.invisibleT -= dt;
      if (this.invisibleT <= 0) {
        this.invisibleT = 0;
        this.player.setGhost(false);
        this.hud.toast('망토 효과가 끝났다', 900);
      }
    }
    if (this.magnetT > 0) this.magnetT = Math.max(0, this.magnetT - dt);
  }

  endItemEffects() {
    this.invisibleT = 0;
    this.magnetT = 0;
    this.player.setGhost(false);
  }

  openForgeUi() {
    this.openModal();
    this.screens.showForge();
  }

  /** 이동 능력 해금 (대장간) */
  buyAbility(id) {
    const a = ABILITIES[id];
    const s = this.save;
    if (!a || s.abilities[id] || s.coins < a.cost) return false;
    s.coins -= a.cost;
    s.abilities[id] = true;
    this.player.abilities = s.abilities;
    this.markDirty(true);
    this.hud.setCoins(s.coins);
    this.audio.play('upgrade');
    const b = this.player.body;
    this.fx.ring(b.x, b.y + 0.1, b.z, 1.8, 0xbfe9ff, 0.6, true);
    return true;
  }

  rollChest(k) {
    const boss = bossStage(k);
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
    if (w === this.currentWeapon) this.player.setWeapon(w);
    const b = this.player.body;
    const effect = weaponEffect(w);
    this.fx.ring(b.x, b.y + 0.1, b.z, 1.5, effect.color, 0.6, true);
    this.fx.burst(b.x, b.y + 1.3, b.z, effect.color, 12, 3.5, 0.6, 0.1);
    this.markDirty(true);
    this.hud.setCoins(this.save.coins);
    return true;
  }

  fuseWeapon(uids) {
    const w = fuseWeapons(this.save, uids);
    if (!w) return null;
    this.pending = null;
    this.resetCharge(true);
    this.refreshSlots();
    this.markDirty(true);
    this.audio.play('special');
    const b = this.player.body;
    const effect = weaponEffect(w);
    this.fx.ring(b.x, b.y, b.z, 3, effect.color, 0.7, true);
    this.fx.burst(b.x, b.y + 1.1, b.z, effect.color, 32, 5, 0.7, 0.13);
    this.hud.toast(`합성 성공! ${WEAPONS[w.kind].name}`, 2500);
    return w;
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
    s.coins += sellPrice(w);
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
    if (this.state === 'title') {
      // Only the lobby is rendered; leave the hidden tower and enemies asleep.
      this.hud.setVignette(0);
      return;
    }

    this.world.sync(this.time, b, this.lava.y);
    this.fx.update(dt);

    const hint = P.lastGround && P.lastGround.next;
    const mv = this.input.getMove();
    const autoAlign = mv.y > 0.1 && P.alive;
    if (this.bossIntro) this.bossIntroCamera(dt);
    else if (this.state === 'play' || this.state === 'dead' || this.state === 'paused' || this.state === 'modal') {
      this.cam.update(this.state === 'play' || this.state === 'dead' ? dt : 0, b, this.input, hint, autoAlign, now, this.state !== 'dead');
    }
    P.syncVisual(dt, this.near(b.y), this.time);
    const VIEW = 42; // 이보다 먼 일반 몬스터는 그리지 않는다 (보스는 항상)
    for (const z of this.zombies) {
      const active = z.climber || Math.abs(z.stageIdx - this.bandStage) <= 1;
      const zb = z.body;
      const dx = zb.x - b.x; const dy = zb.y - b.y; const dz = zb.z - b.z;
      const near = z.def.boss || dx * dx + dy * dy + dz * dz < VIEW * VIEW;
      const show = near && (active || z.dead);
      z.root.visible = show;
      if (!show) { z.blob.visible = false; z.bar.visible = false; continue; }
      z.syncVisual(dt, this);
    }

    // HUD
    this.hud.setHp(P.hp, P.maxHp);
    const boss = this.finalBattle
      ? this.zombies.find((z) => z.def.finalBoss && !z.dead)
      : this.zombies.find((z) => z.def.boss && !z.def.finalBoss && !z.dead && z.alerted && Math.abs(z.stageIdx - this.bandStage) <= 1);
    this.hud.setBoss(boss || null);
    this.audio.setBossMode(!!boss && !boss.def.captain && this.state !== 'title');
    this.hud.setTitle(this.save.title);
    const gap = b.y - this.lava.y;
    this.hud.setLava(gap, this.lava.state, LAVA.warnGap);
    this.hud.setVignette(this.vig || 0);
    this.hud.setWater(this.water.charges, this.lava.state !== 'idle' && this.water.cd <= 0);
    this.hud.setCoins(this.save.coins);
    this.hud.setCombo(this.combo.count, this.combo.mult, this.combo.left);
    this.hud.setRun(this.playerSafe ? null : this.run, STARS.maxHits);
    this.hud.setCharge(this.charge / CHARGE.time, this.specialCd / CHARGE.cooldown, !!this.special);
    this.hud.setDash(this.save.abilities.dash, P.dashCd > 0 || (P.dashUsed && !b.grounded));
    this.hud.renderItems(this.save.items, this.invisibleT, this.magnetT);
    const eq = this.save.equipped.map((u) => (u ? weaponByUid(this.save, u) : null));
    this.hud.renderSlots(eq, this.slot);
    if (this.debug) {
      this.hud.debug(`fps ${(1 / Math.max(dt, 0.001)).toFixed(0)}  y ${b.y.toFixed(1)}  lava ${this.lava.y.toFixed(1)} (${this.lava.state})\ngap ${gap.toFixed(1)}  stage ${this.bandStage}  zombies ${this.zombies.length}`);
    }
  }
}
