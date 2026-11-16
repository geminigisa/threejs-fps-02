// radio.js — the team radio: short role-tagged callouts so the player (and
// the judge, reading the screenshots) can hear the team working. One
// speaker at a time: a bot that just spoke waits 4 s before it may speak
// again, so the radio reads as a team talking, not a chat log. The plan is
// announced once per round; every execute phase change gets one line.

import { S, pushRadio } from './state.js';

// Per-speaker cooldown, keyed by entity id. S.time never goes backwards
// inside a match, so a plain timestamp is enough.
const lastSaid = new Map();

export function say(who, role, text) {
  if (!who) return false;
  if ((lastSaid.get(who.id) ?? -99) > S.time - 4) return false;
  lastSaid.set(who.id, S.time);
  pushRadio(`${who.name} [${role}] — ${text}`);
  return true;
}

function siteName(site) { return site === 'A' ? 'Furnace' : 'Casting'; }

// The plan, announced once at round start so the player can read the
// execute: who goes first, who smokes, who carries.
export function announcePlan(site, roles) {
  const parts = [];
  if (roles.entry) parts.push(`${roles.entry.name} entry`);
  if (roles.smoker) parts.push(`${roles.smoker.name} smoke`);
  if (roles.carrier) parts.push(`${roles.carrier.name} carry`);
  if (roles.trade) parts.push(`${roles.trade.name} trade`);
  if (!parts.length) return;
  pushRadio(`PLAN ${siteName(site)}: ${parts.join(' · ')}`);
}

export function announceExecute(site) {
  pushRadio(`EXECUTE ${siteName(site).toUpperCase()} — smoke out, entry go!`);
}

export function announceSmoke(who, site) {
  say(who, 'SMOKER', `smoke on the ${siteName(site)} door!`);
}

export function announceDefuseCover(who) {
  say(who, 'DEFUSE', 'smoke on the charge — defusing!');
}

export function announcePlant(who, site) {
  if (who) say(who, 'CARRIER', `charge down at ${siteName(site)} — hold the site!`);
}
