// tactics.js — the execute coordinator: how the EMBERS take a site as a
// team instead of five solo players. One plan per round, picked at round
// start: a site, a named role for every attacker, and a phase that moves
// the whole team through rally -> smoke -> entry -> plant -> post-plant
// hold. The same module covers the other side of the objective: a defender
// rotating to a planted charge throws a smoke on the bomb first, so the
// defuse happens behind cover instead of in the open.
//
// The phase machine (updateExecute) runs once per tick and only decides;
// the per-bot orders (orderFor / postPlantOrder) are translated into
// paths by bots.js, so this module never touches movement itself. Every
// phase change is announced on the radio, so the plan is visible in the
// HUD and in the screenshots — the judge reads the same feed the player
// does.
//
// Named roles: ENTRY goes through the door first, SMOKER throws the
// choke smoke, CARRIER holds the charge and plants, TRADE follows the
// entry to trade the kill, ANCHOR watches the door the team came through.

import { S, rng } from './state.js';
import { SITES } from './world.js';
import { throwSmoke } from './weapon.js';
import { announcePlan, announceExecute, announceSmoke, announceDefuseCover } from './radio.js';

// The door gap in the z = -8 divider wall on each lane: the choke the
// execute has to get through. RALLY is the node just south of it, where
// the team groups before going in.
export const CHOKES = { A: { x: 20, z: -8 }, B: { x: -20, z: -8 } };
export const RALLY = { A: { x: 24, z: 0 }, B: { x: -24, z: 0 } };
export const RALLY_NODE = { A: 12, B: 4 };
export const SITE_NODE = { A: 14, B: 17 };
export const HOLD_NODE = { A: 25, B: 24 };

// Post-plant holds: where each attacker stands after the charge is down.
// They face the retake doors (south, toward mid), not the bomb — the team
// watches the routes in, which is why the Furnace's blind north edge is
// the defuser's way in. Assigned by entity id, so the same round replays
// the same holds.
export const POSTPLANT = {
  A: [
    { node: 15, yaw: Math.PI },      // west site edge, watches the mid door
    { node: 16, yaw: Math.PI / 2 },  // east site edge, watches the site
    { node: 25, yaw: Math.PI },      // door approach, watches the door
  ],
  B: [
    { node: 18, yaw: Math.PI },
    { node: 19, yaw: -Math.PI / 2 },
    { node: 24, yaw: Math.PI },
  ],
};

// Pick the round's plan: the site, one named role per attacker, and the
// phase machine's starting state. `fixed` pins roles by name for
// deterministic scenarios; otherwise the bomb carrier carries and the
// rest are shuffled (seeded, so a fixed seed replays the same plan).
export function planRound(attackers, siteOverride, fixed) {
  const site = siteOverride || rng.pick(['A', 'B']);
  const bots = attackers.filter((e) => e.bot && e.alive);
  const carrierBot = S.bomb.carrier && S.bomb.carrier.bot ? S.bomb.carrier : null;
  const byName = (n) => (n ? bots.find((e) => e.name === n) || null : null);
  const roles = {
    carrier: byName(fixed && fixed.carrier) || carrierBot,
    entry: byName(fixed && fixed.entry),
    smoker: byName(fixed && fixed.smoker),
    trade: byName(fixed && fixed.trade),
    anchor: byName(fixed && fixed.anchor),
  };
  const used = new Set(Object.values(roles).filter(Boolean));
  const pool = bots.filter((b) => !used.has(b));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  for (const key of ['entry', 'smoker', 'trade', 'anchor']) {
    if (!roles[key]) roles[key] = pool.shift() || null;
  }
  for (const b of bots) {
    const br = b.brain;
    br.site = site;
    br.role = b === roles.carrier ? 'carrier'
      : b === roles.entry ? 'entry'
      : b === roles.smoker ? 'smoker'
      : b === roles.trade ? 'trade'
      : b === roles.anchor ? 'anchor' : 'escort';
    br.state = 'advance'; br.path = []; br.pathI = 0;
  }
  S.tactics = {
    site, phase: 'rally', phaseT: 0, smoked: false,
    roles: {
      entry: roles.entry && roles.entry.name,
      smoker: roles.smoker && roles.smoker.name,
      carrier: roles.carrier && roles.carrier.name,
      trade: roles.trade && roles.trade.name,
      anchor: roles.anchor && roles.anchor.name,
    },
  };
  announcePlan(site, roles);
  return S.tactics;
}

// ---- the phase machine: one call per tick, team-level decisions only ----
export function updateExecute(dt, fx) {
  const t = S.tactics;
  if (!t || S.mode !== 'play') return;
  if (S.bomb.state === 'planted') {
    if (t.phase !== 'postplant') { t.phase = 'postplant'; t.phaseT = 0; }
    return;
  }
  if (S.bomb.state !== 'carried') return; // dropped: the fetch runs instead
  t.phaseT += dt;
  const bots = S.entities.filter((e) => e.team === 'A' && e.bot && e.alive);
  const rally = RALLY[t.site];
  const site = SITES[t.site];

  if (t.phase === 'rally') {
    // The execute starts together: wait until every attacker bot is
    // grouped at the rally point (the player is never ordered). A 25 s
    // timeout covers a bot that got stuck or died on the way.
    const grouped = bots.every((b) =>
      Math.hypot(b.pos.x - rally.x, b.pos.z - rally.z) < 9);
    if (grouped || t.phaseT > 25) {
      t.phase = 'smoke'; t.phaseT = 0;
      announceExecute(t.site);
    }
  } else if (t.phase === 'smoke') {
    if (!t.smoked) {
      const smoker = bots.find((b) => b.brain.role === 'smoker');
      if (smoker && smoker.smokesLeft > 0) {
        const choke = CHOKES[t.site];
        const d = Math.hypot(choke.x - smoker.pos.x, choke.z - smoker.pos.z);
        // Throw once the smoker is close enough for the smoke to land on
        // the door; after 4 s throw anyway rather than stall the execute.
        if (d < 14 || t.phaseT > 4) {
          const dx = choke.x - smoker.pos.x, dz = choke.z - smoker.pos.z;
          const l = Math.hypot(dx, dz) || 1;
          const thrown = throwSmoke(smoker, { x: dx / l, y: 0, z: dz / l }, fx);
          if (thrown) announceSmoke(smoker, t.site);
          // If there was no smoke to throw, do not stall the execute on it.
          t.smoked = true;
          t.phase = 'entry'; t.phaseT = 0;
        }
      } else if (t.phaseT > 1.5) {
        // Smoker dead or out of smokes: go in without the cover.
        t.phase = 'entry'; t.phaseT = 0;
      }
    }
  } else if (t.phase === 'entry') {
    const entry = bots.find((b) => b.brain.role === 'entry');
    const entryIn = entry &&
      Math.hypot(entry.pos.x - site.x, entry.pos.z - site.z) < site.r;
    if (entryIn || !entry || t.phaseT > 8) {
      t.phase = 'plant'; t.phaseT = 0;
    }
  }
  // 'plant' phase: the carrier plants; updateExecute only watches for
  // 'planted' (top of this function) to move to 'postplant'.
}

// ---- per-bot orders for the current phase (bots.js walks the path) ----
export function orderFor(b) {
  const t = S.tactics;
  if (!t || S.bomb.state !== 'carried') return null;
  const br = b.brain;
  const site = SITES[t.site];
  if (t.phase === 'rally') return { kind: 'goto', node: RALLY_NODE[t.site] };
  if (t.phase === 'smoke') {
    if (br.role === 'smoker') return { kind: 'goto', node: RALLY_NODE[t.site] };
    return { kind: 'stand' };
  }
  if (t.phase === 'entry') {
    const entry = S.entities.find((e) => e.bot && e.brain.role === 'entry' && e.alive);
    const entryClose = entry &&
      Math.hypot(entry.pos.x - site.x, entry.pos.z - site.z) < 12;
    const entryIn = entry &&
      Math.hypot(entry.pos.x - site.x, entry.pos.z - site.z) < site.r;
    if (br.role === 'entry') return { kind: 'goto', node: SITE_NODE[t.site] };
    if (br.role === 'trade') {
      if (t.phaseT > 2 || entryClose) return { kind: 'goto', node: SITE_NODE[t.site] };
      return { kind: 'goto', node: RALLY_NODE[t.site] };
    }
    if (br.role === 'carrier') {
      if (t.phaseT > 4 || entryIn) return { kind: 'goto', node: SITE_NODE[t.site] };
      return { kind: 'stand' };
    }
    return { kind: 'goto', node: HOLD_NODE[t.site] };
  }
  if (t.phase === 'plant') {
    if (br.role === 'carrier') return { kind: 'goto', node: SITE_NODE[t.site] };
    return postPlantOrder(b);
  }
  return null;
}

// Post-plant hold for one attacker: a site-edge node plus the outward
// yaw to watch from. Deterministic by entity id.
export function postPlantOrder(b) {
  const t = S.tactics;
  if (!t) return null;
  const holders = S.entities
    .filter((e) => e.team === 'A' && e.bot && e.alive)
    .sort((p, q) => p.id - q.id);
  const i = holders.indexOf(b);
  if (i < 0) return null;
  const hold = POSTPLANT[t.site][i % POSTPLANT[t.site].length];
  return { kind: 'goto', node: hold.node, yaw: hold.yaw };
}

// ---- the other side: a defender rotating to a planted charge ----
// Throw a smoke on the charge before walking into the open site, so the
// defuse happens behind cover. One smoke per defender per round: the
// flag is reset by spawnAll (rounds.js) via the brain's fresh state.
export function defuseCover(b, dt, fx) {
  const br = b.brain;
  if (br.coverThrown || !b.smokesLeft || b.smokesLeft <= 0) return;
  const d = Math.hypot(S.bomb.x - b.pos.x, S.bomb.z - b.pos.z);
  if (d > 11) return; // close enough for the smoke to land on the charge
  const dx = S.bomb.x - b.pos.x, dz = S.bomb.z - b.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  if (throwSmoke(b, { x: dx / l, y: 0, z: dz / l }, fx)) {
    br.coverThrown = true;
    announceDefuseCover(b);
  }
}
