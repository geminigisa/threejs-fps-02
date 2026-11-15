// hud.js — everything on screen that is not the 3D view: crosshair, health,
// ammo, timer, score, money, kill feed, radio callouts, banners, the buy
// menu and the start/pause/end overlays. The HUD is plain DOM over the
// canvas, updated from S every frame (cheap text/width writes only).

import { S, aliveCount, player } from './state.js';
import { WEAPONS } from './weapon.js';
import { SHOP } from './economy.js';

const $ = (id) => document.getElementById(id);
let els = null;
let lastFeedLen = 0, lastRadioLen = 0;

export function initHUD(cb) {
  els = {
    cross: $('crosshair'), hit: $('hitmarker'),
    hpBar: $('hp-bar'), hpNum: $('hp-num'), armor: $('armor'),
    ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), weaponName: $('weapon-name'),
    money: $('money'), timer: $('timer'), score: $('score'),
    aliveA: $('alive-a'), aliveB: $('alive-b'),
    feed: $('feed'), radio: $('radio'),
    banner: $('banner'), bannerSub: $('banner-sub'),
    bomb: $('bomb-status'), plant: $('plant-bar'), plantFill: $('plant-fill'),
    hint: $('hint'),
    buy: $('buy-menu'), buyItems: $('buy-items'), buyMoney: $('buy-money'),
    start: $('overlay-start'), pause: $('overlay-pause'),
    end: $('overlay-end'), endTitle: $('end-title'), endSub: $('end-sub'),
    match: $('overlay-match'), matchTitle: $('match-title'),
  };
  // Buy menu items are built once from SHOP (economy.js).
  els.buyItems.innerHTML = SHOP.map((s) =>
    `<div class="buy-item" data-id="${s.id}"><b>[${s.key}] ${s.name}</b><span>$${s.price}</span><i>${s.desc}</i></div>`).join('');
  els.buyItems.addEventListener('click', (ev) => {
    const it = ev.target.closest('.buy-item');
    if (it) cb.onBuy(it.dataset.id);
  });
  $('btn-start').addEventListener('click', () => cb.onStart());
  $('btn-resume').addEventListener('click', () => cb.onResume());
  $('btn-restart').addEventListener('click', () => cb.onNextRound());
  $('btn-rematch').addEventListener('click', () => cb.onRestart());
  document.addEventListener('keydown', (ev) => {
    if (S.mode !== 'buy') return;
    const item = SHOP.find((s) => s.key === ev.key);
    if (item) cb.onBuy(item.id);
  });
}

// Explicit display when shown: setting '' would fall back to the
// stylesheet's display:none and the element would stay hidden.
function setVisible(el, on, showAs) { if (el) el.style.display = on ? (showAs || 'block') : 'none'; }

export function showBanner(text, sub, ms) {
  if (!els) return;
  els.banner.textContent = text;
  els.bannerSub.textContent = sub || '';
  els.banner.parentElement.style.opacity = '1';
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { els.banner.parentElement.style.opacity = '0'; }, ms || 2600);
}

export function flashHitmarker(head, killed) {
  if (!els) return;
  els.hit.style.opacity = '1';
  els.hit.style.color = killed ? '#e5484d' : head ? '#ffd166' : '#e9e6df';
  clearTimeout(flashHitmarker._t);
  flashHitmarker._t = setTimeout(() => { els.hit.style.opacity = '0'; }, 90);
}

// ---- per-frame HUD refresh (reads S, writes DOM) ----
export function updateHUD() {
  if (!els) return;
  const p = player();
  const inGame = S.mode === 'play' || S.mode === 'buy' || S.mode === 'end';
  setVisible($('hud'), inGame && !!p);
  setVisible(els.start, S.mode === 'menu', 'flex');
  setVisible(els.pause, S.paused && S.mode === 'play', 'flex');
  setVisible(els.end, S.mode === 'end', 'flex');
  setVisible(els.match, S.mode === 'match', 'flex');
  setVisible(els.buy, S.mode === 'buy' && S.buyOpen);
  if (!p) return;

  // Health / armor / ammo.
  els.hpBar.style.width = `${Math.max(0, p.hp)}%`;
  els.hpBar.style.background = p.hp > 50 ? '#46c07a' : p.hp > 25 ? '#f0a830' : '#e5484d';
  els.hpNum.textContent = Math.ceil(Math.max(0, p.hp));
  els.armor.textContent = p.armor ? 'PLATING' : '';
  const w = WEAPONS[p.weapon];
  els.ammoMag.textContent = p.reloadT > 0 ? '--' : p.ammo.mag;
  els.ammoRes.textContent = p.ammo.reserve === Infinity ? '∞' : p.ammo.reserve;
  els.weaponName.textContent = w.name + (p.reloadT > 0 ? ' — RELOADING' : '');

  // Money / timer / score / alive pips.
  els.money.textContent = `$${p.money}`;
  const t = Math.max(0, Math.ceil(S.mode === 'buy' ? S.buyTime : S.timeLeft));
  els.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  els.timer.style.color = S.mode === 'buy' ? '#f0a830' : (t <= 15 && S.mode === 'play' ? '#e5484d' : '#e9e6df');
  els.score.textContent = `EMB ${S.scoreA} — ${S.scoreB} WRD`;
  els.aliveA.textContent = '●'.repeat(aliveCount('A')) + '○'.repeat(5 - aliveCount('A'));
  els.aliveB.textContent = '●'.repeat(aliveCount('B')) + '○'.repeat(5 - aliveCount('B'));

  // Crosshair gap follows spread (stopping to aim visibly pays).
  const gap = 6 + (p.spread * 900) + (Math.hypot(p.vel.x, p.vel.z) > 0.8 ? 5 : 0);
  els.cross.style.setProperty('--gap', `${Math.min(26, gap).toFixed(1)}px`);

  // Kill feed + radio (append-only; rebuild only when they grow).
  if (S.feed.length !== lastFeedLen) {
    lastFeedLen = S.feed.length;
    els.feed.innerHTML = S.feed.map((f) => `<div class="${f.cls}">${f.text}</div>`).join('');
  }
  if (S.radio.length !== lastRadioLen) {
    lastRadioLen = S.radio.length;
    els.radio.innerHTML = S.radio.map((r) => `<div>▸ ${r.text}</div>`).join('');
  }

  // Bomb status line + plant/defuse progress.
  const b = S.bomb;
  if (b.state === 'planted') {
    els.bomb.textContent = `CHARGE PLANTED — ${Math.ceil(b.timer)}s — ${b.site === 'A' ? 'FURNACE' : 'CASTING'}`;
    els.bomb.style.color = '#e5484d';
  } else if (b.state === 'carried' && b.carrier === p) {
    els.bomb.textContent = `YOU CARRY THE CHARGE — plant at ${'A: FURNACE · B: CASTING'}`;
    els.bomb.style.color = '#f0a830';
  } else if (b.state === 'dropped') {
    els.bomb.textContent = 'CHARGE DROPPED — pick it up';
    els.bomb.style.color = '#f0a830';
  } else {
    els.bomb.textContent = '';
  }
  const showPlant = b.progress > 0 && (b.state === 'carried' || b.state === 'planted');
  setVisible(els.plant, showPlant);
  if (showPlant) {
    const total = b.state === 'carried' ? 3 : 5;
    els.plantFill.style.width = `${Math.min(100, (b.progress / total) * 100)}%`;
    els.plantFill.style.background = b.state === 'carried' ? '#f0a830' : '#46c07a';
  }

  // Context hint.
  let hint = '';
  if (S.mode === 'buy') hint = 'Buy phase — [1–5] buy, click a card, or wait';
  else if (b.state === 'carried' && b.carrier === p) {
    hint = 'Hold E inside a site to plant the charge';
  } else if (b.state === 'planted') {
    hint = 'Hold E on the charge to defuse it';
  }
  els.hint.textContent = hint;

  // Buy menu money.
  if (S.mode === 'buy') els.buyMoney.textContent = `$${p.money}`;

  // End / match overlays.
  if (S.mode === 'end' && S.winner) {
    els.endTitle.textContent = S.winner === 'A' ? 'EMBERS WIN THE ROUND' : 'WARDENS WIN THE ROUND';
    els.endSub.textContent = `${S.winReason} · EMB ${S.scoreA} — ${S.scoreB} WRD`;
  }
  if (S.mode === 'match') {
    els.matchTitle.textContent = S.matchWinner ? `${S.matchWinner === 'A' ? 'EMBERS' : 'WARDENS'} WIN THE MATCH ${S.scoreA} — ${S.scoreB}` : `MATCH DRAWN ${S.scoreA} — ${S.scoreB}`;
  }
}
