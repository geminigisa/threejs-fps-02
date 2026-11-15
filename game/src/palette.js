// palette.js — one chosen palette for the whole foundry, night shift.
// Amber furnace glow against cold blue-grey steel; the same six tones the
// HUD, the map and the props all use, so the scene reads at a glance.
import * as THREE from 'three';

export const PAL = {
  canvas: 0x14161a,   // fog / background
  floor: 0x2b2f34,    // foundry floor concrete
  steel: 0x363d47,    // dark steel walls
  steelLight: 0x454e59,
  rust: 0x6b4a2f,     // rusted containers
  amber: 0xf0a830,    // furnace glow, EMBERS team, accents
  amberHot: 0xffb84d,
  ember: 0xff5a1f,    // molten metal
  blue: 0x4da3ff,     // WARDENS team
  ink: 0xe9e6df,      // HUD text
  muted: 0x98a0a8,    // secondary text
  red: 0xe5484d,      // damage / danger
  green: 0x46c07a,    // ok / defuse
};

// One material per (color, rough, metal, emissive) — cached, so the hot loop
// never allocates materials. MeshStandardMaterial keeps the night lighting.
const matCache = new Map();
export function mat(color, rough = 0.85, metal = 0.15, emissive = 0x000000, emissiveIntensity = 1) {
  const key = `${color}|${rough}|${metal}|${emissive}|${emissiveIntensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity });
    matCache.set(key, m);
  }
  return m;
}

// A box mesh from a collider entry: position is its centre, size its extent.
export function boxMesh(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
