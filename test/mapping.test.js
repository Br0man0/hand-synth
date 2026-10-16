import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCALES, heightInZone, noteName, fingerStates, degreeFromFingers, degreeToMidi,
  velocityFromHeight, createStabilizer, createFistDetector, assignHands, freqFromMidi,
} from "../src/mapping.js";
import { makeHand, shape } from "./fixtures/hand.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const fingers = (...names) => fingerStates(makeHand({ fingers: shape(...names) }));

test("heightInZone : bas = 0, haut = 1, borné", () => {
  near(heightInZone(0.9, 0.1, 0.9), 0);
  near(heightInZone(0.1, 0.1, 0.9), 1);
  near(heightInZone(-1, 0.1, 0.9), 1);
});

test("noteName / freqFromMidi", () => {
  assert.equal(noteName(60), "C4");
  assert.equal(noteName(69), "A4");
  near(freqFromMidi(69), 440);
});

test("fingerStates : détecte chaque doigt tendu", () => {
  for (const name of ["thumb", "index", "middle", "ring", "pinky"]) {
    const f = fingers(name);
    for (const other of ["thumb", "index", "middle", "ring", "pinky"]) {
      assert.equal(f[other], other === name, `${name} tendu -> ${other}`);
    }
  }
});

test("fingerStates : insensible à l'inclinaison de la main (±45°)", () => {
  for (const tilt of [-Math.PI / 4, Math.PI / 4]) {
    const f = fingerStates(makeHand({ fingers: shape("index", "middle"), tilt }));
    assert.deepEqual(f, { thumb: false, index: true, middle: true, ring: false, pinky: false });
  }
});

test("degreeFromFingers (R3) : comptage 1–5", () => {
  assert.equal(degreeFromFingers(fingers()), null);
  assert.equal(degreeFromFingers(fingers("index")), 1);
  assert.equal(degreeFromFingers(fingers("index", "middle")), 2);
  assert.equal(degreeFromFingers(fingers("index", "middle", "ring")), 3);
  assert.equal(degreeFromFingers(fingers("index", "middle", "ring", "pinky")), 4);
  assert.equal(degreeFromFingers(fingers("thumb", "index", "middle", "ring", "pinky")), 5);
});

test("degreeFromFingers (R3) : formes spéciales VI et VII", () => {
  assert.equal(degreeFromFingers(fingers("index", "pinky")), 6);
  assert.equal(degreeFromFingers(fingers("thumb", "index", "pinky")), 7);
});

test("degreeToMidi : majeur et mineur, tonalité et octave", () => {
  const C4 = { root: 0, scale: SCALES.major, octave: 4 };
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((d) => noteName(degreeToMidi(d, C4))),
    ["C4", "D4", "E4", "F4", "G4", "A4", "B4"]);
  const Am3 = { root: 9, scale: SCALES.minor, octave: 3 };
  assert.deepEqual([1, 3, 6].map((d) => noteName(degreeToMidi(d, Am3))), ["A3", "C4", "F4"]);
});

test("velocityFromHeight : 0.25 en bas, 1 en haut", () => {
  near(velocityFromHeight(0.85), 0.25);
  near(velocityFromHeight(0.15), 1);
});

test("createStabilizer : ignore les formes intermédiaires brèves", () => {
  const s = createStabilizer(90);
  assert.equal(s(1, 0), null);
  assert.equal(s(1, 100), 1);
  assert.equal(s(2, 130), 1); // passage par 2 pendant 30 ms…
  assert.equal(s(3, 160), 1); // …puis 3…
  assert.equal(s(4, 190), 1); // …on reste sur 1
  assert.equal(s(4, 290), 4); // 4 tenu 100 ms -> validé
});

test("createFistDetector : hystérésis", () => {
  const fist = createFistDetector();
  assert.equal(fist.update(fingers()), true);
  assert.equal(fist.update(fingers("index")), true); // 1 doigt : on reste fermé
  assert.equal(fist.update(fingers("index", "middle")), false);
  assert.equal(fist.update(fingers("index")), false); // 1 doigt : on reste ouvert
  assert.equal(fist.update(fingers("thumb")), true); // le pouce ne compte pas
});

test("assignHands : côté à l'écran, vidéo miroir", () => {
  const a = makeHand({ cx: 0.2 }); // écran 0.8 -> droite
  const b = makeHand({ cx: 0.8 }); // écran 0.2 -> gauche
  assert.deepEqual(assignHands([b, a]), { left: b, right: a });
  assert.deepEqual(assignHands([a]), { left: null, right: a });
  assert.deepEqual(assignHands([b]), { left: b, right: null });
  assert.deepEqual(assignHands([]), { left: null, right: null });
});
