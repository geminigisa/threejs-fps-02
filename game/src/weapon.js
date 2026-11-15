// weapon.js — the arsenal. Hitscan rifles with spread that punishes firing
// on the move, headshots worth more than body shots, reloads, and a smoke
// grenade. Damage is applied here; the round loop (rounds.js) notices the
// deaths on its next tick, so this module never imports rounds.js.

import { rng, S, EYE_STAND, EYE_CROUCH, pushFeed, player } from './state.js';
import { rayWorld } from './world.js';
import { sfx } from './audio.js';

export const WEAPONS = {
  rifle: { name: 'FR-9 Furnace Rifle', price: 2700, auto: true, rpm: 600, mag: 30, reserve: 90, dmg: 34, headDmg: 100, spreadStand: 0.0022, spreadMove: 0.028, spreadCrouch: 0.0012, spreadAir: 0.05, reload: 1.9, range: 120, kick: 0.011 },
  smg: { name: 'VK-9 Viper SMG', price: 1500, auto: true, rpm: 800, mag: 25, reserve: 100, dmg: 25, headDmg: 75, spreadStand: 0.006, spreadMove: 0.03, spreadCrouch: 0.004, spreadAir: 0.055, reload: 1.6, range: 80, kick: 0.008 },
  pistol: { name: 'P-9 Sidearm', price: 0, auto: false, rpm: 400, mag: 12, reserve: Infinity, dmg: 26, headDmg: 78, spreadStand: 0.004, spreadMove: 0.02, spreadCrouch: 0.003, spreadAir: 0.04, reload: 1.2, range: 60, kick: 0.007 },
};
export const SMOKE_PRICE = 300;
export const ARMOR_PRICE = 650;

// Current spread for an entity: stance + movement + recoil bloom.
export function spreadOf(e) {
  const w = WEAPONS[e.weapon];
  const moving = Math.hypot(e.vel.x, e.vel.z) > 0.8;
  let s = e.crouch ? w.spreadCrouch : moving ? w.spreadMove : w.spreadStand;
  if (!e.onGround) s = w.spreadAir;
  return s + e.spread;
}

// Ray vs sphere: returns distance t or Infinity.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

// Eye position of an entity (crouch lowers it).
export function eyeOf(e) {
  return { x: e.pos.x, y: e.pos.y + (e.crouch ? EYE_CROUCH : EYE_STAND), z: e.pos.z };
}

// Fire one hitscan shot from entity e along unit dir. fx = {tracer, flash,
// spark} provided by main.js (visuals only). Returns a hit record for the
// HUD, or null when nothing was hit.
export function fireWeapon(e, dir, fx) {
  const w = WEAPONS[e.weapon];
  if (e.reloadT > 0 || e.fireT > 0 || e.ammo.mag <= 0 || !e.alive) return null;
  e.ammo.mag--;
  e.fireT = 60 / w.rpm;
  e.shotsFired++;
  e.spread = Math.min(0.05, e.spread + 0.006);
  e.recoil = Math.min(0.09, e.recoil + w.kick);
  const eye = eyeOf(e);
  // Every shot is heard: bots investigate enemy gunfire within 30 m.
  S.shots.push({ x: eye.x, y: eye.y, z: eye.z, team: e.team, at: S.time });
  if (S.shots.length > 40) S.shots.shift();
  // Spread: perturb the direction inside a cone (seeded RNG: deterministic).
  const sp = spreadOf(e);
  const rx = (rng.next() - 0.5) * 2 * sp, ry = (rng.next() - 0.5) * 2 * sp;
  // Build an orthonormal basis around dir.
  const ux = dir.z, uz = -dir.x; // horizontal right (dir is horizontal-ish)
  const ul = Math.hypot(ux, uz) || 1;
  const d = {
    x: dir.x + (ux / ul) * rx + dir.y * 0, // yaw perturbation
    y: dir.y + ry,
    z: dir.z + (uz / ul) * rx,
  };
  const dl = Math.hypot(d.x, d.y, d.z);
  d.x /= dl; d.y /= dl; d.z /= dl;
  if (fx) fx.flash(eye, d);
  if (!e.bot) sfx.shot(false); else sfx.shot(true);
  const end = { x: eye.x + d.x * w.range, y: eye.y + d.y * w.range, z: eye.z + d.z * w.range };
  const wHit = rayWorld(eye.x, eye.y, eye.z, d.x, d.y, d.z, w.range);
  let bestT = wHit.t, bestEnt = null, bestHead = false;
  for (const v of S.entities) {
    if (v === e || !v.alive || v.team === e.team) continue;
    const headY = v.pos.y + (v.crouch ? EYE_CROUCH : EYE_STAND) - 0.15;
    const th = raySphere(eye.x, eye.y, eye.z, d.x, d.y, d.z, v.pos.x, headY, v.pos.z, 0.24);
    const tb = raySphere(eye.x, eye.y, eye.z, d.x, d.y, d.z, v.pos.x, v.pos.y + 0.95, v.pos.z, 0.46);
    const t = Math.min(th, tb);
    if (t < bestT) { bestT = t; bestEnt = v; bestHead = th <= tb; }
  }
  const hitPos = { x: eye.x + d.x * bestT, y: eye.y + d.y * bestT, z: eye.z + d.z * bestT };
  if (fx) fx.tracer(eye, bestT === Infinity ? end : hitPos, e.team === 'A' ? 0xffc46b : 0x8ec8ff);
  if (!bestEnt) {
    if (wHit.box && fx) fx.spark(hitPos);
    return { hit: false };
  }
  const dmg = bestHead ? w.headDmg : w.dmg;
  const killed = applyDamage(bestEnt, dmg, e);
  if (fx) fx.spark(hitPos);
  if (e === player()) {
    if (bestHead) sfx.headshot(); else sfx.hit();
    if (killed) sfx.kill();
  }
  return { hit: true, head: bestHead, killed, victim: bestEnt, dmg };
}

// ---- damage, death, reload, loadout ----
export function applyDamage(victim, dmg, attacker) {
  if (!victim.alive) return false;
  if (victim.armor) dmg *= 0.6;
  victim.hp -= dmg;
  if (victim.hp > 0) return false;
  victim.hp = 0; victim.alive = false; victim.deaths++;
  if (attacker) {
    attacker.kills++;
    if (attacker === player()) { S.playerMoney += 300; attacker.money += 300; }
    else attacker.money += 300;
  }
  pushFeed(`${attacker ? attacker.name : 'World'} ▸ ${victim.name}`, attacker && attacker.team === 'A' ? 'a' : 'b');
  // The bomb drops where its carrier falls.
  if (S.bomb.state === 'carried' && S.bomb.carrier === victim) {
    S.bomb.state = 'dropped';
    S.bomb.carrier = null;
    S.bomb.x = victim.pos.x; S.bomb.z = victim.pos.z;
    pushFeed('The charge was dropped', '');
  }
  return true;
}

export function startReload(e) {
  const w = WEAPONS[e.weapon];
  if (e.reloadT > 0 || e.ammo.mag >= w.mag || e.ammo.reserve <= 0) return false;
  e.reloadT = w.reload;
  if (e === player()) sfx.reload();
  return true;
}

export function updateWeapon(e, dt) {
  if (e.fireT > 0) e.fireT -= dt;
  if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - dt * 0.25);
  if (e.spread > 0) e.spread = Math.max(0, e.spread - dt * 0.03);
  // Auto-reload on an empty mag: bots have no R key, and the player gets
  // the standard FPS behaviour of reloading when dry.
  if (e.ammo.mag === 0 && e.ammo.reserve > 0 && e.reloadT <= 0) {
    e.reloadT = WEAPONS[e.weapon].reload;
    if (e === player()) sfx.reload();
  }
  if (e.reloadT > 0) {
    e.reloadT -= dt;
    if (e.reloadT <= 0) {
      const w = WEAPONS[e.weapon];
      const need = w.mag - e.ammo.mag;
      const take = Math.min(need, e.ammo.reserve);
      e.ammo.mag += take;
      e.ammo.reserve -= take;
      e.reloadT = 0;
    }
  }
}

export function giveWeapon(e, id) {
  const w = WEAPONS[id];
  if (!w) return;
  e.weapon = id;
  e.ammo = { mag: w.mag, reserve: w.reserve };
  e.reloadT = 0; e.fireT = 0; e.spread = 0;
}

// Throw a smoke grenade from e along dir: it arcs, lands, and blooms into a
// 12 s vision-blocking cloud. Returns false when e has none left.
export function throwSmoke(e, dir, fx) {
  if (!e.smokesLeft || e.smokesLeft <= 0) return false;
  e.smokesLeft--;
  const eye = eyeOf(e);
  // Simple arc: land ~10 m ahead (or at the first wall).
  const t = Math.min(10, rayWorld(eye.x, eye.y, eye.z, dir.x, 0, dir.z, 10).t);
  const land = { x: eye.x + dir.x * t, y: 0, z: eye.z + dir.z * t };
  S.smokes.push({ x: land.x, y: 1.2, z: land.z, until: S.time + 12, born: S.time });
  if (fx) fx.smoke(land);
  sfx.smoke();
  return true;
}

// Is the segment a->b blocked by any smoke cloud? (Vision only — bullets
// pass through smoke; the cloud hides, it does not stop lead.)
export function smokeBlocks(ax, ay, az, bx, by, bz) {
  for (const s of S.smokes) {
    if (S.time > s.until) continue;
    // Distance from the smoke centre to the segment.
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const apx = s.x - ax, apy = s.y - ay, apz = s.z - az;
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2));
    const dx = ax + abx * t - s.x, dy = ay + aby * t - s.y, dz = az + abz * t - s.z;
    if (dx * dx + dy * dy + dz * dz < 3.4 * 3.4) return true;
  }
  return false;
}
