// bomb.js — the objective. The charge starts with a random attacker (the
// player on round 1, then whoever the round gives it to). Planting takes 3 s
// standing in a site; the fuse runs 40 s with a beep that speeds up;
// defusing takes 5 s standing on the bomb. The bomb is the reason the game
// is tactical instead of a deathmatch: a team that only hunts kills loses
// to the clock.

import { S, PLANT_TIME, DEFUSE_TIME, BOMB_TIME, pushFeed, pushRadio, player, rng } from './state.js';
import { SITES } from './world.js';
import { sfx } from './audio.js';

// Who carries the charge right now (null when planted/dropped).
export function carrier() { return S.bomb.state === 'carried' ? S.bomb.carrier : null; }

// Is entity e inside site `site`?
export function inSite(e, site) {
  const s = SITES[site];
  const dx = e.pos.x - s.x, dz = e.pos.z - s.z;
  return dx * dx + dz * dz < s.r * s.r;
}

// Called once per tick by main.js. Runs the plant/defuse channels for
// whoever is in position — player (holding E) or bot (standing still).
export function updateBomb(dt, input) {
  const b = S.bomb;
  if (S.mode !== 'play') return;
  if (b.state === 'carried' && b.carrier) {
    const c = b.carrier;
    const site = inSite(c, 'A') ? 'A' : inSite(c, 'B') ? 'B' : null;
    const planting = site && (c.bot || (input && input.plant));
    if (planting) {
      b.progress += dt;
      b.site = site;
      if (Math.floor(b.progress * 2) !== Math.floor((b.progress - dt) * 2)) sfx.plantBeep();
      if (b.progress >= PLANT_TIME) {
        b.state = 'planted'; b.timer = BOMB_TIME; b.progress = 0;
        b.x = c.pos.x; b.z = c.pos.z;
        // Planting pays: +$300 to the carrier, as the economy promises.
        c.money += 300;
        if (c === player()) S.playerMoney = c.money;
        pushFeed(`Charge planted at site ${site}`, 'a');
        pushRadio(`Charge planted at ${site === 'A' ? 'Furnace' : 'Casting'} — hold it!`);
      }
    } else b.progress = Math.max(0, b.progress - dt * 2);
  } else if (b.state === 'planted') {
    b.timer -= dt;
    // Beep faster as the fuse runs down.
    const interval = b.timer > 20 ? 1 : b.timer > 10 ? 0.5 : 0.25;
    b.beepT = (b.beepT || 0) - dt;
    if (b.beepT <= 0) { sfx.plantBeep(); b.beepT = interval; }
    // A defender standing on the bomb defuses it.
    const def = S.entities.find((e) => e.team === 'B' && e.alive &&
      Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < 2.2 && (e.bot || (input && input.plant)));
    if (def) {
      b.defuser = def;
      b.progress += dt;
      if (Math.floor(b.progress * 2) !== Math.floor((b.progress - dt) * 2)) sfx.defuseBeep();
      if (b.progress >= DEFUSE_TIME) {
        b.state = 'defused'; b.progress = 0;
        // Defusing pays: +$300 to the defuser, as the economy promises.
        def.money += 300;
        if (def === player()) S.playerMoney = def.money;
        pushFeed('Charge defused', 'b');
        return 'defused';
      }
    } else { b.progress = Math.max(0, b.progress - dt * 2); b.defuser = null; }
    if (b.timer <= 0) {
      b.state = 'detonated';
      sfx.explode();
      return 'detonated';
    }
  } else if (b.state === 'dropped') {
    // The player (or an ally bot, handled in bots.js) picks it up on touch.
    const p = player();
    if (p && p.alive && p.team === 'A' && Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 1.2) {
      b.state = 'carried'; b.carrier = p;
      pushFeed('You picked up the charge', 'a');
    }
  }
  return null;
}

// Give the charge to a random alive attacker at round start.
export function assignCarrier() {
  const atk = S.entities.filter((e) => e.team === 'A' && e.alive);
  if (!atk.length) return;
  const c = rng.pick(atk);
  S.bomb.state = 'carried'; S.bomb.carrier = c; S.bomb.site = null;
  S.bomb.timer = BOMB_TIME; S.bomb.progress = 0; S.bomb.defuser = null;
}
