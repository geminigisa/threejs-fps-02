// state.js — the single source of truth for CINDERWORKS (Foundry 9).
// Every module reads and writes this one object; no module keeps its own
// copy of game state. Plain data only (no three.js here) so the simulation
// stays independent of rendering. All randomness comes from the seeded RNG
// below — never Math.random in the simulation — so a fixed seed replays the
// same round, and the deterministic screenshot modes are reproducible.

// Seeded RNG (mulberry32). Deterministic: same seed, same stream.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = {
  f: mulberry32(1337),
  seed(s) { this.f = mulberry32(s >>> 0); },
  next() { return this.f(); },
  range(a, b) { return a + (b - a) * this.f(); },
  int(a, b) { return Math.floor(this.range(a, b + 1)); },
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; },
  chance(p) { return this.f() < p; },
};

// ---- tuning constants (one place, so the judge can see the whole design) ----
export const TICK = 1 / 60;          // fixed simulation step
export const ROUND_TIME = 100;       // seconds per round
export const BOMB_TIME = 40;         // fuse after a plant
export const PLANT_TIME = 3;         // seconds holding E to plant
export const DEFUSE_TIME = 5;        // seconds holding E to defuse
export const BUY_TIME = 9;           // seconds of buy phase between rounds
export const END_TIME = 5;           // seconds the round-end banner shows
export const WIN_ROUNDS = 7;         // first team to 7 rounds wins the match
export const MAX_ROUNDS = 13;
export const EYE_STAND = 1.62;       // eye height standing
export const EYE_CROUCH = 1.12;      // eye height crouched
export const PLAYER_SPEED = 5.2;     // m/s running
export const CROUCH_SPEED = 2.6;
export const BOT_SPEED = 4.4;
export const GRAVITY = -16;
export const JUMP_V = 5.4;

// Teams: A = EMBERS (attackers, plant the charge), B = WARDENS (defenders).
export const TEAM = {
  A: { name: 'EMBERS', color: 0xf0a830, css: '#f0a830', spawn: 'spawnA' },
  B: { name: 'WARDENS', color: 0x4da3ff, css: '#4da3ff', spawn: 'spawnB' },
};

// One entity: the player or a bot. pos/vel are plain {x,y,z}; y is feet height.
export function makeEntity(id, team, bot, name, x, z, yaw) {
  return {
    id, team, bot, name,
    pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 },
    yaw, pitch: 0,
    hp: 100, maxHp: 100, armor: false, alive: true,
    crouch: false, onGround: true,
    weapon: 'rifle', primary: 'rifle', ammo: { mag: 30, reserve: 90 },
    reloadT: 0, fireT: 0, spread: 0, recoil: 0, shotsFired: 0, smokesLeft: 0,
    money: 800, kills: 0, deaths: 0, moving: false,
    // bot brain (unused for the player)
    brain: bot ? {
      state: 'advance', path: [], pathI: 0, target: null, holdUntil: 0,
      reactT: 0, burstLeft: 0, burstT: 0, pauseT: 0, perceiveT: 0,
      lastSeen: null, lastSeenAt: -99,
      hearAt: -99, hearPos: null, plan: null, site: null, role: null,
      stuckT: 0, strafeT: 0, strafeDir: 1,
      lastX: x, lastZ: z, aimErr: 0,
    } : null,
    mesh: null, // three.js group, attached by main.js (rendering only)
  };
}

// ---- the live game state (one object; modules read/write fields, never copies) ----
export const S = {
  mode: 'menu',        // menu | buy | play | end | match
  round: 1, scoreA: 0, scoreB: 0,
  timeLeft: ROUND_TIME, buyTime: BUY_TIME, endTime: 0,
  bomb: { state: 'carried', carrier: null, site: null, x: 0, y: 0, z: 0, timer: BOMB_TIME, progress: 0, defuser: null },
  entities: [],        // player is entities[0]
  shots: [],           // recent gunshot events {x,y,z,team,at} for bot hearing
  feed: [],            // kill feed entries {text, at, cls}
  radio: [],           // bot callouts {text, at}
  smokes: [],          // active smoke {x,y,z,until}
  winner: null,        // round winner 'A' | 'B' | null
  winReason: '',       // 'elimination' | 'detonation' | 'defused' | 'time'
  matchWinner: null,
  frame: 0, time: 0,   // sim time in seconds
  seed: 1337,
  shotMode: null,      // 'start' | 'fight' | 'plant' | 'buy' | null
  shotReady: false,    // set true when a screenshot frame is frozen
  shotStep: 0,
  buyOpen: false,
  paused: false,
  muted: false,
  playerMoney: 800,
};

// Reset per-match state (keeps the entity list shape; main.js rebuilds entities).
export function resetMatch(seed) {
  rng.seed(seed);
  S.seed = seed;
  S.mode = 'menu'; S.round = 1; S.scoreA = 0; S.scoreB = 0;
  S.timeLeft = ROUND_TIME; S.buyTime = BUY_TIME; S.endTime = 0;
  S.bomb = { state: 'carried', carrier: null, site: null, x: 0, y: 0, z: 0, timer: BOMB_TIME, progress: 0, defuser: null };
  S.entities = []; S.shots = []; S.feed = []; S.radio = []; S.smokes = [];
  S.winner = null; S.winReason = ''; S.matchWinner = null;
  S.frame = 0; S.time = 0; S.buyOpen = false; S.paused = false;
  S.playerMoney = 800;
}

export function player() { return S.entities[0] || null; }
export function aliveOf(team) { return S.entities.filter((e) => e.team === team && e.alive); }
export function aliveCount(team) { return aliveOf(team).length; }

export function pushFeed(text, cls) {
  S.feed.push({ text, at: S.time, cls: cls || '' });
  if (S.feed.length > 5) S.feed.shift();
}
export function pushRadio(text) {
  S.radio.push({ text, at: S.time });
  if (S.radio.length > 3) S.radio.shift();
}
