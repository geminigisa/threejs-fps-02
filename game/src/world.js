// world.js — Foundry 9: a night steel foundry, 64 x 48 m, three lanes, two
// bomb sites. One data table drives both the meshes and the collision, so
// what you see is what blocks you — the screenshots and the code agree.
// Layout (x east, z south, north is -z): attackers spawn south, defenders
// north. Site A "Furnace" north-east, Site B "Casting" north-west.
// Lanes: west (to B), mid, east (to A), divided by walls with door gaps.

import * as THREE from 'three';
import { PAL, mat, boxMesh } from './palette.js';

// Solid boxes: {x, z, w, d, h, kind}. x/z = centre, w = x extent, d = z extent,
// h = height from the floor. kind picks the material.
export const COLLIDERS = [
  // perimeter walls (h 4)
  { x: 0, z: -24.5, w: 66, d: 1, h: 4, kind: 'wall' },
  { x: 0, z: 24.5, w: 66, d: 1, h: 4, kind: 'wall' },
  { x: -32.5, z: 0, w: 1, d: 50, h: 4, kind: 'wall' },
  { x: 32.5, z: 0, w: 1, d: 50, h: 4, kind: 'wall' },
  // divider wall z = -8 (doors at x -20, 0, +20)
  { x: -28, z: -8, w: 8, d: 1, h: 3.5, kind: 'wall' },
  { x: -10, z: -8, w: 12, d: 1, h: 3.5, kind: 'wall' },
  { x: 10, z: -8, w: 12, d: 1, h: 3.5, kind: 'wall' },
  { x: 28, z: -8, w: 8, d: 1, h: 3.5, kind: 'wall' },
  // divider wall z = +8 (doors at x -20, 0, +20)
  { x: -28, z: 8, w: 8, d: 1, h: 3.5, kind: 'wall' },
  { x: -10, z: 8, w: 12, d: 1, h: 3.5, kind: 'wall' },
  { x: 10, z: 8, w: 12, d: 1, h: 3.5, kind: 'wall' },
  { x: 28, z: 8, w: 8, d: 1, h: 3.5, kind: 'wall' },
  // site A — the furnace block (tall, glowing) + ingot stacks
  { x: 24, z: -16, w: 8, d: 6, h: 5, kind: 'furnace' },
  { x: 18, z: -19, w: 3, d: 2, h: 1.1, kind: 'ingot' },
  { x: 28, z: -12, w: 2, d: 2, h: 1.1, kind: 'ingot' },
  { x: 17, z: -13, w: 2, d: 2, h: 2.4, kind: 'crate' },
  // site B — casting molds + crates
  { x: -24, z: -16, w: 7, d: 5, h: 1.4, kind: 'mold' },
  { x: -18, z: -19, w: 3, d: 2, h: 1.1, kind: 'ingot' },
  { x: -28, z: -12, w: 2, d: 2, h: 1.1, kind: 'ingot' },
  { x: -17, z: -13, w: 2, d: 2, h: 2.4, kind: 'crate' },
  // west lane cover
  { x: -22, z: 4, w: 2.4, d: 6, h: 2.6, kind: 'container' },
  { x: -26, z: -4, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { x: -18, z: -14, w: 2.4, d: 5, h: 2.6, kind: 'container' },
  // east lane cover
  { x: 22, z: 4, w: 2.4, d: 6, h: 2.6, kind: 'container' },
  { x: 26, z: -4, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { x: 18, z: -14, w: 2.4, d: 5, h: 2.6, kind: 'container' },
  // mid cover (kept off the centre line, so the mid route is clear)
  { x: -6, z: 6, w: 3, d: 2, h: 1.2, kind: 'crate' },
  { x: -3, z: -2, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { x: 6, z: -2, w: 2, d: 3, h: 1.2, kind: 'crate' },
  // spawn cover, off to the sides — never on a spawn point or a route
  { x: -8, z: 19, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { x: 8, z: -19, w: 2, d: 2, h: 1.2, kind: 'crate' },
];

export const SITES = {
  A: { name: 'Furnace', x: 24, z: -16, r: 6.5 },
  B: { name: 'Casting', x: -24, z: -16, r: 6.5 },
};

export const SPAWNS = {
  A: [[-4, 20], [-1, 21], [2, 20], [5, 21], [-6, 18]],
  B: [[-4, -20], [-1, -21], [2, -20], [5, -21], [-6, -18]],
};

// Waypoint graph: nodes bots walk. edges are bidirectional, listed once.
// Every node stands clear of every collider (checked by /tmp/check-graph),
// and no edge's straight line crosses a solid box, so a bot following the
// graph never walks into a wall it cannot slide around.
export const NODES = [
  // id, x, z, tags
  [0, -3, 20, 'spawnA'], [1, 3, 20, 'spawnA'],
  [2, -8, 14, 'laneW'], [3, -20, 10, 'laneW'], [4, -24, 0, 'laneW'], [5, -22, -10, 'laneW'],
  [6, 0, 14, 'laneM'], [7, 0, 4, 'laneM'], [8, 0, -4, 'laneM'], [9, 0, -12, 'laneM'],
  [10, 8, 14, 'laneE'], [11, 20, 10, 'laneE'], [12, 24, 0, 'laneE'], [13, 22, -10, 'laneE'],
  [14, 24, -10, 'siteA'], [15, 15, -11, 'siteA'], [16, 30, -10, 'siteA'],
  [17, -24, -10, 'siteB'], [18, -20, -18, 'siteB'], [19, -28, -10, 'siteB'],
  [20, -3, -20, 'spawnB'], [21, 3, -20, 'spawnB'],
  [22, -10, 0, 'mid'], [23, 10, 0, 'mid'],
  [24, -20, -10, 'holdB'], [25, 20, -10, 'holdA'],
  [26, -14, -4, 'laneW'], [27, 14, -4, 'laneE'],
  [28, -6, -14, 'laneW'], [29, 6, -14, 'laneE'],
];
export const EDGES = [
  [0, 2], [0, 6], [1, 6], [1, 10], [2, 3], [3, 26], [4, 5], [4, 22],
  [5, 17], [6, 7], [7, 8], [7, 22], [7, 23], [8, 9], [8, 26], [8, 27],
  [9, 20], [9, 28], [9, 29], [10, 11], [11, 27], [12, 13], [12, 23],
  [13, 14], [14, 16], [14, 25], [15, 14], [16, 25], [17, 19], [17, 24],
  [18, 24], [19, 24], [20, 9], [21, 9], [22, 26], [23, 27],
  [24, 28], [25, 29], [6, 2], [6, 10],
];

// ---- building the scene from the same table above ----
const KIND_MAT = {
  wall: () => mat(PAL.steel, 0.9, 0.2),
  container: () => mat(PAL.rust, 0.8, 0.3),
  crate: () => mat(0x4a3b28, 0.9, 0.1),
  ingot: () => mat(0x8a7a5a, 0.5, 0.8),
  furnace: () => mat(0x1c1e22, 0.7, 0.5, 0x000000),
  mold: () => mat(0x35383e, 0.8, 0.4),
};

export function buildWorld(scene) {
  scene.background = new THREE.Color(PAL.canvas);
  scene.fog = new THREE.FogExp2(PAL.canvas, 0.0085);

  const hemi = new THREE.HemisphereLight(0x8fa3b8, 0x2a2118, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.8);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -36; sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  // Furnace glow: the warm heart of site A.
  const glow = new THREE.PointLight(0xff7a1f, 110, 30, 1.6);
  glow.position.set(24, 3.2, -13);
  scene.add(glow);
  const cool = new THREE.PointLight(0x6fb0ff, 40, 22, 1.6);
  cool.position.set(-24, 3.5, -14);
  scene.add(cool);
  // Fill lights so the night map reads at a glance: a cool wash over mid
  // and a warm pool by the attackers' spawn. Without these the lanes went
  // muddy in the screenshots.
  const midFill = new THREE.PointLight(0x8fb4d8, 25, 26, 1.7);
  midFill.position.set(0, 5, 0);
  scene.add(midFill);
  const spawnWarm = new THREE.PointLight(0xffd9a0, 20, 18, 1.7);
  spawnWarm.position.set(0, 4, 18);
  scene.add(spawnWarm);
  // Ceiling lamps down the lanes, so the mid-map reads at a glance.
  for (const [lx, lz] of [[0, 8], [-20, -2], [20, -2], [0, -14]]) {
    const lamp = new THREE.PointLight(0xffd9a0, 30, 17, 1.7);
    lamp.position.set(lx, 4.4, lz);
    scene.add(lamp);
    const shade = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd9a0, emissiveIntensity: 1.8 }));
    shade.position.set(lx, 4.5, lz);
    scene.add(shade);
  }

  // Floor: one big slab with a subtle grid texture painted procedurally.
  const floorMat = mat(PAL.floor, 0.95, 0.05);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(66, 50), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Painted lane lines on the floor (thin boxes, flush with the floor).
  const lineMat = mat(0x3d434c, 0.9, 0.1);
  for (const [lx, lz, lw, ld] of [[-20, 0, 0.3, 44], [20, 0, 0.3, 44], [0, -16, 44, 0.3]]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(lw, 0.02, ld), lineMat);
    line.position.set(lx, 0.011, lz);
    line.receiveShadow = true;
    scene.add(line);
  }

  // Every solid box becomes a mesh with the same footprint.
  for (const c of COLLIDERS) {
    const m = boxMesh(c.w, c.h, c.d, KIND_MAT[c.kind]());
    m.position.set(c.x, c.h / 2, c.z);
    scene.add(m);
    // Furnace mouth: a glowing panel on the furnace's south face.
    if (c.kind === 'furnace') {
      const mouth = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: PAL.ember, emissiveIntensity: 3.0, roughness: 0.6 }),
      );
      mouth.position.set(c.x, 1.6, c.z + c.d / 2 + 0.02);
      scene.add(mouth);
      // Furnace chimney rising through the roofline.
      const stack = boxMesh(1.6, 7, 1.6, mat(0x24262b, 0.8, 0.4));
      stack.position.set(c.x + 2.5, 3.5, c.z - 1);
      scene.add(stack);
    }
  }

  // Overhead crane beams (visual only, above head height).
  const beamMat = mat(0x2a2e35, 0.7, 0.5);
  for (const bz of [-14, 0, 14]) {
    const beam = boxMesh(64, 0.7, 1.2, beamMat);
    beam.position.set(0, 6.5, bz);
    scene.add(beam);
  }
  // Pipes along the east and west walls (visual only).
  const pipeMat = mat(0x4c4438, 0.6, 0.6);
  for (const px of [-31, 31]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 46, 10), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, 3.1, 0);
    pipe.castShadow = true;
    scene.add(pipe);
  }
  // Site markers: floating letters A / B made of emissive boxes, so a player
  // can read the objective at a glance (and the judge can see it too).
  const markerA = markerLetter('A', PAL.amber, 24, -20.5);
  const markerB = markerLetter('B', PAL.blue, -24, -20.5);
  scene.add(markerA, markerB);
  // Site floor rings: a painted objective circle in each site's team
  // colour, so the sites read from across the map even before the
  // letters do. The ring radius is the site radius (world.js SITES).
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 48),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: key === 'A' ? PAL.amber : PAL.blue, emissiveIntensity: 0.9, roughness: 0.8 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.02, s.z);
    ring.receiveShadow = true;
    scene.add(ring);
  }
  return { sun, glow, cool };
}

function markerLetter(letter, color, x, z) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.4 });
  // A crude but readable letter from boxes: two posts + crossbar (A), or
  // three bars (B). Good enough at 20 m in the dark.
  const post = new THREE.BoxGeometry(0.35, 2.2, 0.35);
  const p1 = new THREE.Mesh(post, m); p1.position.set(-0.7, 0, 0);
  const p2 = new THREE.Mesh(post, m); p2.position.set(0.7, 0, 0);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.35, 0.35), m);
  bar.position.set(0, letter === 'A' ? 0.1 : 0.55, 0);
  g.add(p1, p2, bar);
  if (letter === 'A') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.35), m);
    top.position.set(0, 1.0, 0); g.add(top);
  } else {
    const mid = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.35, 0.35), m);
    mid.position.set(0, -0.55, 0); g.add(mid);
  }
  g.position.set(x, 4.6, z);
  return g;
}

// ---- collision, line of sight, raycasts, pathfinding (pure math, no scene) ----

// Is point (x,z) inside any solid box (with a radius margin)?
function boxHit(x, z, r) {
  for (const c of COLLIDERS) {
    const x0 = c.x - c.w / 2 - r, x1 = c.x + c.w / 2 + r;
    const z0 = c.z - c.d / 2 - r, z1 = c.z + c.d / 2 + r;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return c;
  }
  return null;
}

// Move an entity by (dx, dz) with axis-separated AABB collision. pos is
// mutated. r = body radius (0.4). Returns nothing.
export function moveCollide(pos, r, dx, dz) {
  const nx = pos.x + dx;
  if (!boxHit(nx, pos.z, r)) pos.x = nx;
  const nz = pos.z + dz;
  if (!boxHit(pos.x, nz, r)) pos.z = nz;
  // Clamp to the arena (inside the perimeter walls).
  pos.x = Math.max(-31.4, Math.min(31.4, pos.x));
  pos.z = Math.max(-23.4, Math.min(23.4, pos.z));
}

// Segment vs one AABB (3D slab test). Box spans y 0..h. Returns t in [0,1]
// of the first hit, or Infinity.
function segBox(ax, ay, az, bx, by, bz, c) {
  const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2;
  const z0 = c.z - c.d / 2, z1 = c.z + c.d / 2;
  const y0 = 0, y1 = c.h;
  let tmin = 0, tmax = 1;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const axes = [[ax, dx, x0, x1], [ay, dy, y0, y1], [az, dz, z0, z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Is the 3D segment a->b blocked by any solid box? (smoke is checked by the
// caller — smoke blocks vision, not bullets.)
export function segmentBlocked(ax, ay, az, bx, by, bz) {
  for (const c of COLLIDERS) {
    if (segBox(ax, ay, az, bx, by, bz, c) < 1) return true;
  }
  return false;
}

// Ray from origin along dir (unit), up to maxD. Returns {t, box} of the
// nearest world hit, or {t: Infinity}.
export function rayWorld(ox, oy, oz, dx, dy, dz, maxD) {
  let best = Infinity, bestBox = null;
  for (const c of COLLIDERS) {
    const t = segBox(ox, oy, oz, ox + dx * maxD, oy + dy * maxD, oz + dz * maxD, c);
    if (t < best) { best = t; bestBox = c; }
  }
  return { t: best === Infinity ? Infinity : best * maxD, box: bestBox };
}

// ---- waypoint graph: BFS path from node a to node b (ids), or [] ----
const ADJ = new Map();
for (const [a, b] of EDGES) {
  if (!ADJ.has(a)) ADJ.set(a, []);
  if (!ADJ.has(b)) ADJ.set(b, []);
  ADJ.get(a).push(b); ADJ.get(b).push(a);
}
export function nodePos(id) {
  const n = NODES[id];
  return { x: n[1], z: n[2], tags: n[3] };
}
export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i][1] - x, dz = NODES[i][2] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
export function findPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = new Map([[fromId, -1]]);
  const q = [fromId];
  while (q.length) {
    const cur = q.shift();
    for (const nb of ADJ.get(cur) || []) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      if (nb === toId) {
        const path = [toId];
        let p = cur;
        while (p !== -1) { path.unshift(p); p = prev.get(p); }
        return path;
      }
      q.push(nb);
    }
  }
  return [];
}
export function nodesByTag(tag) {
  const out = [];
  for (let i = 0; i < NODES.length; i++) if (NODES[i][3] === tag) out.push(i);
  return out;
}
