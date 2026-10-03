import { createElement, Play, ArrowRight, RotateCcw, Volume2, VolumeX, Pause, ArrowUp, Droplets, Swords, Trophy, Heart, Flame, Flag, Hammer, Backpack, Sparkles, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide';

const icons = { play: Play, arrow: ArrowRight, restart: RotateCcw, sound: Volume2, muted: VolumeX, pause: Pause, jump: ArrowUp, water: Droplets, attack: Swords, trophy: Trophy, heart: Heart, flame: Flame, flag: Flag, forge: Hammer, bag: Backpack, sparkles: Sparkles, up: ChevronUp, down: ChevronDown, left: ChevronLeft, right: ChevronRight };

export function icon(name, cls = '') {
  return createElement(icons[name] || Sparkles, { class: `icon ${cls}`, 'aria-hidden': 'true', 'stroke-width': 2.5 }).outerHTML;
}

export function setSoundIcon(el, muted) {
  el.innerHTML = icon(muted ? 'muted' : 'sound');
  el.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  el.title = muted ? '소리 켜기' : '소리 끄기';
}
