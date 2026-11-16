// economy.js — money between rounds, spent in a buy menu. Kill +$300,
// round win +$3000, loss +$1900, plant +$300, defuse +$300. The buy menu
// is the second half of the tactics criterion: a team that spends well
// out-guns a team that does not.

import { S, player } from './state.js';
import { WEAPONS, SMOKE_PRICE, ARMOR_PRICE, giveWeapon } from './weapon.js';
import { sfx } from './audio.js';

export const SHOP = [
  { key: '1', id: 'rifle', name: 'FR-9 Furnace Rifle', price: 2700, desc: '30/90 · 34 dmg · auto' },
  { key: '2', id: 'smg', name: 'VK-9 Viper SMG', price: 1500, desc: '25/100 · 25 dmg · 800 rpm' },
  { key: '3', id: 'armor', name: 'Plating', price: 650, desc: 'Damage taken x0.6 this round' },
  { key: '4', id: 'smoke', name: 'SG-1 Smoke', price: 300, desc: 'One smoke cloud, 12 s' },
  { key: '5', id: 'ammo', name: 'Reserve ammo', price: 200, desc: 'Refill current weapon reserve' },
];

export function roundEndPayout(winnerTeam) {
  for (const e of S.entities) {
    if (e.team === winnerTeam) e.money += 3000;
    else e.money += 1900;
  }
  const p = player();
  if (p) S.playerMoney = p.money;
}

// Buy item `id` for the player. Returns true on success.
export function buy(id) {
  const p = player();
  if (!p || S.mode !== 'buy') return false;
  const item = SHOP.find((s) => s.id === id);
  if (!item || p.money < item.price) { sfx.denied(); return false; }
  if (id === 'rifle' || id === 'smg') {
    if (p.weapon === id) { sfx.denied(); return false; }
    giveWeapon(p, id);
  } else if (id === 'armor') {
    if (p.armor) { sfx.denied(); return false; }
    p.armor = true;
  } else if (id === 'smoke') {
    if ((p.smokesLeft || 0) >= 1) { sfx.denied(); return false; }
    p.smokesLeft = 1;
  } else if (id === 'ammo') {
    const w = WEAPONS[p.weapon];
    if (p.ammo.reserve >= w.reserve) { sfx.denied(); return false; }
    p.ammo.reserve = w.reserve;
  }
  p.money -= item.price;
  S.playerMoney = p.money;
  sfx.buy();
  return true;
}

// Bots spend simply: rifle if they can afford it, else SMG, then smoke,
// then armor when rich. Smoke comes before armor: the execute needs its
// cover in round 1, when $800 buys a smoke ($300) but not both a smoke
// and plating ($650) — buying armor first left the team smokeless.
export function botBuy(b) {
  if (b.money >= 2700 && b.weapon !== 'rifle') { giveWeapon(b, 'rifle'); b.money -= 2700; }
  else if (b.money >= 1500 && b.weapon !== 'smg' && b.weapon !== 'rifle') { giveWeapon(b, 'smg'); b.money -= 1500; }
  if (b.money >= 300 && (b.smokesLeft || 0) === 0) { b.smokesLeft = 1; b.money -= 300; }
  if (b.money >= 650 && !b.armor) { b.armor = true; b.money -= 650; }
}
