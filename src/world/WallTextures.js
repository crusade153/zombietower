import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

// 벽 질감(캔버스로 직접 그림). 한 장이 가로 12m × 세로 12m. 색 지도 + 발광 지도(창문·횃불·용암 균열) 두 장을 만든다.
const S = 512;

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  return c;
}

function archPath(g, cx, top, w, h) {
  const r = w / 2;
  g.beginPath();
  g.moveTo(cx - r, top + h);
  g.lineTo(cx - r, top + r);
  g.arc(cx, top + r, r, Math.PI, 0);
  g.lineTo(cx + r, top + h);
  g.closePath();
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

function drawDungeon(g, e, rng) {
  g.fillStyle = '#627f89'; g.fillRect(0, 0, S, S);
  for (let row = 0; row < 16; row++) {
    const off = (row % 2) * 32;
    for (let x = -64; x < S + 64; x += 64) {
      const f = 0.91 + rng() * 0.15;
      g.fillStyle = shade(0x91b1b8, f);
      g.beginPath(); g.roundRect(x + off + 2, row * 32 + 2, 60, 28, 3); g.fill();
      g.fillStyle = '#c4d9db55'; g.fillRect(x + off + 5, row * 32 + 3, 54, 2);
    }
  }
  // 아치 창문 (발광)
  archPath(g, 256, 70, 96, 200);
  g.fillStyle = '#39575e'; g.fill();
  g.lineWidth = 10; g.strokeStyle = '#d0e1df'; g.stroke();
  archPath(e, 256, 70, 96, 200);
  const grad = e.createLinearGradient(0, 70, 0, 270);
  grad.addColorStop(0, '#abefe7'); grad.addColorStop(1, '#57a9ad');
  e.fillStyle = grad; e.fill();
  e.fillStyle = '#000';
  e.fillRect(252, 90, 8, 190); e.fillRect(210, 175, 92, 7);
  // 횃불 걸이
  for (const x of [88, 424]) {
    g.fillStyle = '#2a2a2e'; g.fillRect(x - 5, 330, 10, 46);
    g.fillRect(x - 12, 322, 24, 8);
    const rg = e.createRadialGradient(x, 306, 2, x, 306, 40);
    rg.addColorStop(0, '#fff2b0'); rg.addColorStop(0.35, '#ff9a2a'); rg.addColorStop(1, 'rgba(255,60,0,0)');
    e.fillStyle = rg; e.beginPath(); e.arc(x, 306, 40, 0, Math.PI * 2); e.fill();
  }
}

function drawLibrary(g, e, rng) {
  g.fillStyle = '#615c7c'; g.fillRect(0, 0, S, S);
  const cols = ['#d9788e', '#79bada', '#75cda5', '#dbbc67', '#b197d5', '#e1a184', '#9badd4', '#f4b667'];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y0 = shelf * 128;
    g.fillStyle = '#a6a4b8'; g.fillRect(0, y0 + 118, S, 10);
    let x = 4;
    while (x < S - 8) {
      const w = 10 + Math.floor(rng() * 12);
      const h = 70 + Math.floor(rng() * 40);
      g.fillStyle = cols[Math.floor(rng() * cols.length)];
      g.fillRect(x, y0 + 118 - h, w, h);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 2, y0 + 118 - h + 6, 2, h - 12);
      x += w + 1;
    }
  }
  // 달빛 창
  archPath(g, 256, 10, 120, 240);
  g.fillStyle = '#0a0a18'; g.fill();
  g.lineWidth = 10; g.strokeStyle = '#5a3c24'; g.stroke();
  archPath(e, 256, 10, 120, 240);
  const grad = e.createLinearGradient(0, 10, 0, 250);
  grad.addColorStop(0, '#d8e8ff'); grad.addColorStop(1, '#6a8ae0');
  e.fillStyle = grad; e.fill();
  e.fillStyle = '#000'; e.fillRect(252, 30, 8, 220); e.fillRect(206, 120, 100, 8);
  // 등불
  for (const x of [70, 442]) {
    const rg = e.createRadialGradient(x, 80, 2, x, 80, 38);
    rg.addColorStop(0, '#fff0b0'); rg.addColorStop(0.4, '#ffc050'); rg.addColorStop(1, 'rgba(255,160,0,0)');
    e.fillStyle = rg; e.beginPath(); e.arc(x, 80, 38, 0, Math.PI * 2); e.fill();
    g.fillStyle = '#222'; g.fillRect(x - 2, 0, 4, 66);
  }
}

function drawMachine(g, e, rng) {
  g.fillStyle = '#4a657b'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      g.fillStyle = shade(0x8aa5b9, 0.9 + rng() * 0.15);
      g.fillRect(c * 128 + 3, r * 128 + 3, 122, 122);
      g.fillStyle = '#20242a';
      for (const [dx, dy] of [[12, 12], [110, 12], [12, 110], [110, 110]]) { g.beginPath(); g.arc(c * 128 + dx, r * 128 + dy, 4, 0, 6.3); g.fill(); }
    }
  }
  // 파이프 두 줄
  for (const y of [96, 352]) {
    g.fillStyle = '#7a6238'; g.fillRect(0, y, S, 30);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, y + 4, S, 5);
    g.fillStyle = '#3a2e18'; g.fillRect(0, y + 24, S, 6);
    for (let x = 40; x < S; x += 128) { g.fillStyle = '#5a4a28'; g.fillRect(x, y - 4, 14, 38); }
  }
  // 발광 환기구
  for (let i = 0; i < 4; i++) {
    const y = 190 + i * 16;
    g.fillStyle = '#101010'; g.fillRect(180, y, 152, 10);
    e.fillStyle = i % 2 ? '#ff9a30' : '#ff6a10'; e.fillRect(184, y + 2, 144, 6);
  }
  // 경고 줄무늬
  for (let x = -40; x < S; x += 40) {
    g.fillStyle = '#d8b020';
    g.beginPath(); g.moveTo(x, 460); g.lineTo(x + 20, 460); g.lineTo(x + 40, 500); g.lineTo(x + 20, 500); g.closePath(); g.fill();
  }
}

function drawObsidian(g, e, rng) {
  g.fillStyle = '#120c18'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const w = 40 + rng() * 90; const h = 30 + rng() * 70;
    g.fillStyle = shade(0x2a2034, 0.7 + rng() * 0.8);
    g.fillRect(rng() * S, rng() * S, w, h);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < S; y += 64) g.fillRect(0, y, S, 3);
  // 용암 균열 (발광)
  e.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    let x = rng() * S; let y = rng() * S;
    e.beginPath(); e.moveTo(x, y);
    for (let j = 0; j < 8; j++) { x += (rng() - 0.5) * 70; y += 20 + rng() * 40; e.lineTo(x, y); }
    e.strokeStyle = '#ff3a18'; e.lineWidth = 3 + rng() * 3; e.stroke();
    e.strokeStyle = '#ffb060'; e.lineWidth = 1.2; e.stroke();
  }
  archPath(g, 256, 90, 90, 190);
  g.fillStyle = '#050208'; g.fill();
  archPath(e, 256, 90, 90, 190);
  const grad = e.createLinearGradient(0, 90, 0, 280);
  grad.addColorStop(0, '#ff6a40'); grad.addColorStop(1, '#a00a20');
  e.fillStyle = grad; e.fill();
}

function drawSky(g, e, rng) {
  g.fillStyle = '#e4dcd2'; g.fillRect(0, 0, S, S);
  g.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(120,110,130,${0.1 + rng() * 0.18})`;
    g.beginPath();
    let x = rng() * S; let y = rng() * S;
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (rng() - 0.5) * 60; y += (rng() - 0.3) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = '#d9b64a'; g.fillRect(0, 0, S, 14); g.fillRect(0, S - 14, S, 14);
  g.fillStyle = '#f0d070'; g.fillRect(0, 14, S, 4);
  for (const x of [30, 482]) { g.fillStyle = '#cfc6ba'; g.fillRect(x - 14, 18, 28, S - 36); g.fillStyle = '#d9b64a'; g.fillRect(x - 18, 18, 36, 10); g.fillRect(x - 18, S - 28, 36, 10); }
  archPath(g, 256, 50, 150, 380);
  g.fillStyle = '#9ad0ff'; g.fill();
  g.lineWidth = 12; g.strokeStyle = '#d9b64a'; g.stroke();
  archPath(e, 256, 50, 150, 380);
  const grad = e.createLinearGradient(0, 50, 0, 430);
  grad.addColorStop(0, '#b8e0ff'); grad.addColorStop(0.6, '#ffe6b0'); grad.addColorStop(1, '#ffb878');
  e.fillStyle = grad; e.fill();
  e.fillStyle = '#000'; e.fillRect(252, 70, 8, 360);
}

const DRAW = [drawDungeon, drawLibrary, drawMachine, drawObsidian, drawSky];

/** 테마 인덱스별 {map, glow} 텍스처 */
export function makeWallTextures(themeIdx) {
  const c1 = makeCanvas(); const c2 = makeCanvas();
  const g = c1.getContext('2d'); const e = c2.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  DRAW[themeIdx](g, e, makeRng(1000 + themeIdx));
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(c1, true), glow: mk(c2, true) };
}
