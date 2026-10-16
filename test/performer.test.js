import { test } from "node:test";
import assert from "node:assert/strict";
import { createPerformer } from "../src/performer.js";
import { SCALES, noteName } from "../src/mapping.js";
import { makeHand, shape } from "./fixtures/hand.js";

const KEY = { root: 0, scale: SCALES.major, octave: 4 };
const R = (...f) => makeHand({ cx: 0.25, fingers: shape(...f) });
const L = (closed, cy = 0.5) =>
  makeHand({ cx: 0.75, cy, fingers: closed ? {} : shape("index", "middle", "ring", "pinky") });

/** Joue une séquence de [durée ms, mains] et collecte les événements. */
function run(seq, perf = createPerformer()) {
  let t = 0;
  const out = [];
  let last;
  for (const [ms, hands] of seq) {
    for (let k = 0; k < ms; k += 20) {
      last = perf({ left: null, right: null, ...hands }, t, KEY);
      for (const e of last.events) out.push(e.type === "on" ? `on ${noteName(e.midi)}` : "off");
      t += 20;
    }
  }
  return { events: out, last };
}

test("D : le poing gauche déclenche et relâche la note choisie à droite", () => {
  const { events } = run([
    [200, { left: L(false), right: R("index", "middle", "ring") }], // III choisi, main ouverte
    [200, { left: L(true), right: R("index", "middle", "ring") }], // poing -> joue E4
    [200, { left: L(false), right: R("index", "middle", "ring") }], // ouvre -> relâche
  ]);
  assert.deepEqual(events, ["on E4", "off"]);
});

test("D : main gauche arrivée déjà fermée -> pas de note avant un nouvel appui", () => {
  const { events } = run([
    [200, { right: R("index") }],
    [200, { left: L(true), right: R("index") }], // arrive fermée : rien
    [100, { left: L(false), right: R("index") }],
    [100, { left: L(true), right: R("index") }], // vrai appui
  ]);
  assert.deepEqual(events.filter((e) => e !== "off").slice(-1), ["on C4"]);
  assert.equal(events.filter((e) => e.startsWith("on")).length, 2); // 1 en mode auto + 1 appui
});

test("D : changer de doigts sous le poing rejoue sans relâcher", () => {
  const { events } = run([
    [200, { left: L(false), right: R("index") }],
    [200, { left: L(true), right: R("index") }],
    [200, { left: L(true), right: R("index", "pinky") }], // VI
    [200, { left: L(true), right: R("thumb", "index", "pinky") }], // VII
  ]);
  assert.deepEqual(events, ["on C4", "on A4", "on B4"]);
});

test("D : la hauteur de la main gauche donne la vélocité", () => {
  const high = run([
    [200, { left: L(false, 0.2), right: R("index") }],
    [100, { left: L(true, 0.2), right: R("index") }],
  ]).last.velocity;
  const low = run([
    [200, { left: L(false, 0.8), right: R("index") }],
    [100, { left: L(true, 0.8), right: R("index") }],
  ]).last.velocity;
  assert.ok(high > 0.9 && low < 0.4, `${high} / ${low}`);
});

test("D : une image sans main gauche ne coupe pas la note", () => {
  const { events } = run([
    [200, { left: L(false), right: R("index") }],
    [100, { left: L(true), right: R("index") }],
    [60, { right: R("index") }], // main gauche perdue 60 ms
    [100, { left: L(true), right: R("index") }],
  ]);
  assert.deepEqual(events, ["on C4"]);
});

test("Une main : chaque degré stable joue, le poing relâche, les formes de passage sont ignorées", () => {
  const { events } = run([
    [200, { right: R("index") }],
    [40, { right: R("index", "middle") }], // passage bref par 2 doigts
    [200, { right: R("index", "middle", "ring") }],
    [200, { right: R() }],
  ]);
  assert.deepEqual(events, ["on C4", "on E4", "off"]);
});

/** Main gauche fermée à la hauteur y (et ouverte si closed = false). */
const Lc = (cy) => L(true, cy);

test("Volume : poing fermé, monter ou descendre la main change le volume pendant la note", () => {
  const perf = createPerformer();
  run([[200, { left: L(false, 0.5), right: R("index") }], [100, { left: Lc(0.5), right: R("index") }]], perf);
  const mid = run([[100, { left: Lc(0.5), right: R("index") }]], perf).last;
  const high = run([[300, { left: Lc(0.2), right: R("index") }]], perf).last;
  const low = run([[300, { left: Lc(0.8), right: R("index") }]], perf).last;
  assert.equal(mid.playing, 60);
  assert.equal(high.playing, 60, "la note continue pendant le geste");
  assert.equal(low.playing, 60);
  assert.ok(Math.abs(mid.volume - 0.5) < 0.05, `mid ${mid.volume}`);
  assert.ok(high.volume > 0.9 && low.volume < 0.1, `${high.volume} / ${low.volume}`);
});

test("Volume : en glissant, aucune note relancée ni coupée", () => {
  const ys = [0.5, 0.45, 0.4, 0.35, 0.3, 0.35, 0.45, 0.55, 0.65, 0.75];
  const { events } = run([
    [200, { left: L(false), right: R("index") }],
    [100, { left: Lc(0.5), right: R("index") }],
    ...ys.map((y) => [40, { left: Lc(y), right: R("index") }]),
  ]);
  assert.deepEqual(events, ["on C4"]);
});

test("Main gauche perdue 400 ms (flou de bougé) : la note tient", () => {
  const { events } = run([
    [200, { left: L(false), right: R("index") }],
    [100, { left: Lc(0.5), right: R("index") }],
    [400, { right: R("index") }],
    [100, { left: Lc(0.4), right: R("index") }],
  ]);
  assert.deepEqual(events, ["on C4"]);
});

test("Main gauche retirée : relâche, et pas de note jouée d'office en mode une main", () => {
  const { events } = run([
    [200, { left: L(false), right: R("index") }],
    [100, { left: Lc(0.5), right: R("index") }],
    [800, { right: R("index") }], // main gauche partie : relâche, puis mode une main
    [200, { right: R("index", "middle") }], // il faut changer de doigts pour jouer
  ]);
  assert.deepEqual(events, ["on C4", "off", "on D4"]);
});

test("Poing fermé avant de choisir la note : la note part dès qu'elle est choisie", () => {
  const { events } = run([
    [200, { left: L(false), right: R() }],
    [100, { left: Lc(0.5), right: R() }], // poing, aucune note
    [200, { left: Lc(0.5), right: R("index", "middle", "ring") }],
  ]);
  assert.deepEqual(events, ["on E4"]);
});

test("Distorsion : suit la rotation du poignet droit, sans changer la note", () => {
  const perf = createPerformer();
  const straight = run([[200, { right: makeHand({ cx: 0.25, fingers: shape("index") }) }]], perf).last;
  const turned = run([[300, { right: makeHand({ cx: 0.25, fingers: shape("index"), tilt: Math.PI / 3 }) }]], perf).last;
  assert.ok(straight.drive < 0.05, `${straight.drive}`);
  assert.ok(turned.drive > 0.75, `${turned.drive}`); // ~52° de rotation effective
  assert.equal(turned.playing, straight.playing);
});
