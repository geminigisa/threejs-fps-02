# CINDERWORKS — Foundry 9

A 5v5 round-based tactical FPS in three.js. One night shift at a steel
foundry: the EMBERS (attackers, amber) plant the charge at **Furnace (A)**
or **Casting (B)**; the WARDENS (defenders, blue) hold the sites and defuse.
First to 7 rounds (max 13) takes the match.

## How to play

Click to play. **WASD** move, **mouse** look, **click** fire, **R** reload,
**1/2** switch weapons, **4** throw smoke, **E** plant / defuse (hold),
**B** buy menu, **Ctrl** crouch, **Space** jump.

## What is in the game

- **An original map** — Foundry 9 is a 64×48 m night foundry: three lanes,
  two sites, a glowing furnace, casting molds, containers, pipes and an
  overhead crane. Every solid box is one table that drives both the meshes
  and the collision, so what you see is what blocks you.
- **Nine bots with a real brain** — a waypoint graph with BFS routes, field
  of view + line of sight + smoke, hearing (gunshots pull them to
  investigate), reaction time, burst fire with human aim error, and roles:
  the carrier walks to its site and plants, defenders hold and rotate to a
  planted charge to defuse.
- **Rounds, economy and the objective** — 100 s rounds, 9 s buy phase,
  $800 start, kill +$300, round win +$3000, loss +$1900. The charge takes
  3 s to plant, the fuse runs 40 s with a speeding beep, defusing takes 5 s.
  A team that only hunts kills loses to the clock.
- **Gunplay** — three weapons (FR-9 rifle, VK-9 SMG, P-9 sidearm) with
  spread that punishes firing on the move, headshots worth more than body
  shots, reloads, armor, and a smoke grenade that blocks vision (not
  bullets). Muzzle flash, tracers, sparks and smoke are all rendered live.
- **Sound** — everything is synthesized with WebAudio: shots, reloads,
  hit/kill tones, plant/defuse beeps, the explosion, footsteps. No audio
  files, no network.
- **HUD** — health, armor, ammo, money, round timer, score, alive pips,
  kill feed, radio callouts, plant progress, buy menu, banners.

## Files

- `game/src/state.js` — the single game state + seeded RNG (deterministic)
- `game/src/world.js` — the map: colliders, waypoints, collision, LOS, BFS
- `game/src/bots.js` — bot plans, perception, movement, combat
- `game/src/weapon.js` — weapons, hitscan fire, damage, smoke
- `game/src/bomb.js` — plant / defuse / detonation
- `game/src/rounds.js` — buy → play → end → match
- `game/src/economy.js` — money and the buy menu
- `game/src/player.js` — movement, camera, aim
- `game/src/hud.js` — DOM HUD
- `game/src/input.js` — keyboard + mouse + pointer lock
- `game/src/audio.js` — synthesized WebAudio sounds
- `game/src/shots.js` — deterministic screenshot modes (`?shot=start|fight|plant|buy`)
- `game/src/palette.js` — the one palette the whole game shares
- `game/src/main.js` — bootstrap, fixed-step loop (60 Hz), effects

## Build

`main.ts` (repo root) copies `game/` and `screenshots/` into `/output` and
writes `dossier.json` with the kit's `buildDossier`. No build step, no
network at runtime; three.js 0.187.0 is vendored under `game/vendor/`.
