import * as THREE from 'three';
import { WEAPONS, RARITY } from '../config/weapons.js';
import { icon } from './icons.js';

const tmp = new THREE.Vector3();

export class Hud {
  constructor(game) {
    this.g = game;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), controls: $('controls'),
      hpFill: $('hp-fill'), hpText: $('hp-text'), coin: $('coin-text'),
      stage: $('stage-text'), lavaFill: $('lava-fill'), lavaGap: $('lava-gap'), lavaMeter: document.querySelector('.lava-meter'),
      vignette: $('vignette'), toast: $('toast'), debug: $('debug'), floaters: $('floaters'),
      slots: $('weapon-slots'), water: $('btn-water'), waterCount: $('water-count'), ctx: $('ctx-buttons'),
      pause: $('btn-pause'), mute: $('btn-mute'), graphics: $('btn-graphics'),
    };
    this._last = {};
    this._toastT = null;
    this._ctxKey = '';
    this.bossEl = document.createElement('div');
    this.bossEl.id = 'boss-health';
    this.bossEl.className = 'hidden';
    this.bossEl.innerHTML = '<b></b><div class="boss-track"><span></span></div><small></small>';
    this.el.hud.appendChild(this.bossEl);
    this.el.pause.innerHTML = icon('pause');
    this.el.pause.title = '일시정지';
    document.querySelector('.lava-ico').innerHTML = icon('flame');
    document.getElementById('btn-jump').innerHTML = `${icon('jump')}<small>점프</small>`;
    document.getElementById('btn-attack').innerHTML = icon('attack');
    this.el.water.firstChild.remove();
    this.el.water.insertAdjacentHTML('afterbegin', icon('water'));
    for (const dir of ['up', 'down', 'left', 'right']) document.querySelector(`#dpad .${dir}`).innerHTML = icon(dir);
  }

  show(v) {
    this.el.hud.classList.toggle('hidden', !v);
    this.el.controls.classList.toggle('hidden', !v);
  }

  setGraphicsStyle(style) {
    const classic = style === 'classic';
    this.el.graphics.textContent = `그래픽 · ${classic ? '블록' : '현재'}`;
    this.el.graphics.setAttribute('aria-label', classic ? '현재 그래픽으로 변경' : '초기 블록 그래픽으로 변경');
    this.el.graphics.setAttribute('aria-pressed', String(classic));
    this.el.graphics.title = classic ? '현재 그래픽으로 변경' : '초기 블록 그래픽으로 변경';
  }

  _set(key, val, fn) {
    if (this._last[key] === val) return;
    this._last[key] = val;
    fn(val);
  }

  setHp(hp, max) {
    const r = Math.max(0, Math.round(hp));
    this._set('hp', `${r}/${max}`, () => {
      this.el.hpFill.style.width = `${Math.max(0, (hp / max) * 100)}%`;
      this.el.hpText.innerHTML = `${icon('heart')} ${r}`;
    });
  }

  setCoins(n) { this._set('coin', Math.floor(n), (v) => { this.el.coin.textContent = v.toLocaleString(); }); }
  setStage(text) { this._set('stage', text, (v) => { this.el.stage.textContent = v; }); }

  setBoss(boss) {
    this.bossEl.classList.toggle('hidden', !boss);
    if (!boss) return;
    this.bossEl.querySelector('b').textContent = boss.def.name;
    this.bossEl.querySelector('span').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
    this.bossEl.querySelector('small').textContent = `${Math.ceil(boss.hp).toLocaleString()} / ${Math.ceil(boss.maxHp).toLocaleString()} · ${boss.phase === 2 ? '2단계 · 폭주' : '1단계'} · 불길은 점프로 회피`;
  }

  /** gap: 플레이어와 용암 높이차(m). mode: 'idle' | 'rising' | 'frozen' */
  setLava(gap, mode, warnGap) {
    const key = `${Math.round(gap)}-${mode}`;
    this._set('lava', key, () => {
      const m = this.el.lavaMeter;
      m.classList.toggle('frozen', mode === 'frozen');
      m.classList.toggle('danger', mode === 'rising' && gap < warnGap);
      this.el.lavaGap.textContent = mode === 'idle' ? '안전' : (mode === 'frozen' ? '❄ 굳음' : `${Math.max(0, Math.round(gap))}m`);
      this.el.lavaFill.style.width = `${Math.max(2, Math.min(100, (gap / 30) * 100))}%`;
    });
  }

  setVignette(v) { this._set('vig', Math.round(v * 20), () => { this.el.vignette.style.opacity = v.toFixed(2); }); }

  setWater(n, ready) {
    this._set('water', `${n}-${ready}`, () => {
      this.el.waterCount.textContent = n;
      this.el.water.classList.toggle('empty', n <= 0 || !ready);
    });
  }

  toast(text, ms = 1600) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  /** 월드 좌표 → 화면 숫자 */
  floater(pos, text, color = '#fff', size = 1) {
    tmp.set(pos.x, pos.y, pos.z).project(this.g.camera);
    if (tmp.z > 1) return;
    const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
    const d = document.createElement('div');
    d.className = 'floater';
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.color = color;
    d.style.fontSize = `calc(var(--u) * ${2.4 * size})`;
    this.el.floaters.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }

  /** 무기 슬롯 3개 렌더 */
  renderSlots(weapons, active) {
    const key = weapons.map((w) => (w ? `${w.uid}.${w.level}` : '-')).join(',') + `|${active}`;
    if (this._slotKey !== key) {
      this._slotKey = key;
      this.el.slots.innerHTML = '';
      weapons.forEach((w, i) => {
        const s = document.createElement('div');
        s.className = `slot${i === active ? ' active' : ''}`;
        s.dataset.i = i;
        if (w) {
          s.style.borderColor = RARITY[w.rarity].color;
          s.innerHTML = `${WEAPONS[w.kind].icon}${w.level ? `<span class="lv">+${w.level}</span>` : ''}<span class="ammo"></span>`;
        } else s.innerHTML = '<span style="opacity:.3">·</span>';
        this.el.slots.appendChild(s);
      });
    }
    // 탄약 표시만 갱신
    weapons.forEach((w, i) => {
      const a = this.el.slots.children[i] && this.el.slots.children[i].querySelector('.ammo');
      if (!a) return;
      const txt = w && WEAPONS[w.kind].kind === 'gun' ? '∞' : '';
      a.title = txt ? '무한 탄약 · 재장전 없음' : '';
      if (a.textContent !== txt) a.textContent = txt;
    });
  }

  /** 문맥 버튼 (상자 열기/대장간) */
  setContext(buttons) {
    const key = buttons.map((b) => b.id).join('|');
    if (key === this._ctxKey) return;
    this._ctxKey = key;
    this.el.ctx.innerHTML = '';
    for (const b of buttons) {
      const e = document.createElement('button');
      e.className = 'ctx-btn';
      e.innerHTML = icon(b.id.includes('forge') ? 'forge' : b.id.includes('chest') ? 'bag' : 'water');
      const label = document.createElement('span');
      label.textContent = b.label.replace(/[📦⚒💧]/gu, '').trim();
      e.appendChild(label);
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); b.onTap(); });
      this.el.ctx.appendChild(e);
    }
  }

  debug(text) {
    this.el.debug.classList.toggle('hidden', !text);
    if (text) this.el.debug.textContent = text;
  }
}
