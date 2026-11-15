// rounds.js — the round lifecycle: buy phase, play, end banner, next round,
// match end. A round ends by elimination, by detonation, by defusal, or by
// the clock. The round loop notices deaths and bomb outcomes on its own
// tick, so no other module needs to call it.

import { S, ROUND_TIME, BUY_TIME, END_TIME, WIN_ROUNDS, MAX_ROUNDS, aliveCount, player, pushFeed, pushRadio } from './state.js';
import { assignPlans } from './bots.js';
import { assignCarrier } from './bomb.js';
import { roundEndPayout, botBuy } from './economy.js';
import { giveWeapon } from './weapon.js';
import { sfx } from './audio.js';
import { SPAWNS } from './world.js';

function spawnAll() {
  for (const e of S.entities) {
    const sp = SPAWNS[e.team][e.id % 5];
    e.pos.x = sp[0]; e.pos.z = sp[1]; e.pos.y = 0;
    e.vel.x = 0; e.vel.y = 0; e.vel.z = 0;
    e.yaw = e.team === 'A' ? 0 : Math.PI; // attackers face north (-z), defenders south
    e.pitch = 0;
    e.hp = e.maxHp; e.alive = true; e.armor = false;
    e.reloadT = 0; e.fireT = 0; e.spread = 0; e.recoil = 0;
    e.smokesLeft = 0;
    if (e.brain) { e.brain.state = 'advance'; e.brain.path = []; e.brain.pathI = 0; e.brain.target = null; e.brain.lastSeen = null; }
  }
  S.smokes = [];
}

export function startRound() {
  spawnAll();
  assignCarrier();
  assignPlans();
  for (const e of S.entities) if (e.bot) botBuy(e);
  S.mode = 'buy';
  S.buyTime = BUY_TIME;
  S.timeLeft = ROUND_TIME;
  S.winner = null; S.winReason = '';
  S.bomb.progress = 0; S.bomb.defuser = null;
  pushFeed(`Round ${S.round} — plant the charge or wipe them out`, '');
}

function endRound(winner, reason) {
  S.mode = 'end';
  S.endTime = END_TIME;
  S.winner = winner; S.winReason = reason;
  if (winner === 'A') S.scoreA++; else S.scoreB++;
  roundEndPayout(winner);
  const p = player();
  if (p) {
    if (winner === p.team) sfx.roundWin(); else sfx.roundLose();
  }
  const reasonText = { elimination: 'team wiped out', detonation: 'charge detonated', defused: 'charge defused', time: 'time expired' }[reason];
  pushFeed(`${winner === 'A' ? 'EMBERS' : 'WARDENS'} take round ${S.round} — ${reasonText}`, winner === 'A' ? 'a' : 'b');
}

export function updateRounds(dt) {
  if (S.mode === 'buy') {
    S.buyTime -= dt;
    if (S.buyTime <= 0) { S.mode = 'play'; S.buyOpen = false; }
    return;
  }
  if (S.mode === 'end') {
    S.endTime -= dt;
    if (S.endTime <= 0) {
      if (S.scoreA >= WIN_ROUNDS || S.scoreB >= WIN_ROUNDS || S.round >= MAX_ROUNDS) {
        S.mode = 'match';
        S.matchWinner = S.scoreA > S.scoreB ? 'A' : S.scoreB > S.scoreA ? 'B' : null;
        pushFeed(S.matchWinner ? `${S.matchWinner === 'A' ? 'EMBERS' : 'WARDENS'} win the match` : 'Match drawn', '');
      } else {
        S.round++;
        startRound();
      }
    }
    return;
  }
  if (S.mode !== 'play') return;
  S.timeLeft -= dt;
  const aAlive = aliveCount('A'), bAlive = aliveCount('B');
  // If the charge is planted and the attackers are all dead, the round is
  // NOT over: the defenders must still defuse before the fuse runs out.
  if (aAlive === 0 && S.bomb.state !== 'planted') return endRound('B', 'elimination');
  if (bAlive === 0) return endRound('A', 'elimination');
  if (S.bomb.state === 'detonated') return endRound('A', 'detonation');
  if (S.bomb.state === 'defused') return endRound('B', 'defused');
  if (S.timeLeft <= 0) {
    // Clock runs out: defenders win — unless the charge is already planted
    // and ticking (then the fuse decides, handled above by detonation).
    if (S.bomb.state === 'planted') return; // fuse still running
    return endRound('B', 'time');
  }
}

// Restart the whole match (from the end screen).
export function restartMatch(seed) {
  S.round = 1; S.scoreA = 0; S.scoreB = 0; S.matchWinner = null;
  S.feed = []; S.radio = [];
  for (const e of S.entities) {
    e.money = 800; e.kills = 0; e.deaths = 0;
    giveWeapon(e, 'rifle');
    e.armor = false;
    if (e === player()) { S.playerMoney = 800; e.primary = 'rifle'; }
  }
  startRound();
}
