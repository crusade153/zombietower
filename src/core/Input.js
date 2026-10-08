// 터치(십자키·버튼·카메라 드래그) + 키보드(PC 테스트용) 입력
import { ITEM_IDS } from '../config/balance.js';

export class Input {
  constructor() {
    this.dpad = { up: false, down: false, left: false, right: false };
    this.keys = new Set();
    this.jumpHeld = false;
    this.attackHeld = false;
    this.jumpPressed = false; // 한 번 읽으면 소비
    this.attackPressed = false;
    this.attackReleased = false; // 실제로 손을 뗀 순간만 (clearAll로는 켜지지 않음)
    this.waterPressed = false;
    this.dashPressed = false;
    this.itemPressed = null;
    this.slotPressed = -1;
    this.interactPressed = false;
    this.camDX = 0;
    this.camDY = 0;
    this.lastCamDrag = -999;
    this.enabled = true;
    this.touchDetected = false;
    this._pointers = new Map(); // 카메라 드래그용 pointerId → last pos
    this._bindDpad();
    this._bindButtons();
    this._bindCamera();
    this._bindKeyboard();
    this._blockGestures();
  }

  /** 카메라 기준 이동 벡터: x=오른쪽(+), y=앞(+) */
  getMove() {
    if (!this.enabled) return { x: 0, y: 0 };
    const k = this.keys;
    const up = this.dpad.up || k.has('KeyW') || k.has('ArrowUp');
    const down = this.dpad.down || k.has('KeyS') || k.has('ArrowDown');
    const left = this.dpad.left || k.has('KeyA') || k.has('ArrowLeft');
    const right = this.dpad.right || k.has('KeyD') || k.has('ArrowRight');
    let x = (right ? 1 : 0) - (left ? 1 : 0);
    let y = (up ? 1 : 0) - (down ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }

  consumeJump() { const v = this.jumpPressed; this.jumpPressed = false; return v; }
  consumeAttack() { const v = this.attackPressed; this.attackPressed = false; return v; }
  consumeAttackRelease() { const v = this.attackReleased; this.attackReleased = false; return v; }
  consumeWater() { const v = this.waterPressed; this.waterPressed = false; return v; }
  consumeDash() { const v = this.dashPressed; this.dashPressed = false; return v; }
  consumeItem() { const v = this.itemPressed; this.itemPressed = null; return v; }
  consumeSlot() { const v = this.slotPressed; this.slotPressed = -1; return v; }
  consumeCam() { const r = { x: this.camDX, y: this.camDY }; this.camDX = 0; this.camDY = 0; return r; }

  clearAll() {
    this.dpad.up = this.dpad.down = this.dpad.left = this.dpad.right = false;
    this.keys.clear();
    this.jumpHeld = this.attackHeld = false;
    this.jumpPressed = this.attackPressed = this.attackReleased = this.waterPressed = this.dashPressed = false;
    this.slotPressed = -1;
    this.itemPressed = null;
    this._pointers.clear();
    this.camDX = this.camDY = 0;
    document.querySelectorAll('#dpad .arm.on, .act-btn.pressed').forEach((e) => e.classList.remove('on', 'pressed'));
  }

  _bindDpad() {
    const el = document.getElementById('dpad');
    const arms = {
      up: el.querySelector('.up'), down: el.querySelector('.down'),
      left: el.querySelector('.left'), right: el.querySelector('.right'),
    };
    let activeId = null;
    const apply = (e) => {
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      const T = 0.26;
      this.dpad.left = nx < -T;
      this.dpad.right = nx > T;
      this.dpad.up = ny < -T;
      this.dpad.down = ny > T;
      for (const k in arms) arms[k].classList.toggle('on', this.dpad[k]);
    };
    const end = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      this.dpad.up = this.dpad.down = this.dpad.left = this.dpad.right = false;
      for (const k in arms) arms[k].classList.remove('on');
    };
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (e.pointerType === 'touch') this.touchDetected = true;
      activeId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      apply(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === activeId) apply(e); });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  _bindButtons() {
    const hold = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      let activeId = null;
      el.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        if (e.pointerType === 'touch') this.touchDetected = true;
        activeId = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
        el.classList.add('pressed');
        onDown();
      });
      const up = (e) => {
        if (e.pointerId !== activeId) return;
        activeId = null;
        el.classList.remove('pressed');
        onUp && onUp();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    };
    hold('btn-jump', () => { this.jumpHeld = true; this.jumpPressed = true; }, () => { this.jumpHeld = false; });
    hold('btn-attack', () => { this.attackHeld = true; this.attackPressed = true; }, () => { if (this.attackHeld) this.attackReleased = true; this.attackHeld = false; });
    hold('btn-water', () => { this.waterPressed = true; });
    hold('btn-dash', () => { this.dashPressed = true; });
    // 아이템 칸도 동적으로 생성되므로 위임
    document.getElementById('item-bar').addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.item-btn');
      if (!btn || !this.enabled) return;
      e.preventDefault();
      this.itemPressed = btn.dataset.id;
    });
    // 무기 슬롯은 동적으로 생성되므로 위임
    document.getElementById('weapon-slots').addEventListener('pointerdown', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      e.preventDefault();
      this.slotPressed = Number(slot.dataset.i);
    });
  }

  _bindCamera() {
    const canvas = document.getElementById('game');
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') this.touchDetected = true;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      this.camDX += e.clientX - p.x;
      this.camDY += e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this.lastCamDrag = performance.now() / 1000;
    });
    const end = (e) => this._pointers.delete(e.pointerId);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'Space': this.jumpHeld = true; this.jumpPressed = true; e.preventDefault(); break;
        case 'KeyJ': case 'KeyK': this.attackHeld = true; this.attackPressed = true; break;
        case 'KeyQ': case 'KeyE': this.waterPressed = true; break;
        case 'ShiftLeft': case 'ShiftRight': case 'KeyL': this.dashPressed = true; break;
        case 'Digit1': this.slotPressed = 0; break;
        case 'Digit2': this.slotPressed = 1; break;
        case 'Digit3': this.slotPressed = 2; break;
        case 'Digit4': case 'Digit5': case 'Digit6': case 'Digit7': this.itemPressed = ITEM_IDS[Number(e.code.slice(5)) - 4]; break;
        case 'KeyF': this.interactPressed = true; break;
        default:
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.jumpHeld = false;
      if ((e.code === 'KeyJ' || e.code === 'KeyK') && this.attackHeld) { this.attackHeld = false; this.attackReleased = true; }
    });
    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearAll(); });
  }

  /** iOS 확대/스크롤/더블탭 방지 */
  _blockGestures() {
    const allowScroll = (t) => t && t.closest && t.closest('.panel');
    document.addEventListener('touchmove', (e) => { if (!allowScroll(e.target)) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
