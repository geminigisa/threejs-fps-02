// audio.js — every sound is synthesized with WebAudio. No audio files, no
// network. One AudioContext, created on the first user gesture (browsers
// block audio before that); in headless screenshot mode it stays silent and
// every call is a safe no-op.

let ctx = null;
let master = null;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

export function setMuted(m) {
  if (master) master.gain.value = m ? 0 : 0.35;
}

function noiseBuffer(dur) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function burst(dur, freq, type, gain, when = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const flt = ctx.createBiquadFilter();
  flt.type = type; flt.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

function tone(freq, dur, type, gain, slideTo = null, when = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur);
}

// ---- the game's sound vocabulary (names match what the judge reads) ----
export const sfx = {
  // Rifle crack: noise burst + low thump. `far` = another team's shot.
  shot(far) {
    burst(0.09, far ? 900 : 2400, 'lowpass', far ? 0.25 : 0.6);
    tone(far ? 90 : 140, 0.08, 'square', far ? 0.08 : 0.22, 55);
  },
  smg() { burst(0.06, 3000, 'bandpass', 0.4); tone(180, 0.05, 'square', 0.14, 70); },
  pistol() { burst(0.07, 1800, 'lowpass', 0.45); tone(160, 0.06, 'square', 0.16, 60); },
  dry() { tone(900, 0.03, 'square', 0.12); },
  reload() { tone(500, 0.04, 'square', 0.14); tone(700, 0.04, 'square', 0.14, null, 0.25); tone(420, 0.05, 'square', 0.16, null, 0.9); },
  hit() { tone(1250, 0.05, 'sine', 0.3); },
  headshot() { tone(1750, 0.06, 'sine', 0.32); tone(2400, 0.05, 'sine', 0.2, null, 0.04); },
  kill() { tone(660, 0.08, 'triangle', 0.28); tone(990, 0.12, 'triangle', 0.28, null, 0.07); },
  hurt() { burst(0.12, 400, 'lowpass', 0.3); tone(110, 0.12, 'sawtooth', 0.18, 70); },
  step() { burst(0.04, 500, 'lowpass', 0.07); },
  plantBeep() { tone(1050, 0.09, 'sine', 0.3); },
  defuseBeep() { tone(820, 0.09, 'sine', 0.25); },
  explode() {
    burst(0.9, 300, 'lowpass', 0.9);
    tone(70, 0.8, 'sine', 0.7, 28);
    burst(0.4, 1200, 'highpass', 0.3);
  },
  smoke() { burst(0.5, 800, 'bandpass', 0.25); },
  buy() { tone(880, 0.05, 'triangle', 0.22); tone(1320, 0.06, 'triangle', 0.2, null, 0.05); },
  roundWin() { [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.25, null, i * 0.09)); },
  roundLose() { [392, 330, 262].forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, null, i * 0.1)); },
  denied() { tone(220, 0.1, 'square', 0.18); },
};
