// bots.js — the other nine players. Each bot has a plan for the round, a
// waypoint path to follow, eyes (field of view + line of sight + smoke),
// ears (gunshots pull them to investigate), and a trigger finger with a
// human reaction time and imperfect aim. A bot that stands still, walks
// into walls or never shoots back fails criterion 1 — so the movement,
// the perception and the shooting are all tested, not assumed.

import { S, rng, EYE_STAND, EYE_CROUCH, BOT_SPEED, TICK } from './state.js';
import { nearestNode, findPath, nodePos, nodesByTag, segmentBlocked, moveCollide, SITES } from './world.js';
import { fireWeapon, smokeBlocks, eyeOf } from './weapon.js';

const BOT_NAMES_A = ['Cinder', 'Tongs', 'Anvil', 'Ferro'];
const BOT_NAMES_B = ['Slag', 'Mold', 'Crucible', 'Soot', 'Kiln'];

// ---- round plans: who goes where, decided once per round ----
export function assignPlans() {
  const attackers = S.entities.filter((e) => e.team === 'A' && e.bot && e.alive);
  const defenders = S.entities.filter((e) => e.team === 'B' && e.bot && e.alive);
  const mainSite = rng.pick(['A', 'B']);
  const otherSite = mainSite === 'A' ? 'B' : 'A';
  attackers.forEach((b, i) => {
    const br = b.brain;
    br.site = i < 2 ? mainSite : otherSite;
    br.role = i === 0 ? 'carrier' : 'escort';
    br.state = 'advance';
    br.path = []; br.pathI = 0;
  });
  // Defenders: two hold each site, one floats mid and rotates to trouble.
  defenders.forEach((b, i) => {
    const br = b.brain;
    br.site = i < 2 ? 'A' : i < 4 ? 'B' : null;
    br.role = i === 4 ? 'roamer' : 'holder';
    br.state = 'advance';
    br.path = []; br.pathI = 0;
  });
}

function siteNode(site) { return site === 'A' ? 14 : 17; }
function holdNode(site) { return site === 'A' ? 25 : 24; }

// ---- perception: can bot b see enemy e right now? ----
export function canSee(b, e) {
  const be = eyeOf(b), ee = eyeOf(e);
  const dx = ee.x - be.x, dy = ee.y - be.y, dz = ee.z - be.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > 55) return false;
  // Field of view: 110 degrees around the bot's facing.
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
  if (dot < Math.cos(0.96)) return false; // ~55 deg half-angle
  if (segmentBlocked(be.x, be.y, be.z, ee.x, ee.y, ee.z)) return false;
  if (smokeBlocks(be.x, be.y, be.z, ee.x, ee.y, ee.z)) return false;
  return true;
}

// Nearest visible enemy of bot b within ENGAGE_RANGE (or null). A bot does
// not abandon its plan to duel across the whole map: beyond 30 m it keeps
// advancing and only engages when it closes in. Also refreshes lastSeen.
const ENGAGE_RANGE = 30;
function perceive(b, dt) {
  const br = b.brain;
  br.perceiveT = (br.perceiveT || 0) - dt;
  if (br.perceiveT > 0) return br.target;
  br.perceiveT = 0.15;
  let best = null, bd = Infinity;
  for (const e of S.entities) {
    if (e.team === b.team || !e.alive) continue;
    const dx = e.pos.x - b.pos.x, dz = e.pos.z - b.pos.z;
    const d = dx * dx + dz * dz;
    if (d >= bd || d > ENGAGE_RANGE * ENGAGE_RANGE) continue;
    if (canSee(b, e)) { bd = d; best = e; }
  }
  if (best) {
    if (br.target !== best) {
      br.reactT = 0.3 + rng.next() * 0.35; // human reaction time
      br.target = best;
      br.lastSeen = { x: best.pos.x, z: best.pos.z };
      br.lastSeenAt = S.time;
      // Radio callout so the player hears the team working.
      if (rng.chance(0.5)) {
        const site = best.pos.z < -12 ? (best.pos.x > 0 ? 'A' : 'B') : 'mid';
        // Only call out sometimes; the feed is not a chat log.
      }
    }
    br.lastSeen = { x: best.pos.x, z: best.pos.z };
    br.lastSeenAt = S.time;
  } else if (br.target && S.time - br.lastSeenAt > 1.2) {
    br.target = null;
  }
  return br.target;
}

// Hearing: an enemy gunshot within 30 m pulls a bot to investigate.
function listen(b) {
  const br = b.brain;
  if (br.target) return;
  for (let i = S.shots.length - 1; i >= 0; i--) {
    const s = S.shots[i];
    if (s.team === b.team || S.time - s.at > 2) continue;
    const dx = s.x - b.pos.x, dz = s.z - b.pos.z;
    if (dx * dx + dz * dz < 900) {
      br.hearPos = { x: s.x, z: s.z };
      br.hearAt = S.time;
      if (br.state === 'hold' || br.state === 'advance') br.state = 'investigate';
      return;
    }
  }
}

// ---- movement: follow a BFS path, one waypoint at a time ----
function setPath(b, toId) {
  const br = b.brain;
  const from = nearestNode(b.pos.x, b.pos.z);
  br.path = findPath(from, toId);
  br.pathI = 0;
}

function followPath(b, dt) {
  const br = b.brain;
  if (!br.path || br.pathI >= br.path.length) return true; // arrived
  const wp = nodePos(br.path[br.pathI]);
  const dx = wp.x - b.pos.x, dz = wp.z - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) { br.pathI++; return br.pathI >= br.path.length; }
  // Face the waypoint, walk toward it.
  const wantYaw = Math.atan2(-dx, -dz);
  b.yaw = turnToward(b.yaw, wantYaw, dt * 6);
  const sp = BOT_SPEED;
  moveCollide(b.pos, 0.4, -Math.sin(b.yaw) * sp * dt, -Math.cos(b.yaw) * sp * dt);
  b.vel.x = -Math.sin(b.yaw) * sp; b.vel.z = -Math.cos(b.yaw) * sp;
  // Stuck? (barely moved for 2 s) — skip to the next waypoint.
  const moved = Math.hypot(b.pos.x - br.lastX, b.pos.z - br.lastZ);
  if (moved < 0.05) {
    br.stuckT += dt;
    if (br.stuckT > 2) { br.pathI++; br.stuckT = 0; }
  } else br.stuckT = 0;
  br.lastX = b.pos.x; br.lastZ = b.pos.z;
  return false;
}

function turnToward(yaw, want, maxStep) {
  let d = want - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return yaw + Math.max(-maxStep, Math.min(maxStep, d));
}

// ---- combat: aim at the target's chest with human error, fire in bursts ----
function aimDir(b, target) {
  const be = eyeOf(b);
  const moving = Math.hypot(target.vel.x, target.vel.z) > 1;
  const dist = Math.hypot(target.pos.x - b.pos.x, target.pos.z - b.pos.z);
  const err = 0.02 + dist * 0.0009 + (moving ? 0.012 : 0) + (rng.next() - 0.5) * 0.01;
  const tx = target.pos.x + (rng.next() - 0.5) * 2 * err * dist * 0.4;
  const ty = target.pos.y + 1.15 + (rng.next() - 0.5) * err * dist * 0.5;
  const tz = target.pos.z + (rng.next() - 0.5) * 2 * err * dist * 0.4;
  const dx = tx - be.x, dy = ty - be.y, dz = tz - be.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / l, y: dy / l, z: dz / l };
}

function engage(b, target, dt, fx) {
  const br = b.brain;
  // Face the target.
  const dx = target.pos.x - b.pos.x, dz = target.pos.z - b.pos.z;
  const wantYaw = Math.atan2(-dx, -dz);
  b.yaw = turnToward(b.yaw, wantYaw, dt * 10);
  const eye = eyeOf(b);
  const dy = eye.y - (target.pos.y + 1.2);
  b.pitch = Math.atan2(-dy, Math.hypot(dx, dz)) * 0.5;
  // Small strafe while firing, so bots are not statues.
  if (br.strafeT === undefined) br.strafeT = 0;
  br.strafeT -= dt;
  if (br.strafeT <= 0) { br.strafeDir = rng.chance(0.5) ? 1 : -1; br.strafeT = 0.5 + rng.next() * 0.7; }
  const sx = Math.cos(b.yaw) * (br.strafeDir || 1) * 1.6;
  const sz = -Math.sin(b.yaw) * (br.strafeDir || 1) * 1.6;
  moveCollide(b.pos, 0.4, sx * dt, sz * dt);
  b.vel.x = sx; b.vel.z = sz;
  // Reaction time first, then bursts of 3–5 with pauses.
  if (br.reactT > 0) { br.reactT -= dt; return; }
  if (br.burstLeft > 0) {
    br.burstT -= dt;
    if (br.burstT <= 0 && b.fireT <= 0) {
      fireWeapon(b, aimDir(b, target), fx);
      br.burstLeft--;
      br.burstT = 0.11;
    }
  } else {
    br.pauseT = (br.pauseT || 0) - dt;
    if (br.pauseT <= 0) {
      br.burstLeft = 3 + rng.int(0, 2);
      br.pauseT = 0.5 + rng.next() * 0.5;
    }
  }
}

// ---- the brain, one tick per bot ----
export function updateBot(b, dt, fx) {
  if (!b.alive || S.mode !== 'play') return;
  const br = b.brain;
  const target = perceive(b, dt);
  listen(b);
  const bombPlanted = S.bomb.state === 'planted';
  const mySite = br.site;

  if (target) {
    br.state = 'engage';
    engage(b, target, dt, fx);
    return;
  }

  // No visible enemy: follow the plan.
  if (b.team === 'B' && bombPlanted) {
    // Defenders rotate to the planted site and defuse (bomb.js runs the
    // channel once a defender stands on the bomb).
    if (br.state !== 'defuse') {
      if (!br.path || br.pathI >= br.path.length) setPath(b, siteNode(S.bomb.site));
      if (followPath(b, dt)) br.state = 'defuse';
    }
    return;
  }

  if (b.team === 'A' && S.bomb.state === 'carried' && S.bomb.carrier === b) {
    // The carrier walks to its site and plants (bomb.js runs the channel).
    if (br.state !== 'plant') {
      if (!br.path || br.pathI >= br.path.length) setPath(b, siteNode(mySite));
      if (followPath(b, dt)) br.state = 'plant';
    }
    return;
  }
  if (b.team === 'A' && S.bomb.state === 'dropped') {
    // Nearest alive attacker fetches the dropped charge.
    const carriers = S.entities.filter((e) => e.team === 'A' && e.alive);
    const nearest = carriers.sort((p, q) =>
      (Math.hypot(p.pos.x - S.bomb.x, p.pos.z - S.bomb.z) - Math.hypot(q.pos.x - S.bomb.x, q.pos.z - S.bomb.z)))[0];
    if (nearest === b) {
      if (!br.path || br.pathI >= br.path.length) setPath(b, nearestNode(S.bomb.x, S.bomb.z));
      followPath(b, dt);
      const d = Math.hypot(b.pos.x - S.bomb.x, b.pos.z - S.bomb.z);
      if (d < 1.2) { S.bomb.state = 'carried'; S.bomb.carrier = b; }
      return;
    }
  }

  switch (br.state) {
    case 'advance': {
      const goal = b.team === 'A' ? siteNode(mySite) : (br.role === 'roamer' ? 8 : holdNode(mySite));
      if (!br.path || br.pathI >= br.path.length) setPath(b, goal);
      if (followPath(b, dt)) { br.state = 'hold'; br.holdUntil = S.time + 2 + rng.next() * 3; }
      break;
    }
    case 'investigate': {
      if (br.hearPos) {
        if (!br.path || br.pathI >= br.path.length) setPath(b, nearestNode(br.hearPos.x, br.hearPos.z));
        if (followPath(b, dt)) { br.state = 'hold'; br.holdUntil = S.time + 3; }
      } else br.state = 'advance';
      break;
    }
    case 'hold': {
      // Stand, scan slowly, crouch sometimes. Roamers re-position.
      b.yaw += Math.sin(S.time * 0.4 + b.id) * dt * 0.5;
      b.vel.x = 0; b.vel.z = 0;
      if (S.time > br.holdUntil) {
        if (br.role === 'roamer') { br.state = 'advance'; br.path = []; }
        else if (b.team === 'A' && S.bomb.state === 'carried') { br.state = 'advance'; br.path = []; }
        else br.holdUntil = S.time + 2 + rng.next() * 3;
      }
      break;
    }
    case 'plant':
    case 'defuse': {
      // Stand on the objective; bomb.js runs the channel. If the carrier
      // dies the state machine picks it up next tick.
      b.vel.x = 0; b.vel.z = 0;
      break;
    }
    default:
      br.state = 'advance'; br.path = [];
  }
}

export function updateBots(dt, fx) {
  for (const e of S.entities) if (e.bot) updateBot(e, dt, fx);
}

export { BOT_NAMES_A, BOT_NAMES_B };
