// shots.js — deterministic screenshot modes. Each ?shot= mode stages a real
// moment of the game with the real simulation (bots move, the bomb plants,
// the trigger fires), runs a fixed number of fixed-steps, then freezes and
// sets window.__shotReady. The screenshots are renders of the game's own
// code, never staged images: the same systems that play the game pose the
// shot. No pointer lock is needed — the camera is aimed directly.

import { S, rng, player, pushFeed } from './state.js';

// Fixed steps to run before freezing, per mode (60 steps = 1 s).
export const SHOT_STEPS = { start: 90, fight: 62, plant: 120, buy: 30 };

function place(e, x, z, yaw) {
  e.pos.x = x; e.pos.z = z; e.pos.y = 0;
  e.vel.x = 0; e.vel.z = 0; e.yaw = yaw; e.pitch = 0;
  e.alive = true; e.hp = e.maxHp;
}

export function setupShot(mode, seed) {
  rng.seed(seed || 7);
  const p = player();
  if (!p) return;
  S.shotMode = mode;
  S.feed = []; S.radio = [];
  const allies = S.entities.filter((e) => e.team === 'A' && e.bot);
  const foes = S.entities.filter((e) => e.team === 'B' && e.bot);

  if (mode === 'start') {
    // Round 1, spawn view down mid lane toward the furnace glow.
    S.mode = 'play'; S.round = 1; S.scoreA = 0; S.scoreB = 0; S.timeLeft = 100;
    S.bomb.state = 'carried'; S.bomb.carrier = p;
    place(p, 0, 19, 0);
    allies.forEach((b, i) => place(b, [-4, 3, -6, 5][i] || 0, 20, 0));
    foes.forEach((b, i) => place(b, [-4, 3, -6, 5, 0][i] || 0, -20, Math.PI));
    pushFeed('Round 1 — plant the charge or wipe them out', '');
  } else if (mode === 'fight') {
    // Mid-round firefight in mid lane: the player fires at a peeking defender.
    S.mode = 'play'; S.round = 2; S.scoreA = 1; S.scoreB = 0; S.timeLeft = 73;
    S.bomb.state = 'carried'; S.bomb.carrier = p;
    p.hp = 82; p.ammo = { mag: 24, reserve: 90 };
    place(p, 0, 8, 0);
    place(foes[0], 2, -4, Math.PI);
    place(foes[1], -14, -6, Math.PI / 2);
    place(allies[0], -3, 6, 0);
    place(allies[1], 6, 12, 0);
    pushFeed('Cinder ▸ Slag', 'a');
    pushFeed('Ferro ▸ Mold', 'a');
  } else if (mode === 'plant') {
    // The player plants the charge at site A (Furnace) while an ally covers.
    // (24,-10) is inside the site circle (6.0 m from its centre) and 3 m
    // from the glowing furnace mouth. Yaw 1.2 turns the view ~69° west of
    // north, so the furnace reads at the frame's right edge instead of
    // filling it, with open site floor and the covering ally on the left.
    S.mode = 'play'; S.round = 2; S.scoreA = 1; S.scoreB = 1; S.timeLeft = 61;
    S.bomb.state = 'carried'; S.bomb.carrier = p; S.bomb.progress = 2.2;
    place(p, 24, -10, 1.2);
    place(allies[0], 16, -14, -0.4);
    place(allies[1], 14, -18, 0.3);
    place(foes[0], 26, -6, Math.PI);
    place(foes[1], 14, -4, Math.PI);
    pushFeed('Ferro ▸ Crucible', 'a');
  } else if (mode === 'buy') {
    // Buy phase between rounds: the menu open, $4,100 to spend.
    S.mode = 'buy'; S.round = 2; S.scoreA = 1; S.scoreB = 0; S.buyTime = 8;
    S.buyOpen = true;
    p.money = 4100; S.playerMoney = 4100;
    place(p, 0, 19, 0);
    pushFeed('EMBERS take round 1 — team wiped out', 'a');
  }
}

// Scripted player input for the frozen modes: the fight shot fires once at
// step 60 so the muzzle flash and tracer are in the frame when it freezes.
export function shotInput(mode, step) {
  if (mode === 'fight') return { fire: step === 60 };
  if (mode === 'plant') return { plant: true };
  return {};
}
