import { WEAPONS, RARITY, PERK_TEXT } from '../config/weapons.js';
import { ECON } from '../config/balance.js';
import {
  weaponDamage, weaponName, upgradeCost, canUpgrade, sellValue, weaponDps, perks, chestOdds,
} from '../combat/Weapons.js';
import { weaponByUid } from '../core/Save.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString();

export class Screens {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById('screen');
    this.sel = null;
    this.mode = null;
    this.chestStage = 0;
    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || t.hasAttribute('disabled')) return;
      this.g.audio.unlock();
      this.g.audio.play('ui');
      this.onAct(t.dataset.act, t.dataset);
    });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  _show(html) {
    this.el.innerHTML = html;
    this.el.classList.remove('hidden');
    this.el.scrollTop = 0;
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    this.mode = null;
  }

  onAct(act, data) {
    const g = this.g;
    switch (act) {
      case 'continue': this.hide(); g.startRun(true); break;
      case 'new': this.hide(); g.startRun(false); break;
      case 'start': this.hide(); g.startRun(true); break;
      case 'diff': g.setDifficulty(data.v); this.showTitle(); break;
      case 'close': this.hide(); g.closeModal(); break;
      case 'resume': this.hide(); g.resume(); break;
      case 'mute': g.toggleMute(); this.showPause(); break;
      case 'title': this.hide(); g.toTitle(); break;
      case 'ngplus': this.hide(); g.startNewGamePlus(); break;
      // 상자
      case 'chest-open': this.openChestRoll(); break;
      case 'chest-forge': this.showForge(this.sel); break;
      // 대장간
      case 'sel': this.sel = Number(data.uid); this.renderForge(); break;
      case 'upgrade': this.doUpgrade(); break;
      case 'equip': g.equipWeapon(this.sel, Number(data.slot)); this.renderForge(); break;
      case 'unequip': g.unequipWeapon(this.sel); this.renderForge(); break;
      case 'sell': g.sellWeapon(this.sel); this.sel = g.save.equipped.find((u) => u) || g.save.weapons[0].uid; this.renderForge(); break;
      default:
    }
  }

  // ---------- 타이틀 ----------
  showTitle() {
    const g = this.g;
    const s = g.save;
    const progress = s.lastSafe > 0 || s.coins > 0 || s.weapons.length > 1;
    const diffBtn = (k, label) => `<button class="btn ${s.difficulty === k ? '' : 'sub'}" data-act="diff" data-v="${k}" style="font-size:calc(var(--u)*2.2)">${label}</button>`;
    this._show(`
      <div class="panel">
        <h1>🧟 좀비 타워 🔥</h1>
        <p>차오르는 용암을 피해 좀비가 우글대는 타워를 올라가라!<br>안전구역마다 보물상자와 대장간이 기다린다. 꼭대기(10층)까지 탈출하면 승리!</p>
        <div class="row" style="margin:1.4vmin 0">
          ${progress
    ? `<button class="btn green" data-act="continue">▶ 이어하기 <small>(안전구역 ${s.lastSafe}${s.loop ? ` · ${s.loop + 1}회차` : ''})</small></button><button class="btn sub" data-act="new">새 게임</button>`
    : '<button class="btn green" data-act="start">▶ 게임 시작</button>'}
        </div>
        <p class="hint">난이도 ${diffBtn('easy', '쉬움')}${diffBtn('normal', '보통')}${diffBtn('hard', '어려움')}</p>
        <p class="hint">왼쪽 십자키 이동 · 오른쪽 ⤒ 점프 / ⚔️ 공격(누르고 있으면 연속) / 💧 물대포 · 빈 화면 드래그로 시점 회전<br>PC: WASD 이동 · Space 점프 · J 공격 · 1/2/3 무기 · Q 물대포</p>
      </div>`);
  }

  // ---------- 일시정지 ----------
  showPause() {
    const g = this.g;
    this._show(`
      <div class="panel">
        <h2>⏸ 일시정지</h2>
        <div class="row" style="flex-direction:column;align-items:center">
          <button class="btn green" data-act="resume">▶ 계속하기</button>
          <button class="btn sub" data-act="mute">${g.audio.muted ? '🔇 소리 켜기' : '🔊 소리 끄기'}</button>
          <button class="btn sub" data-act="title">타이틀로</button>
        </div>
      </div>`);
  }

  // ---------- 보물상자 ----------
  showChest(stage) {
    this.chestStage = stage;
    this.mode = 'chest';
    const odds = chestOdds(stage);
    const tot = odds.reduce((a, b) => a + b, 0);
    this._show(`
      <div class="panel" style="min-width:min(80vw,640px)">
        <h2>📦 ${stage}층 보물상자</h2>
        <div class="chest-stage"><div class="beam" id="chest-beam"></div><div class="chest-ico" id="chest-ico">🎁</div></div>
        <p class="hint">${RARITY.map((r, i) => `<span style="color:${r.color}">${r.name} ${Math.round((odds[i] / tot) * 100)}%</span>`).join(' · ')}${stage === 5 || stage === 10 ? ' · 보스층: 영웅 이상 확정' : ''}</p>
        <div id="chest-result"></div>
        <div class="row"><button class="btn green" data-act="chest-open" id="chest-btn">열기!</button></div>
      </div>`);
  }

  openChestRoll() {
    const g = this.g;
    const btn = document.getElementById('chest-btn');
    if (!btn || btn.hasAttribute('disabled')) return;
    btn.setAttribute('disabled', '');
    const ico = document.getElementById('chest-ico');
    ico.classList.add('shake');
    g.audio.play('chest');
    setTimeout(() => {
      const res = g.rollChest(this.chestStage);
      const w = res.weapon;
      const rar = RARITY[w.rarity];
      const stage = this.el.querySelector('.chest-stage');
      stage.style.setProperty('--rc', rar.color);
      ico.classList.remove('shake');
      ico.className = 'reveal';
      ico.textContent = WEAPONS[w.kind].icon;
      ico.style.filter = `drop-shadow(0 0 18px ${rar.color})`;
      document.getElementById('chest-beam').classList.add('on');
      g.audio.play(w.rarity >= 2 ? 'rare' : 'chest');
      document.getElementById('chest-result').innerHTML = `
        <div style="color:${rar.color};font-weight:900;font-size:calc(var(--u)*3.2)">${esc(weaponName(w))}</div>
        <p>공격력 <b>${fmt(weaponDamage(w))}</b>${WEAPONS[w.kind].pellets > 1 ? ` ×${WEAPONS[w.kind].pellets}발` : ''} · ${esc(WEAPONS[w.kind].desc)}</p>
        ${perks(w).length ? `<p style="color:${rar.color}">✨ ${perks(w).map((p) => PERK_TEXT[p]).join(' · ')}</p>` : ''}
        ${res.sold ? `<p>보관함이 가득 차서 자동 판매 → <i class="coin"></i>${fmt(res.sold)}</p>` : '<p class="hint">보관함에 추가됨</p>'}`;
      const row = this.el.querySelector('.row');
      row.innerHTML = `<button class="btn green" data-act="chest-forge">⚒ 장비/강화</button><button class="btn sub" data-act="close">닫기</button>`;
      this.sel = res.sold ? this.sel : w.uid;
    }, 900);
  }

  // ---------- 대장간 ----------
  showForge(selUid = null) {
    const g = this.g;
    this.mode = 'forge';
    this.sel = selUid && weaponByUid(g.save, selUid) ? selUid : (g.save.equipped.find((u) => u) || g.save.weapons[0].uid);
    this.renderForge();
  }

  renderForge() {
    const g = this.g;
    const s = g.save;
    const sel = weaponByUid(s, this.sel) || s.weapons[0];
    this.sel = sel.uid;
    const eqSlot = (uid) => s.equipped.indexOf(uid);
    const cards = s.weapons.map((w) => {
      const r = RARITY[w.rarity];
      const slot = eqSlot(w.uid);
      return `<div class="card${w.uid === sel.uid ? ' sel' : ''}" style="--rc:${r.color}" data-act="sel" data-uid="${w.uid}">
        ${slot >= 0 ? `<span class="eq">장착 ${slot + 1}</span>` : ''}
        <div class="ico">${WEAPONS[w.kind].icon}</div>
        <div class="nm">${esc(WEAPONS[w.kind].name)}${w.level ? ` +${w.level}` : ''}</div>
        <div class="st">${r.name} · ${fmt(weaponDamage(w))}</div></div>`;
    }).join('');

    const d = WEAPONS[sel.kind];
    const r = RARITY[sel.rarity];
    const cost = upgradeCost(sel);
    const can = canUpgrade(sel);
    const nextDmg = can ? weaponDamage({ ...sel, level: sel.level + 1 }) : null;
    const slotNow = eqSlot(sel.uid);
    const equipBtns = [0, 1, 2].map((i) => `<button class="btn sub" style="font-size:calc(var(--u)*1.9)" data-act="equip" data-slot="${i}" ${slotNow === i ? 'disabled' : ''}>슬롯 ${i + 1}</button>`).join('');
    this._show(`
      <div class="panel" style="width:min(96vw,980px)">
        <h2>⚒ 대장간 <span style="color:#ffd04a;margin-left:1em"><i class="coin"></i> ${fmt(s.coins)}</span></h2>
        <div class="row" style="align-items:flex-start;flex-wrap:nowrap">
          <div style="flex:1.6;min-width:0"><div class="cards">${cards}</div></div>
          <div class="detail" style="flex:1">
            <div style="font-size:calc(var(--u)*2.6);font-weight:900;color:${r.color}">${d.icon} ${esc(weaponName(sel))}${sel.level ? ` +${sel.level}` : ''}</div>
            공격력 <b>${fmt(weaponDamage(sel))}</b>${d.pellets > 1 ? ` ×${d.pellets}발` : ''}${nextDmg ? ` → <b style="color:#7dff9a">${fmt(nextDmg)}</b>` : ' <b>(최대)</b>'}<br>
            초당 피해 ≈ <b>${fmt(weaponDps(sel))}</b><br>
            ${esc(d.desc)}<br>
            ${perks(sel).length ? `<span style="color:${r.color}">✨ ${perks(sel).map((p) => PERK_TEXT[p]).join(' · ')}</span><br>` : ''}
            <div class="row" style="justify-content:flex-start;margin-top:.6em">
              <button class="btn green" data-act="upgrade" ${!can || s.coins < cost ? 'disabled' : ''}>${can ? `강화 <i class="coin"></i>${fmt(cost)}` : '최대 강화'}</button>
            </div>
            <div class="row" style="justify-content:flex-start">${equipBtns}${slotNow >= 0 ? '<button class="btn sub" style="font-size:calc(var(--u)*1.9)" data-act="unequip">해제</button>' : ''}</div>
            <div class="row" style="justify-content:flex-start"><button class="btn sub" style="font-size:calc(var(--u)*1.9)" data-act="sell" ${s.weapons.length <= 1 ? 'disabled' : ''}>판매 <i class="coin"></i>${fmt(sellValue(sel) + sel.level * 10)}</button></div>
          </div>
        </div>
        <button class="btn" data-act="close">닫기</button>
        <p class="hint">전투 중 교체할 무기를 슬롯 1~3에 장착하세요. 강화는 +${ECON.maxLevel}까지.</p>
      </div>`);
  }

  doUpgrade() {
    const g = this.g;
    const w = weaponByUid(g.save, this.sel);
    if (!w || !canUpgrade(w)) return;
    if (g.upgradeWeapon(w)) { g.audio.play('upgrade'); this.renderForge(); }
  }

  // ---------- 클리어 ----------
  showClear(stats) {
    this.mode = 'clear';
    this._show(`
      <div class="panel">
        <h1>🚁 탈출 성공!</h1>
        <p>용암과 좀비를 뚫고 타워 꼭대기에 도착했다!</p>
        <p>처치한 좀비 <b>${fmt(stats.kills)}</b> · 사망 <b>${fmt(stats.deaths)}</b> · 보유 코인 <i class="coin"></i> <b>${fmt(stats.coins)}</b></p>
        <div class="row">
          <button class="btn green" data-act="ngplus">새 타워 (무기·코인 유지, 더 어려움)</button>
          <button class="btn sub" data-act="title">타이틀로</button>
        </div>
      </div>`);
  }
}
