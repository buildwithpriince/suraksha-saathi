// The training fire (D-040): a hand-drawn Lottie animation, three flame tongues (red, orange,
// yellow) that lick and sway in a 1 s loop over a soft glow. Generated, not downloaded, so there
// is no licence question and it ships inside the app (offline). The screen scales it by the fire
// level; this file only draws one flame at size 1. Writes assets/fire.json.
//   node scripts/fire-lottie.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fire.json');
const SIZE = 100; // composition is SIZE x SIZE; the flame base sits at BASE_Y
const BASE_Y = 96;
const FRAMES = 30; // at 30 fps: a 1 s loop
const round = (n) => Math.round(n * 100) / 100;

/** A teardrop flame with its base at (0, 0): width w, height h, tip shifted sideways by dx. */
function flame(w, h, dx) {
  const v = [
    [dx, -h],
    [w / 2, -h * 0.34],
    [0, 0],
    [-w / 2, -h * 0.34],
  ];
  const i = [
    [-w * 0.12 - dx * 0.4, h * 0.28],
    [w * 0.02, -h * 0.3],
    [w * 0.34, 0],
    [0, h * 0.2],
  ];
  const o = [
    [w * 0.12 - dx * 0.4, h * 0.28],
    [0, h * 0.2],
    [-w * 0.34, 0],
    [-w * 0.02, -h * 0.3],
  ];
  return { c: true, v: v.map((p) => p.map(round)), i: i.map((p) => p.map(round)), o: o.map((p) => p.map(round)) };
}

/** An animated flame: `beats` are [heightFactor, tipShift] pairs spread evenly over the loop. */
function flameLayer(ind, name, color, w, h, beats, opacity = 100) {
  const keys = [...beats, beats[0]].map(([hf, dx], k) => {
    const key = { t: round((k * FRAMES) / beats.length), s: [flame(w, h * hf, dx)] };
    return k < beats.length ? { ...key, i: { x: [0.45], y: [1] }, o: { x: [0.55], y: [0] } } : key;
  });
  return shapeLayer(ind, name, [{ ty: 'sh', nm: 'Path', ks: { a: 1, k: keys } }, fill(color, opacity)]);
}

function fill([r, g, b], opacity) {
  return { ty: 'fl', nm: 'Fill', c: { a: 0, k: [r, g, b, 1] }, o: { a: 0, k: opacity }, r: 1 };
}

function shapeLayer(ind, name, items) {
  const transform = { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } };
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm: name,
    sr: 1,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [SIZE / 2, BASE_Y, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
    ao: 0,
    shapes: [{ ty: 'gr', nm: name, it: [...items, transform] }],
    ip: 0,
    op: FRAMES,
    st: 0,
    bm: 0,
  };
}

/** The glow on the ground under the flames, pulsing slightly with them. */
function glowLayer(ind) {
  const ease = { i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } };
  const keys = [
    { t: 0, s: [72, 16], ...ease },
    { t: FRAMES / 2, s: [80, 18], ...ease },
    { t: FRAMES, s: [72, 16] },
  ];
  const ellipse = { ty: 'el', nm: 'Glow', p: { a: 0, k: [0, -2] }, s: { a: 1, k: keys } };
  return shapeLayer(ind, 'Glow', [ellipse, fill([1, 0.45, 0.05], 45)]);
}

// Listed top first. Each tongue has its own rhythm so the outline never repeats in step.
const layers = [
  flameLayer(1, 'Core', [1, 0.93, 0.55], 26, 38, [[1, 0], [1.14, 3], [0.94, -2], [1.08, 1]]),
  flameLayer(2, 'Middle', [1, 0.6, 0.08], 44, 62, [[1, -3], [0.92, 4], [1.1, 0], [0.97, 5], [1.06, -4]]),
  flameLayer(3, 'Outer', [0.92, 0.24, 0.04], 60, 84, [[1, 4], [1.07, -5], [0.93, 2], [1.04, -3]], 92),
  glowLayer(4),
];

const animation = { v: '5.7.4', fr: 30, ip: 0, op: FRAMES, w: SIZE, h: SIZE, nm: 'Fire', ddd: 0, assets: [], layers };
writeFileSync(OUT, `${JSON.stringify(animation)}\n`);
console.log(`wrote ${OUT}`);
