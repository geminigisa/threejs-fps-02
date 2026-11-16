// scenario.js — deterministic test scenarios, enabled only by ?scenario=.
// A scenario stages positions at round start and then lets the real
// systems run: no gameplay code is bypassed, no god-mode, no teleports
// mid-round, no disabled perception. If the scenario ends with the round
// won by defusal, the plant -> fuse -> rotate -> defuse chain is proven
// live, not just code-reviewed. Scenarios never run in normal play: with
// no ?scenario= parameter this module does nothing at all.
//
// plant-defuse: the EMBERS execute on Furnace (smoke + entry + plant)
// while every WARDEN is staged holding Casting; the plant triggers the
// real rotate-to-site behaviour, and the first defender in range throws
// a smoke on the charge and defuses behind it (tactics.defuseCover).
// The round must end 'defused' inside the 40 s fuse.

import { S, player, pushFeed, pushRadio } from './state.js';
import { planRound } from './tactics.js';

export const SCENARIO_NAMES = ['plant-defuse'];

let active = null;
let stagedRound = 0;
let lastBombState = null;
let lastRoundEnd = 0;
let defuserLogged = false;
const log = [];

export function scenarioLog() { return log; }

function slog(ev, detail) {
  const line = `[${S.time.toFixed(1)}s r${S.round}] ${ev}${detail ? ' — ' + detail : ''}`;
  log.push(line);
  console.log('[scenario]', line);
}

// Called once from main.js boot when ?scenario= is present. Exposes the
// log and the done flag for headless playtest harnesses.
export function setupScenario(name) {
  if (!SCENARIO_NAMES.includes(name)) {
    console.warn('[scenario] unknown scenario:', name);
    return;
  }
  active = name;
  window.__scenarioLog = log;
  window.__scenarioDone = false;
  window.__scenarioName = name;
  slog('active', name);
}

function put(e, x, z, yaw) {
  e.pos.x = x; e.pos.z = z; e.pos.y = 0;
  e.vel.x = 0; e.vel.y = 0; e.vel.z = 0;
  e.yaw = yaw; e.pitch = 0;
  e.alive = true; e.hp = e.maxHp;
}

function stagePlantDefuse() {
  const byName = (n) => S.entities.find((e) => e.name === n);
  const allies = S.entities.filter((e) => e.team === 'A' && e.bot);
  // Force the charge onto a bot: the headless player never moves, so a
  // player carrier would stand at spawn and the round could never plant.
  const carrier = byName('Tongs');
  S.bomb.state = 'carried'; S.bomb.carrier = carrier;
  S.bomb.site = null; S.bomb.progress = 0; S.bomb.defuser = null;
  // The plan is fixed so the run is reproducible: Furnace, Tongs carries,
  // Cinder entry, Anvil smoke, Ferro trade.
  planRound(allies, 'A', { carrier: 'Tongs', entry: 'Cinder', smoker: 'Anvil', trade: 'Ferro' });
  // Attackers start on the east-lane approach to the rally point.
  put(byName('Tongs'), 20, 10, 0);
  put(byName('Cinder'), 16, 12, 0);
  put(byName('Anvil'), 22, 12, 0);
  put(byName('Ferro'), 18, 14, 0);
  // Every defender holds Casting, far from Furnace: the plant must pull
  // them across the map through the real rotate behaviour.
  const foeSpots = [
    ['Slag', -20, -18], ['Mold', -28, -10], ['Crucible', -24, -20],
    ['Soot', -18, -12], ['Kiln', -26, -18],
  ];
  for (const [n, x, z] of foeSpots) {
    const f = byName(n);
    put(f, x, z, Math.PI);
    f.brain.site = 'B'; f.brain.role = 'holder'; f.brain.state = 'hold';
    f.brain.path = []; f.brain.pathI = 0; f.brain.target = null;
    f.brain.holdUntil = S.time + 30;
  }
  // The player stays at spawn, out of the way.
  const p = player();
  if (p) put(p, 0, 20, 0);
  pushFeed('SCENARIO plant-defuse — round staged', '');
  pushRadio('SCENARIO: execute Furnace, WARDENS hold Casting');
  slog('staged', 'carrier Tongs -> Furnace, all WARDENS hold Casting');
}

// One call per tick from main.js step(). Stages each round while the
// scenario is not yet proven, and records every bomb/round transition.
export function scenarioTick() {
  if (!active) return;
  if (S.mode === 'buy' && S.round !== stagedRound) {
    stagedRound = S.round;
    defuserLogged = false;
    lastBombState = S.bomb.state;
    if (active === 'plant-defuse') stagePlantDefuse();
  }
  if (S.bomb.state !== lastBombState) {
    lastBombState = S.bomb.state;
    if (S.bomb.state === 'planted') {
      slog('PLANTED', `site ${S.bomb.site}, fuse ${S.bomb.timer.toFixed(0)}s`);
    } else if (S.bomb.state === 'defused') {
      slog('DEFUSED', `by ${S.bomb.defuser ? S.bomb.defuser.name : '?'}`);
    } else if (S.bomb.state === 'detonated') {
      slog('DETONATED', 'fuse ran out');
    } else if (S.bomb.state === 'dropped') {
      slog('DROPPED', 'carrier died');
    }
  }
  if (S.bomb.state === 'planted' && S.bomb.defuser && !defuserLogged) {
    defuserLogged = true;
    slog('DEFUSER', `${S.bomb.defuser.name} on the charge`);
  }
  if (S.mode === 'end' && S.round !== lastRoundEnd) {
    lastRoundEnd = S.round;
    slog('ROUND END', `${S.winReason} — EMB ${S.scoreA} : ${S.scoreB} WRD`);
    if (S.winReason === 'defused') {
      window.__scenarioDone = true;
      slog('PROVEN', 'plant -> fuse -> rotate -> defuse completed live');
    }
  }
}
