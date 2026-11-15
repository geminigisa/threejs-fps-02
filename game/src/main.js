// main.js — CINDERWORKS (Foundry 9), a 5v5 round-based tactical FPS.
// Bootstrap, the fixed-step simulation loop (60 Hz, decoupled from
// rendering), and the visual effects (tracers, muzzle flash, sparks,
// smoke). The game is fully playable single-player against nine bots:
// plant the charge at Furnace or Casting, or wipe the other team out.
//
// Import order is deliberate: the dossier shows the modules in this
// depth-first order, so the most important systems come first.
import * as THREE from 'three';
import { buildWorld, SPAWNS } from './world.js';
import { updateBots, BOT_NAMES_A, BOT_NAMES_B } from './bots.js';
import { startRound, updateRounds, restartMatch } from './rounds.js';
import { updateBomb } from './bomb.js';
import { fireWeapon, startReload, updateWeapon, giveWeapon, throwSmoke, WEAPONS } from './weapon.js';
import { updatePlayer, cameraPose, forwardOf } from './player.js';
import { buy } from './economy.js';
import { initHUD, updateHUD, showBanner, flashHitmarker } from './hud.js';
import { ensureAudio, setMuted, sfx } from './audio.js';
import { keys, initInput, requestLock } from './input.js';
import { S, rng, resetMatch, makeEntity, player, TICK } from './state.js';
import { PAL } from './palette.js';
import { setupShot, shotInput, SHOT_STEPS } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1337', 10) || 1337;

let renderer, scene, camera, clock;
let gunModel, flashLight, flashQuad;
const tracers = [];   // pooled THREE.Line, no allocation in the hot loop
const sparks = [];    // pooled small meshes
const smokeSprites = new Map(); // smoke object -> sprite group
let stepAcc = 0, lastT = 0, stepCount = 0;
let stepSoundT = 0;

function makeBotMesh(team) {
  const g = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: team === 'A' ? PAL.amber : PAL.blue, roughness: 0.7, metalness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.85, metalness: 0.2 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.8, 10), torsoMat);
  torso.position.y = 0.95; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), darkMat);
  head.position.y = 1.55; head.castShadow = true; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: team === 'A' ? PAL.amber : PAL.blue, emissiveIntensity: 1.4 }));
  visor.position.set(0, 1.56, -0.18); g.add(visor);
  for (const lx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.22), darkMat);
    leg.position.set(lx, 0.28, 0); g.add(leg);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), darkMat);
  gun.position.set(0.22, 1.25, -0.35); g.add(gun);
  return g;
}

function makeViewModel() {
  const g = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x3d434d, roughness: 0.45, metalness: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.5, emissive: PAL.amber, emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.55), gunMat);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), gunMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.4); g.add(barrel);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), accentMat);
  sight.position.set(0, 0.1, -0.1); g.add(sight);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), gunMat);
  mag.position.set(0, -0.12, 0.05); mag.rotation.x = 0.15; g.add(mag);
  g.scale.setScalar(0.8);
  g.position.set(0.3, -0.28, -0.6);
  return g;
}

function createEntities() {
  S.entities = [];
  const p = makeEntity(0, 'A', false, 'You', 0, 20, 0);
  S.entities.push(p);
  BOT_NAMES_A.forEach((n, i) => {
    const sp = SPAWNS.A[(i + 1) % 5];
    S.entities.push(makeEntity(i + 1, 'A', true, n, sp[0], sp[1], 0));
  });
  BOT_NAMES_B.forEach((n, i) => {
    const sp = SPAWNS.B[i % 5];
    S.entities.push(makeEntity(5 + i, 'B', true, n, sp[0], sp[1], Math.PI));
  });
  for (const e of S.entities) {
    if (e.bot) { e.mesh = makeBotMesh(e.team); scene.add(e.mesh); }
  }
}

// ---- visual effects: pooled, never allocated in the hot loop ----
function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(200,200,205,0.85)');
  grad.addColorStop(0.6, 'rgba(170,170,175,0.45)');
  grad.addColorStop(1, 'rgba(160,160,165,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

let smokeTex = null;
function initFX() {
  for (let i = 0; i < 16; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, until: 0 });
  }
  flashLight = new THREE.PointLight(0xffc46b, 0, 9, 1.8);
  scene.add(flashLight);
  flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(flashQuad);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07),
      new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0 }));
    scene.add(m);
    sparks.push({ m, until: 0, vx: 0, vy: 0, vz: 0 });
  }
  smokeTex = smokeTexture();
  gunModel = makeViewModel();
  camera.add(gunModel);
  scene.add(camera);
}

const fx = {
  tracer(a, b, color) {
    const t = tracers.find((x) => S.time >= x.until) || tracers[0];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.85;
    t.until = S.time + 0.12;
  },
  flash(eye, dir) {
    flashLight.position.set(eye.x + dir.x * 0.7, eye.y + dir.y * 0.7 - 0.08, eye.z + dir.z * 0.7);
    flashLight.intensity = 42;
    flashQuad.position.copy(flashLight.position);
    flashQuad.material.opacity = 0.9;
    flashQuad.lookAt(camera.position);
  },
  spark(pos) {
    let n = 0;
    for (const s of sparks) {
      if (S.time < s.until) continue;
      s.m.position.set(pos.x, pos.y, pos.z);
      s.vx = (rng.next() - 0.5) * 3; s.vy = rng.next() * 2.5; s.vz = (rng.next() - 0.5) * 3;
      s.until = S.time + 0.25;
      s.m.material.opacity = 0.95;
      if (++n >= 3) break;
    }
  },
  smoke(land) {
    const g = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.55, depthWrite: false }));
      const a = rng.next() * Math.PI * 2, r = rng.next() * 2.6;
      sp.position.set(Math.cos(a) * r, 0.6 + rng.next() * 1.8, Math.sin(a) * r);
      const s = 2.4 + rng.next() * 2.2;
      sp.scale.set(s, s, 1);
      g.add(sp);
    }
    g.position.set(land.x, 0, land.z);
    scene.add(g);
    const rec = S.smokes[S.smokes.length - 1];
    if (rec) smokeSprites.set(rec, g);
  },
};

// ---- one fixed simulation step ----
let prevFiring = false;
function step(dt) {
  S.time += dt; S.frame++;
  const p = player();
  if (!p) return;
  if (S.mode === 'play' || S.mode === 'buy') {
    updatePlayer(p, keys, dt);
    updateBots(dt, fx);
    for (const e of S.entities) updateWeapon(e, dt);
    const bombEvent = updateBomb(dt, keys);
    if (bombEvent === 'detonated') { /* rounds.js ends the round on its tick */ }
    // Player trigger: auto weapons fire while held; semi-autos on the edge.
    if (S.mode === 'play' && p.alive) {
      const w = WEAPONS[p.weapon];
      const wantFire = w.auto ? keys.firing : (keys.firing && !prevFiring);
      if (wantFire) {
        if (p.ammo.mag > 0) {
          const hit = fireWeapon(p, forwardOf(p), fx);
          if (hit && hit.hit) flashHitmarker(hit.head, hit.killed);
        } else if (keys.firing && !prevFiring) sfx.dry();
      }
      prevFiring = keys.firing;
      if (p.moving && p.onGround && S.time - stepSoundT > 0.38) { sfx.step(); stepSoundT = S.time; }
    }
  }
  // The round clock runs in every mode: buy counts down to play, play ends
  // by elimination/plant/time, and end advances to the next round. (It must
  // NOT live inside the play/buy block above — that stranded the game in
  // 'end' forever after round 1.)
  updateRounds(dt);
  // Expire smoke visuals with their sim clock.
  for (const [rec, g] of smokeSprites) {
    if (S.time > rec.until) { scene.remove(g); smokeSprites.delete(rec); }
  }
}

// ---- render: meshes follow state, effects decay on sim time ----
function render() {
  const p = player();
  if (!p) return;
  for (const e of S.entities) {
    if (!e.bot || !e.mesh) continue;
    e.mesh.position.set(e.pos.x, e.pos.y, e.pos.z);
    e.mesh.rotation.y = e.yaw;
    if (!e.alive) { e.mesh.rotation.x = -Math.PI / 2; e.mesh.position.y = 0.25; }
  }
  // Camera: menu orbits slowly; in game it is the player's eyes.
  if (S.mode === 'menu') {
    const a = S.time * 0.05;
    camera.position.set(Math.sin(a) * 20, 14, Math.cos(a) * 20);
    camera.lookAt(10, 1, -10);
    gunModel.visible = false;
  } else {
    const pose = cameraPose(p);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-pose.pitch, pose.yaw, 0);
    gunModel.visible = p.alive;
    gunModel.position.z = -0.6 + p.recoil * 1.4;
    gunModel.position.y = -0.28 + Math.sin(S.time * 9) * (p.moving ? 0.008 : 0);
  }
  // Effects decay on sim time, so a frozen screenshot keeps its flash.
  flashLight.intensity = Math.max(0, flashLight.intensity - 900 * TICK);
  flashQuad.material.opacity = Math.max(0, flashQuad.material.opacity - 18 * TICK);
  for (const t of tracers) {
    if (S.time >= t.until) t.line.material.opacity = 0;
    else t.line.material.opacity = 0.85 * ((t.until - S.time) / 0.12);
  }
  for (const s of sparks) {
    if (S.time >= s.until) { s.m.material.opacity = 0; continue; }
    s.m.position.x += s.vx * TICK; s.m.position.y += s.vy * TICK; s.m.position.z += s.vz * TICK;
    s.m.material.opacity = 0.95 * ((s.until - S.time) / 0.25);
  }
  for (const [rec, g] of smokeSprites) {
    const age = (S.time - rec.born) / 12;
    for (const sp of g.children) sp.material.opacity = Math.max(0, 0.55 * (1 - age));
  }
  renderer.render(scene, camera);
}

// ---- boot + the frame loop ----
let frozen = false;

function boot() {
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('game') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
  buildWorld(scene);
  resetMatch(SEED);
  createEntities();
  initFX();
  initHUD({
    onStart: () => {
      ensureAudio();
      S.buyOpen = true;
      startRound();
      showBanner(`ROUND ${S.round}`, 'Plant the charge or wipe them out');
      requestLock();
    },
    onResume: () => { S.paused = false; requestLock(); },
    onNextRound: () => { if (S.mode === 'end') S.endTime = 0; },
    onRestart: () => { restartMatch((SEED + S.round * 7919) % 100000); S.buyOpen = true; startRound(); requestLock(); },
    onBuy: (id) => { if (S.mode === 'buy') buy(id); },
  });
  initInput(renderer.domElement, {
    onLockChange: (locked) => {
      if (!locked && S.mode === 'play' && !SHOT) S.paused = true;
    },
    onReload: () => { const p = player(); if (p) startReload(p); },
    onSlot: (slot) => {
      const p = player();
      if (!p) return;
      if (slot === 1) giveWeapon(p, p.primary || 'rifle');
      if (slot === 2) giveWeapon(p, 'pistol');
    },
    onSmoke: () => {
      const p = player();
      if (p && S.mode === 'play') throwSmoke(p, forwardOf(p), fx);
    },
    onBuyToggle: () => { if (S.mode === 'buy') S.buyOpen = !S.buyOpen; },
    onMute: () => { S.muted = !S.muted; setMuted(S.muted); },
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  if (SHOT) {
    // Deterministic screenshot: stage the scene, run fixed steps, freeze.
    S.mode = 'play';
    setupShot(SHOT, SEED);
  }
  // Debug hook: the live state, for playtesting (never used by the game).
  window.__cinderworks = S;
  lastT = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dtMs = Math.min(100, now - lastT);
  lastT = now;
  if (SHOT) {
    // Scripted input for the frozen modes.
    const si = shotInput(SHOT, stepCount);
    if (si.fire) keys.firing = true; else if (SHOT === 'fight') keys.firing = false;
    if (si.plant) keys.plant = true;
    if (!frozen) {
      step(TICK);
      stepCount++;
      if (stepCount >= (SHOT_STEPS[SHOT] || 90)) {
        frozen = true;
        S.shotReady = true;
        window.__shotReady = true;
      }
    }
  } else if (!S.paused) {
    stepAcc += dtMs / 1000;
    let n = 0;
    while (stepAcc >= TICK && n < 5) { step(TICK); stepAcc -= TICK; n++; }
    if (n === 5) stepAcc = 0;
  }
  updateHUD();
  render();
}

boot();
