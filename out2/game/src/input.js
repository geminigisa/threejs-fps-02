// input.js — keyboard + mouse. Pointer lock for real play; in headless
// screenshot mode there is no lock, so the shot modes drive the camera
// directly and this module simply reports no movement. Mouse look writes
// yaw/pitch on the player; the sim reads the `keys` object every tick.

import { S, player } from './state.js';

export const keys = {
  f: false, b: false, l: false, r: false,
  crouch: false, jump: false, sprint: false,
  plant: false, firing: false,
};

let locked = false;
let canvas = null;
let onLockChange = null;

export function isLocked() { return locked; }

export function initInput(c, cb) {
  canvas = c;
  onLockChange = cb.onLockChange || null;
  document.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    switch (ev.code) {
      case 'KeyW': case 'ArrowUp': keys.f = true; break;
      case 'KeyS': case 'ArrowDown': keys.b = true; break;
      case 'KeyA': case 'ArrowLeft': keys.l = true; break;
      case 'KeyD': case 'ArrowRight': keys.r = true; break;
      case 'ControlLeft': case 'ControlRight': keys.crouch = true; break;
      case 'Space': keys.jump = true; ev.preventDefault(); break;
      case 'ShiftLeft': case 'ShiftRight': keys.sprint = true; break;
      case 'KeyE': keys.plant = true; break;
      case 'KeyR': if (cb.onReload) cb.onReload(); break;
      case 'Digit1': if (cb.onSlot) cb.onSlot(1); break;
      case 'Digit2': if (cb.onSlot) cb.onSlot(2); break;
      case 'Digit4': if (cb.onSmoke) cb.onSmoke(); break;
      case 'KeyB': if (cb.onBuyToggle) cb.onBuyToggle(); break;
      case 'KeyM': if (cb.onMute) cb.onMute(); break;
      case 'Escape': break;
    }
  });
  document.addEventListener('keyup', (ev) => {
    switch (ev.code) {
      case 'KeyW': case 'ArrowUp': keys.f = false; break;
      case 'KeyS': case 'ArrowDown': keys.b = false; break;
      case 'KeyA': case 'ArrowLeft': keys.l = false; break;
      case 'KeyD': case 'ArrowRight': keys.r = false; break;
      case 'ControlLeft': case 'ControlRight': keys.crouch = false; break;
      case 'Space': keys.jump = false; break;
      case 'ShiftLeft': case 'ShiftRight': keys.sprint = false; break;
      case 'KeyE': keys.plant = false; break;
    }
  });
  document.addEventListener('mousemove', (ev) => {
    if (!locked) return;
    const p = player();
    if (!p || S.mode !== 'play') return;
    p.yaw -= ev.movementX * 0.0022;
    p.pitch -= ev.movementY * 0.0022;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
  });
  document.addEventListener('mousedown', (ev) => {
    if (ev.button === 0 && S.mode === 'play') keys.firing = true;
  });
  document.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) keys.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(locked);
  });
  document.addEventListener('pointerlockerror', () => {
    // Headless browsers (and some sandboxes) refuse the lock. The game
    // still renders; the mouse just does not turn the camera. Screenshot
    // modes never need the lock.
    locked = false;
  });
}

export function requestLock() {
  if (!canvas) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { locked = false; });
  } catch { locked = false; }
}

export function releaseLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
