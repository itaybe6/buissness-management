// Original background music, synthesised in code (no samples, no licensing):
// a calm I–vi–IV–V style loop — warm pad, plucked arpeggio, soft bass, light
// kick and shaker — with a touch of stereo reverb. Rendered to a 16-bit WAV
// of any length, with fade-in/out, so it can sit under each tutorial video.

import { writeFile } from "node:fs/promises";

const RATE = 44100;
const BPM = 96;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Cmaj7 → Am7 → Fmaj7 → G6 (voicings low to high)
const CHORDS = [
  [48, 52, 55, 59],
  [45, 52, 55, 60],
  [41, 48, 52, 57],
  [43, 50, 55, 59],
];
const ARP = [
  [0, 1, 2, 3, 2, 3, 1, 2],
  [0, 2, 1, 3, 2, 1, 3, 2],
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Render `seconds` of music into Float32 L/R buffers. */
export function renderMusic(seconds, { seed = 7 } = {}) {
  const n = Math.ceil(seconds * RATE);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const rand = rng(seed);

  const addTone = (start, dur, f, amp, { attack = 0.005, tau = 0.4, pan = 0, harm = 0.25, release = 0.08 } = {}) => {
    const s0 = Math.floor(start * RATE);
    const len = Math.floor((dur + release) * RATE);
    const gl = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / RATE;
      let env = t < attack ? t / attack : Math.exp(-(t - attack) / tau);
      if (t > dur) env *= Math.max(0, 1 - (t - dur) / release);
      const ph = 2 * Math.PI * f * t;
      const v = env * (Math.sin(ph) + harm * Math.sin(2 * ph) + harm * 0.35 * Math.sin(3 * ph));
      L[s0 + i] += v * gl;
      R[s0 + i] += v * gr;
    }
  };

  const bars = Math.ceil(seconds / BAR) + 1;
  for (let b = 0; b < bars; b++) {
    const t0 = b * BAR;
    const chord = CHORDS[b % CHORDS.length];
    const section = Math.floor(b / CHORDS.length);

    // pad: two slightly detuned voices per note, slow swell across the bar
    for (const m of chord) {
      for (const det of [0.9985, 1.0015]) {
        addTone(t0, BAR, hz(m) * det, 0.018, { attack: 0.7, tau: 6, harm: 0.08, release: 0.6, pan: det < 1 ? -0.35 : 0.35 });
      }
    }
    // bass on beats 1 and 3
    for (const beat of [0, 2]) addTone(t0 + beat * BEAT, BEAT * 1.8, hz(chord[0] - 12), 0.09, { tau: 0.9, harm: 0.15 });

    // plucked arpeggio an octave up, enters after the first loop
    if (b >= 2) {
      const pattern = ARP[section % ARP.length];
      pattern.forEach((idx, k) => {
        const f = hz(chord[idx] + 12);
        addTone(t0 + k * (BEAT / 2), BEAT / 2, f, 0.05, { tau: 0.32, harm: 0.3, pan: k % 2 ? 0.4 : -0.4 });
      });
    }

    // soft kick on 1 and 3 + shaker on the off-beats, after the intro
    if (b >= 1) {
      for (const beat of [0, 2]) {
        const s0 = Math.floor((t0 + beat * BEAT) * RATE);
        for (let i = 0; i < 0.22 * RATE && s0 + i < n; i++) {
          const t = i / RATE;
          const f = 48 + 70 * Math.exp(-t / 0.03);
          const v = 0.08 * Math.exp(-t / 0.09) * Math.sin(2 * Math.PI * f * t);
          L[s0 + i] += v;
          R[s0 + i] += v;
        }
      }
      for (let k = 0; k < 8; k++) {
        if (k % 2 === 0) continue;
        const s0 = Math.floor((t0 + k * (BEAT / 2)) * RATE);
        let prev = 0;
        for (let i = 0; i < 0.06 * RATE && s0 + i < n; i++) {
          const white = rand() * 2 - 1;
          const hp = white - prev; // crude high-pass
          prev = white;
          const v = 0.012 * Math.exp(-(i / RATE) / 0.025) * hp;
          L[s0 + i] += v * 0.8;
          R[s0 + i] += v;
        }
      }
    }
  }

  // small stereo reverb: a few feedback comb filters per side
  const reverb = (buf, delays) => {
    const wet = new Float32Array(n);
    for (const d of delays) {
      const D = Math.floor(d * RATE);
      const line = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        line[i] = buf[i] + (i >= D ? line[i - D] * 0.42 : 0);
        wet[i] += i >= D ? line[i - D] : 0;
      }
    }
    for (let i = 0; i < n; i++) buf[i] += (wet[i] / delays.length) * 0.35;
  };
  reverb(L, [0.0297, 0.0371, 0.0411]);
  reverb(R, [0.0313, 0.0353, 0.0437]);

  // fades + normalise
  const fadeIn = 1.2 * RATE;
  const fadeOut = 2.5 * RATE;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fadeIn, (n - i) / fadeOut);
    L[i] *= g;
    R[i] *= g;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = 0.7 / (peak || 1);
  for (let i = 0; i < n; i++) {
    L[i] *= norm;
    R[i] *= norm;
  }
  return { L, R };
}

export async function writeMusicWav(file, seconds, opts) {
  const { L, R } = renderMusic(seconds, opts);
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  await writeFile(file, buf);
}
