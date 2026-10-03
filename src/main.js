import './style.css';
import { Game } from './core/Game.js';

const game = new Game();
// 디버깅/튜닝용 (?debug 로 접속하면 FPS/용암 거리 표시)
window.__game = game;

if ('serviceWorker' in navigator && import.meta.env && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
