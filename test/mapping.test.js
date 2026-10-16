import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PITCH, SCALES, heightInZone, freqFromHeight, quantize, noteInfo,
  pinchOpenness, cutoffFromOpenness, assignHands, coverRect, playableNotes,
} from "../src/mapping.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** Main factice : 21 points, avec quelques points clés fixés. */
function hand({ x = 0.5, y = 0.5, pinch = 0.1 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  lm[0] = { x, y: y + 0.1, z: 0 }; // poignet
  lm[9] = { x, y, z: 0 }; // base du majeur (paume = 0.1)
  lm[4] = { x: x - pinch / 2, y: y - 0.05, z: 0 }; // pouce
  lm[8] = { x: x + pinch / 2, y: y - 0.05, z: 0 }; // index
  return lm;
}

test("heightInZone : bas = 0, haut = 1, borné", () => {
  near(heightInZone(PITCH.zoneBottom), 0);
  near(heightInZone(PITCH.zoneTop), 1);
  near(heightInZone(0.5), 0.5);
  near(heightInZone(-1), 1);
  near(heightInZone(2), 0);
});

test("freqFromHeight : exponentielle, A2 -> A5", () => {
  near(freqFromHeight(0), 110);
  near(freqFromHeight(1), 880);
  near(freqFromHeight(1 / 3), 220); // une octave par tiers
});

test("quantize : chromatique arrondit au demi-ton", () => {
  near(quantize(445, SCALES.chromatic), 440, 1e-9);
  near(quantize(458, SCALES.chromatic), 440 * 2 ** (1 / 12), 1e-9);
});

test("quantize : pentatonique ne sort que des notes de la gamme", () => {
  for (let hz = 110; hz <= 880; hz *= 1.01) {
    const q = quantize(hz, SCALES.pentatonic);
    const rel = (((Math.round(69 + 12 * Math.log2(q / 440)) - 9) % 12) + 12) % 12;
    assert.ok(SCALES.pentatonic.includes(rel), `${hz} -> ${q} (degré ${rel})`);
  }
});

test("quantize : glissando laisse passer la fréquence", () => {
  near(quantize(447.3, SCALES.glide), 447.3);
});

test("noteInfo : nom et écart en cents", () => {
  assert.deepEqual(noteInfo(440), { name: "A4", cents: 0 });
  assert.deepEqual(noteInfo(261.63), { name: "C4", cents: 0 });
  assert.equal(noteInfo(440 * 2 ** (0.1 / 12)).cents, 10);
});

test("pinchOpenness : 0 doigts collés, 1 main ouverte, indépendant de l'échelle", () => {
  near(pinchOpenness(hand({ pinch: 0.01 })), 0);
  near(pinchOpenness(hand({ pinch: 0.2 })), 1);
  const mid = pinchOpenness(hand({ pinch: 0.06 }));
  assert.ok(mid > 0 && mid < 1);
});

test("cutoffFromOpenness : 200 Hz -> 8 kHz", () => {
  near(cutoffFromOpenness(0), 200);
  near(cutoffFromOpenness(1), 8000, 1e-6);
});

test("assignHands : la main de droite à l'écran (x brut faible) joue la hauteur", () => {
  const a = hand({ x: 0.2 }); // écran : 0.8 -> droite
  const b = hand({ x: 0.8 }); // écran : 0.2 -> gauche
  const both = assignHands([b, a]);
  assert.equal(both.right, a);
  assert.equal(both.left, b);

  assert.deepEqual(assignHands([a]), { left: null, right: a });
  assert.deepEqual(assignHands([b]), { left: b, right: null });
  assert.deepEqual(assignHands([]), { left: null, right: null });
});

test("coverRect : rogne en hauteur quand le conteneur est plus large", () => {
  const r = coverRect(1600, 600, 1280, 720); // 16:6 vs 16:9
  near(r.w, 1600);
  near(r.h, 900);
  near(r.y, -150);
  near(r.x, 0);
});

test("playableNotes : bornes et racines", () => {
  const chroma = playableNotes(SCALES.chromatic);
  assert.equal(chroma.length, 37); // 3 octaves + la note finale
  near(chroma[0].t, 0);
  near(chroma.at(-1).t, 1);
  assert.equal(chroma.filter((n) => n.isRoot).length, 4); // A2 A3 A4 A5
  assert.equal(playableNotes(SCALES.pentatonic).length, 16);
  assert.equal(playableNotes(SCALES.glide).length, 37); // glissando : repères chromatiques
});
