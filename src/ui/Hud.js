import * as THREE from 'three';
import { WEAPONS, RARITY } from '../config/weapons.js';
import { STARS, ITEMS, ITEM_IDS } from '../config/balance.js';
import { icon } from './icons.js';
import { formatTime, starCount } from '../core/StageRun.js';

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
    this.comboEl = document.createElement('div');
    this.comboEl.id = 'combo';
    this.comboEl.className = 'hidden';
    this.comboEl.innerHTML = '<b></b><span>콤보</span><em></em><div class="combo-track"><i></i></div>';
    $('hud-left').appendChild(this.comboEl);
    this.runEl = document.createElement('div');
    this.runEl.id = 'run-line';
    this.runEl.className = 'hidden';
    $('hud-center').appendChild(this.runEl);
    this.resultEl = document.createElement('div');
    this.resultEl.id = 'stage-result';
    this.el.hud.appendChild(this.resultEl);
    this._resultT = null;
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
    const hp = `${Math.ceil(boss.hp).toLocaleString()} / ${Math.ceil(boss.maxHp).toLocaleString()}`;
    const tip = boss.def.finalBoss ? ` · ${boss.phase === 2 ? '2단계 · 폭주' : '1단계'} · 불길은 점프로 회피`
      : boss.def.summon ? ' · 졸개를 소환한다' : ' · 붉은 원 = 내려찍기, 점프로 피하기';
    this.bossEl.querySelector('small').textContent = hp + tip;
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

  /** 킬 콤보 표시 (2콤보부터). left: 남은 시간 비율 */
  setCombo(count, mult, left) {
    const show = count >= 2;
    this._set('comboShow', show, () => this.comboEl.classList.toggle('hidden', !show));
    if (!show) return;
    this._set('combo', count, () => {
      this.comboEl.querySelector('b').textContent = count;
      this.comboEl.querySelector('em').textContent = mult > 1 ? `코인 ×${mult}` : '';
      this.comboEl.dataset.tier = mult >= 3 ? 3 : mult >= 2 ? 2 : mult > 1 ? 1 : 0;
      this.comboEl.classList.remove('pop');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('pop');
    });
    this._set('comboLeft', Math.round(left * 40), (v) => { this.comboEl.querySelector('i').style.width = `${v * 2.5}%`; });
  }

  /** 왼쪽 아이템 칸: 가진 아이템만 표시. 사용 중인 효과는 남은 시간 */
  renderItems(items, cloakT, magnetT) {
    const bar = this.itemBar || (this.itemBar = document.getElementById('item-bar'));
    const timers = { cloak: cloakT, magnet: magnetT };
    const key = ITEM_IDS.map((id) => `${items[id] || 0}:${Math.ceil(timers[id] || 0)}`).join('|');
    this._set('items', key, () => {
      bar.innerHTML = ITEM_IDS.filter((id) => items[id] > 0 || timers[id] > 0).map((id) => {
        const t = Math.ceil(timers[id] || 0);
        return `<button class="item-btn${t ? ' active' : ''}" data-id="${id}" aria-label="${ITEMS[id].name}">${ITEMS[id].icon}<span>${items[id] || 0}</span>${t ? `<em>${t}s</em>` : ''}</button>`;
      }).join('');
    });
  }

  /** 대시 버튼: 해금해야 보이고, 재사용 대기·공중 사용 후에는 흐리게 */
  setDash(unlocked, cooling) {
    const btn = this.dashBtn || (this.dashBtn = document.getElementById('btn-dash'));
    this._set('dash', `${unlocked}|${cooling}`, () => {
      btn.classList.toggle('hidden', !unlocked);
      btn.classList.toggle('empty', cooling);
    });
  }

  /** 공격 버튼 테두리: 차지 게이지(금색) / 재충전(흰색) / 준비 완료(빛남) */
  setCharge(charge, cool, active) {
    const btn = this.attackBtn || (this.attackBtn = document.getElementById('btn-attack'));
    const ready = charge >= 1;
    const key = `${Math.round(charge * 30)}|${Math.round(cool * 30)}|${active}`;
    this._set('charge', key, () => {
      btn.style.setProperty('--charge', cool > 0 ? (1 - cool).toFixed(3) : charge.toFixed(3));
      btn.classList.toggle('cooling', cool > 0);
      btn.classList.toggle('ready', ready && !active);
    });
  }

  /** 층 도전 중: 시간/목표 · 피격 · 공중 코인 */
  setRun(run, maxHits) {
    const key = run ? `${Math.floor(run.t)}|${run.hits}|${run.air}|${run.par}` : '';
    this._set('run', key, () => {
      this.runEl.classList.toggle('hidden', !run);
      if (!run) return;
      const over = run.t > run.par;
      const hitOver = run.hits > maxHits;
      const need = Math.ceil(run.airTotal * STARS.airRate);
      this.runEl.innerHTML = `<span class="${over ? 'bad' : ''}">⏱ ${formatTime(run.t)}/${formatTime(run.par)}</span>`
        + `<span class="${hitOver ? 'bad' : ''}">💔 ${run.hits}/${maxHits}</span>`
        + (run.airTotal ? `<span class="${run.air >= need ? 'good' : ''}">💰 ${run.air}/${need}</span>` : '');
    });
  }

  /** 층 결과 카드 (몇 초 뒤 자동으로 사라짐) */
  showStageResult(r) {
    const row = (ok, text) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '★' : '☆'} ${text}</li>`;
    const gainedN = starCount(r.gained);
    this.resultEl.innerHTML = `
      <h3>${r.stage}층 결과</h3>
      <div class="stars">${[1, 2, 4].map((b) => `<span class="${r.total & b ? 'on' : ''}${r.gained & b ? ' new' : ''}">★</span>`).join('')}</div>
      <ul>
        ${row(r.mask & 1, `시간 ${formatTime(r.t)} / 목표 ${formatTime(r.par)}${r.newBest ? ' · 최고 기록!' : ''}`)}
        ${row(r.mask & 2, `피격 ${r.hits}회 (${r.maxHits}회 이하)`)}
        ${row(r.mask & 4, r.airTotal ? `공중 코인 ${r.air}/${r.airTotal} (${r.airNeed}개 이상)` : '공중 코인 없음')}
      </ul>
      <p>${gainedN ? `새 별 ${gainedN}개 · <b>+${r.reward} 코인</b>` : `누적 별 ${starCount(r.total)}/3${starCount(r.total) < 3 ? ' · 다시 도전해 나머지 별을 모아보세요' : ' · 완벽!'}`}</p>`;
    this.resultEl.classList.add('show');
    clearTimeout(this._resultT);
    this._resultT = setTimeout(() => this.resultEl.classList.remove('show'), 5500);
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
  floater(pos, text, color = '#fff', size = 1, ms = 800) {
    tmp.set(pos.x, pos.y, pos.z).project(this.g.camera);
    if (tmp.z > 1) return;
    // 한꺼번에 많이 맞을 때(필살기·폭발) 숫자가 쌓여 화면이 느려지지 않게 상한
    if (this.el.floaters.childElementCount > 36) this.el.floaters.firstElementChild.remove();
    const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
    const d = document.createElement('div');
    d.className = 'floater';
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.color = color;
    d.style.fontSize = `calc(var(--u) * ${2.4 * size})`;
    if (ms !== 800) d.style.animationDuration = `${ms}ms`;
    this.el.floaters.appendChild(d);
    setTimeout(() => d.remove(), ms);
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
      e.innerHTML = b.id === 'shop' ? '<span class="icon">🛒</span>' : icon(b.id.includes('forge') ? 'forge' : b.id.includes('chest') ? 'bag' : 'water');
      const label = document.createElement('span');
      label.textContent = b.label.replace(/[📦⚒💧🛒]/gu, '').trim();
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
