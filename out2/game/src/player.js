// player.js — the human player: WASD + mouse look, acceleration, crouch,
// jump, collision with the map, gravity. Movement is deliberately simple
// and honest: stopping to aim pays, because spread punishes firing on the
// move (weapon.js) and speed drops while crouched.

import { S, EYE_STAND, EYE_CROUCH, PLAYER_SPEED, CROUCH_SPEED, GRAVITY, JUMP_V, TICK } from './state.js';
import { moveCollide } from './world.js';

// input: {f, b, l, r, crouch, jump, sprint} — set by input.js every frame.
export function updatePlayer(p, input, dt) {
  if (!p.alive || S.mode !== 'play') return;
  // Look: yaw/pitch are written by input.js from mouse movement.
  // Recoil pulls the pitch up; it recovers as weapon.js decays e.recoil.
  const speed = p.crouch ? CROUCH_SPEED : PLAYER_SPEED;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let mx = 0, mz = 0;
  if (input.f) { mx -= sin; mz -= cos; }
  if (input.b) { mx += sin; mz += cos; }
  if (input.l) { mx -= cos; mz += sin; }
  if (input.r) { mx += cos; mz -= sin; }
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  // Acceleration toward the wish direction, friction when idle.
  const accel = p.onGround ? 34 : 8;
  p.vel.x += mx * accel * dt;
  p.vel.z += mz * accel * dt;
  const fr = p.onGround ? Math.exp(-10 * dt) : Math.exp(-0.4 * dt);
  if (ml === 0) { p.vel.x *= fr; p.vel.z *= fr; }
  const vl = Math.hypot(p.vel.x, p.vel.z);
  if (vl > speed) { p.vel.x *= speed / vl; p.vel.z *= speed / vl; }
  moveCollide(p.pos, 0.4, p.vel.x * dt, p.vel.z * dt);
  // Jump + gravity.
  if (input.jump && p.onGround) { p.vel.y = JUMP_V; p.onGround = false; }
  p.vel.y += GRAVITY * dt;
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.onGround = true; }
  // Footstep sounds while moving on the ground (throttled by main.js).
  p.moving = vl > 1.2;
}

// Where the camera sits this frame (eye height + recoil kick).
export function cameraPose(p) {
  const eye = p.crouch ? EYE_CROUCH : EYE_STAND;
  return {
    x: p.pos.x,
    y: p.pos.y + eye,
    z: p.pos.z,
    yaw: p.yaw,
    pitch: p.pitch + p.recoil,
  };
}

// Forward unit vector from yaw/pitch (three.js convention: -z forward).
export function forwardOf(p) {
  const cp = Math.cos(p.pitch + p.recoil);
  return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch + p.recoil), z: -Math.cos(p.yaw) * cp };
}
