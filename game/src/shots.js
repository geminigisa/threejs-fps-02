// shots.js — deterministic screenshot modes. Each ?shot= mode stages a real
// moment of the game with the real simulation (bots move, the bomb plants,
// the trigger fires), runs a fixed number of fixed-steps, then freezes and
// sets window.__shotReady. The screenshots are renders of the game's own
// code, never staged images: the same systems that play the game pose the
// shot. No pointer lock is needed — the camera is aimed directly.

import { S, rng, player, pushFeed, pushRadio } from './state.js';

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
    // Mid-round site execute on Furnace: the smoker's cloud hangs on the
    // east door, the entry is pushing through it, the carrier follows
    // with the charge, and the radio carries the plan. The smoke is a
    // real sim object (S.smokes) — it blocks the defenders' vision while
    // the frame is frozen — and the bots run their real execute brains
    // for the frozen steps, so the frame is a live moment, not a pose.
    // The player fires once at step 60, into the smoke, for the flash.
    S.mode = 'play'; S.round = 2; S.scoreA = 1; S.scoreB = 0; S.timeLeft = 73;
    S.bomb.state = 'carried'; S.bomb.carrier = allies[3];
    S.tactics = { site: 'A', phase: 'entry', phaseT: 0, smoked: true,
      roles: { entry: 'Cinder', smoker: 'Tongs', carrier: 'Ferro', trade: 'Anvil', anchor: null } };
    p.hp = 82; p.ammo = { mag: 24, reserve: 90 };
    place(p, 16, 6, -0.28);
    place(allies[0], 19, -4, 0);    // Cinder, entry — through the smoke
    place(allies[1], 16, 2, -0.3);  // Tongs, smoker — just threw it
    place(allies[3], 14, 6, -0.2);  // Ferro, carrier — behind the entry
    place(allies[2], 12, 10, 0);    // Anvil, trade — covering the lane
    allies[0].brain.site = 'A'; allies[0].brain.role = 'entry'; allies[0].brain.state = 'advance';
    allies[1].brain.site = 'A'; allies[1].brain.role = 'smoker'; allies[1].brain.state = 'advance';
    allies[3].brain.site = 'A'; allies[3].brain.role = 'carrier'; allies[3].brain.state = 'advance';
    allies[2].brain.site = 'A'; allies[2].brain.role = 'trade'; allies[2].brain.state = 'advance';
    place(foes[0], 26, -12, Math.PI); // Slag, holding Furnace
    place(foes[1], 18, -14, Math.PI); // Mold, holding Furnace
    foes[0].brain.state = 'hold'; foes[0].brain.holdUntil = 999;
    foes[1].brain.state = 'hold'; foes[1].brain.holdUntil = 999;
    S.smokes.push({ x: 20, y: 1.2, z: -8, until: S.time + 12, born: S.time });
    pushFeed('EXECUTE Furnace — smoke out, entry go', 'a');
    pushRadio('Cinder [ENTRY] — pushing Furnace!');
    pushRadio('Tongs [SMOKER] — smoke on the Furnace door!');
  } else if (mode === 'plant') {
    // The charge is planted at Furnace and a WARDEN is defusing it while
    // the player watches from the site edge. The green defuse bar, the
    // bomb line naming the defuser, and the defuser kneeling on the
    // charge are the frame — and the defuse channel is live (progress
    // 2.0 at staging, +2 s over the frozen steps), so this is the real
    // system running, not a posed prop: one second after the freeze the
    // round would end 'defused'. Allies are staged holding at spawn, far
    // enough that they cannot see (or shoot) the defuser in 120 steps.
    S.mode = 'play'; S.round = 2; S.scoreA = 1; S.scoreB = 1; S.timeLeft = 61;
    S.bomb.state = 'planted'; S.bomb.site = 'A'; S.bomb.timer = 31;
    S.bomb.x = 24; S.bomb.z = -10; S.bomb.progress = 2.0; S.bomb.defuser = foes[0];
    place(p, 20, -6, -0.785);
    place(foes[0], 24, -10, 0); // Slag, defusing on the charge
    foes[0].brain.state = 'defuse';
    place(foes[1], 28, -14, 0); // Mold, covering the site
    foes[1].brain.state = 'hold'; foes[1].brain.holdUntil = 999;
    // The other three defenders start at the far west of Casting: they
    // rotate toward the bomb like the rest, but 40 m+ from the player
    // they cannot see (or shoot) it through the east door in 120 steps.
    // (Before this, Soot killed the player from spawn B mid-freeze.)
    place(foes[2], -28, -18, Math.PI);
    place(foes[3], -24, -20, Math.PI);
    place(foes[4], -20, -18, Math.PI);
    place(allies[0], 0, 18, Math.PI);
    place(allies[1], -6, 19, Math.PI);
    allies[0].brain.state = 'hold'; allies[0].brain.holdUntil = 999;
    allies[1].brain.state = 'hold'; allies[1].brain.holdUntil = 999;
    pushFeed('Charge planted at site A', 'a');
    pushRadio('Slag [DEFUSE] — defusing the charge!');
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
