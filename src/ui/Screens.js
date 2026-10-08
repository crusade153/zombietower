import { WEAPONS, RARITY, PERK_TEXT } from '../config/weapons.js';
import { ECON } from '../config/balance.js';
import {
  weaponDamage, weaponName, upgradeCost, canUpgrade, sellPrice, weaponDps, perks, chestOdds, weaponAppearance,
} from '../combat/Weapons.js';
import { weaponByUid, normalizeSave, writeSave } from '../core/Save.js';
import { icon } from './icons.js';

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
    this.el.addEventListener('input', (e) => {
      const channel = e.target.dataset.volume;
      if (!channel) return;
      const value = Number(e.target.value);
      this.g.setAudioVolume(channel, value / 100);
      this.el.querySelector(`[data-volume-label="${channel}"]`).textContent = `${value}%`;
    });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  _show(html) {
    this.el.classList.remove('title-screen');
    this.el.innerHTML = html;
    this.el.classList.remove('hidden');
    this.el.scrollTop = 0;
  }

  hide() {
    this.el.classList.remove('title-screen');
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
      case 'title-mute': g.toggleMute(); this.showTitle(); break;
      case 'graphics':
        if (data.style) g.setGraphicsStyle(data.style); else g.toggleGraphicsStyle();
        if (g.state === 'title') this.showTitle(); else this.showPause();
        break;
      case 'close': this.hide(); g.closeModal(); break;
      case 'resume': this.hide(); g.resume(); break;
      case 'mute': g.toggleMute(); this.showPause(); break;
      case 'title': this.hide(); g.toTitle(); break;
      case 'export-save': {
        const url = URL.createObjectURL(new Blob([JSON.stringify(g.save, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'frost-tower-save.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case 'import-save': this.importSave(); break;
      case 'floors': this.showFloorSelect(); break;
      case 'floor-go': g.restartFromFloor(Number(data.floor)); break;
      case 'boss-go': g.restartFromFloor(9, true); break;
      case 'floor-back': if (g.state === 'title') this.showTitle(); else this.showPause(); break;
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
    const diffBtn = (k, label) => `<button class="difficulty-btn ${s.difficulty === k ? 'selected' : ''}" data-act="diff" data-v="${k}" aria-pressed="${s.difficulty === k}">${label}</button>`;
    this._show(`
      <div class="lobby-top"><span class="wordmark">${icon('bag')} ZOMBIE TOWER<span class="edition">ADVENTURE CLUB</span></span><div class="lobby-tools"><button class="lobby-graphics" data-act="graphics" aria-label="${s.graphicsStyle === 'classic' ? '현재 그래픽으로 변경' : '초기 블록 그래픽으로 변경'}" aria-pressed="${s.graphicsStyle === 'classic'}">그래픽 · ${s.graphicsStyle === 'classic' ? '블록' : '현재'}</button><button class="lobby-sound" data-act="title-mute" aria-label="${g.audio.muted ? '소리 켜기' : '소리 끄기'}" title="${g.audio.muted ? '소리 켜기' : '소리 끄기'}">${icon(g.audio.muted ? 'muted' : 'sound')}</button></div></div>
      <div class="lobby-menu">
        <div class="lobby-eyebrow"><span></span> FROZEN CITADEL · LAVA MONSTERS</div>
        <h1><span>좀비</span><br><strong>타워<span class="title-dot">!</span></strong></h1>
        <p class="lobby-tagline">얼음 성채를 오르고, 용암 군주를 물리쳐라.<br>정상에서 기다리는 최후의 전투!</p>
        <div class="difficulty" role="group" aria-label="난이도">${diffBtn('easy', '쉬움')}${diffBtn('normal', '보통')}${diffBtn('hard', '어려움')}</div>
        <button class="start-button" data-act="${progress ? 'continue' : 'start'}">${icon('play')}<span>${progress ? '이어서 올라가기' : '모험 시작'}</span>${icon('arrow')}</button>
        ${progress ? `<div class="lobby-secondary"><button class="new-button" data-act="new">${icon('restart')} 새 모험</button>${s.lastSafe > 0 ? '<button class="new-button" data-act="floors">시작 층 선택</button>' : ''}</div><span class="save-note">${s.resumeAtBoss ? '최종 보스 앞에서 계속' : `${s.resumeSafe}층에서 계속`}${s.loop ? ` · ${s.loop + 1}번째 모험` : ''}</span>` : ''}
        <div><button class="new-button" data-act="import-save">저장 파일 가져오기</button></div>
      </div>
      <div class="lobby-footer"><span>${icon('flag')} 오늘은 꼭, 꼭대기까지.</span><span class="tower-goal">${icon('trophy')} <b>10</b> FLOORS TO FREEDOM</span></div>`);
    this.el.classList.add('title-screen');
  }

  // ---------- 일시정지 ----------
  showPause() {
    const g = this.g;
    this._show(`
      <div class="panel">
        <h2>${icon('pause')} 잠깐 쉬어가기</h2>
        <div class="graphics-options" role="group" aria-label="그래픽 스타일">
          ${[['polished', '현재 그래픽'], ['classic', '초기 블록 그래픽']].map(([style, label]) => `<button class="graphics-choice ${g.save.graphicsStyle === style ? 'selected' : ''}" data-act="graphics" data-style="${style}" aria-pressed="${g.save.graphicsStyle === style}">${label}</button>`).join('')}
        </div>
        <div class="audio-settings">
          ${[['music', 'BGM'], ['effects', '효과음']].map(([channel, label]) => {
            const value = Math.round(g.audio[`${channel}Volume`] * 100);
            return `<label class="volume-control"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${value}" data-volume="${channel}" aria-label="${label} 볼륨"><output data-volume-label="${channel}">${value}%</output></label>`;
          }).join('')}
        </div>
        <div class="row" style="flex-direction:column;align-items:center">
          <button class="btn green" data-act="resume">${icon('play')} 계속하기</button>
          <button class="btn" data-act="floors">${icon('flag')} 클리어한 층에서 시작</button>
          <button class="btn sub" data-act="export-save">저장 파일 백업</button>
          <button class="btn sub" data-act="import-save">저장 파일 가져오기</button>
          <button class="btn sub" data-act="mute">${icon(g.audio.muted ? 'muted' : 'sound')} ${g.audio.muted ? '소리 켜기' : '소리 끄기'}</button>
          <button class="btn sub" data-act="title">타이틀로</button>
        </div>
      </div>`);
  }

  showFloorSelect() {
    const s = this.g.save;
    this.mode = 'floors';
    this._show(`
      <div class="panel floor-panel">
        <h2>${icon('flag')} 시작 층 선택</h2>
        <p class="hint">클리어한 층의 안전구역으로 이동합니다.<br>무기와 코인은 그대로 유지됩니다.</p>
        <div class="floor-grid">${Array.from({ length: 11 }, (_, k) => {
          const unlocked = k <= s.lastSafe;
          return `<button class="floor-button${k === this.g.safeIdx ? ' current' : ''}" data-act="floor-go" data-floor="${k}" ${unlocked ? '' : 'disabled'}><b>${k === 0 ? '출발' : `${k}층`}</b><small>${unlocked ? (k === 0 ? '1층부터 도전' : k === 10 ? '정상 안전구역' : `${k + 1}층부터 도전`) : '아직 잠김'}</small></button>`;
        }).join('')}</div>
        ${s.bossSanctuaryUnlocked ? '<button class="btn green" data-act="boss-go">최종 보스 직전 안전구역</button>' : ''}
        <p class="hint">최고 클리어 ${s.lastSafe}층 · 층 클리어 보상은 최초 1회 지급</p>
        <button class="btn sub" data-act="floor-back">돌아가기</button>
      </div>`);
  }

  importSave() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    document.body.append(input);
    input.addEventListener('cancel', () => input.remove(), { once: true });
    input.addEventListener('change', async () => {
      try {
        if (!input.files[0]) return;
        const save = normalizeSave(JSON.parse(await input.files[0].text()));
        if (!writeSave(save)) throw new Error('저장 공간을 사용할 수 없습니다. Safari의 저장 설정을 확인해주세요.');
        this.g.save = save;
        location.reload();
      } catch (error) {
        this.g.hud.toast(error instanceof SyntaxError ? 'JSON 저장 파일을 선택해주세요.' : error.message, 3000);
      } finally { input.remove(); }
    }, { once: true });
    input.click();
  }

  // ---------- 보물상자 ----------
  showChest(stage) {
    this.chestStage = stage;
    this.mode = 'chest';
    const odds = chestOdds(stage);
    if (stage === 5 || stage === 10) {
      for (let i = 0; i < 3; i++) { odds[3] += odds[i]; odds[i] = 0; }
    }
    const tot = odds.reduce((a, b) => a + b, 0);
    this._show(`
      <div class="panel" style="min-width:min(80vw,640px)">
        <h2>📦 ${stage}층 보물상자</h2>
        <div class="chest-stage"><div class="beam" id="chest-beam"></div><div class="chest-ico" id="chest-ico">🎁</div></div>
        <p class="hint">${RARITY.map((r, i) => `<span style="color:${r.color}">${r.name} ${Math.round((odds[i] / tot) * 100)}%</span>`).join(' · ')}${stage === 5 || stage === 10 ? ' · 보스층: 신화 이상 확정' : ''}</p>
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
    const appearance = weaponAppearance(sel);
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
            <div class="appearance-badge" style="--upgrade-color:${appearance.color}">✦ ${appearance.name} · +${sel.level}</div>
            <p class="hint appearance-hint">${appearance.next ? `+${appearance.next}에서 다음 외형 해금` : '최종 외형 · 황금 오라'}<br>+1 강철 · +4 룬 · +7 플라즈마 · +10 황금</p>
            ${esc(d.desc)}<br>
            ${perks(sel).length ? `<span style="color:${r.color}">✨ ${perks(sel).map((p) => PERK_TEXT[p]).join(' · ')}</span><br>` : ''}
            <div class="row" style="justify-content:flex-start;margin-top:.6em">
              <button class="btn green" data-act="upgrade" ${!can || s.coins < cost ? 'disabled' : ''}>${can ? `강화 <i class="coin"></i>${fmt(cost)}` : '최대 강화'}</button>
            </div>
            <div class="row" style="justify-content:flex-start">${equipBtns}${slotNow >= 0 ? '<button class="btn sub" style="font-size:calc(var(--u)*1.9)" data-act="unequip">해제</button>' : ''}</div>
            <div class="row" style="justify-content:flex-start"><button class="btn sub" style="font-size:calc(var(--u)*1.9)" data-act="sell" ${s.weapons.length <= 1 ? 'disabled' : ''}>판매 <i class="coin"></i>${fmt(sellPrice(sel))}</button></div>
          </div>
        </div>
        <button class="btn" data-act="close">닫기</button>
        <p class="hint">보관함 ${s.weapons.length} / 12 · 최대 강화 +${ECON.maxLevel}</p>
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
        <h1>❄️ 얼음 성채 해방!</h1>
        <p>최종 보스 용암 군주를 쓰러뜨리고 정상에 도착했다!</p>
        <p>처치한 좀비 <b>${fmt(stats.kills)}</b> · 최고 콤보 <b>${fmt(stats.bestCombo || 0)}</b> · 아슬아슬 <b>${fmt(stats.nearMisses || 0)}</b>회 · 사망 <b>${fmt(stats.deaths)}</b> · 보유 코인 <i class="coin"></i> <b>${fmt(stats.coins)}</b></p>
        <div class="row">
          <button class="btn green" data-act="ngplus">새 타워 (무기·코인 유지, 더 어려움)</button>
          <button class="btn sub" data-act="title">타이틀로</button>
        </div>
      </div>`);
  }
}
