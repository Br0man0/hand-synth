// Logique de jeu, sans DOM ni audio : mains -> événements et contrôles continus.
//
// Main droite (option R3) : la forme de la main choisit le degré I–VII.
//   La rotation du poignet (comme un bouton qu'on tourne) règle la distorsion.
// Main gauche (architecture D) : fermer le poing joue la note choisie, l'ouvrir la
//   relâche, comme une touche. Tant que le poing est fermé, la hauteur de la main
//   règle le volume en continu. Changer de doigts sous le poing rejoue une note.
// Sans main gauche visible : jeu à une main, chaque changement de degré joue la
//   note, et le poing droit la relâche.

import {
  LM, fingerStates, degreeFromFingers, degreeToMidi, velocityFromHeight, volumeFromHeight,
  handRoll, driveFromRoll, createStabilizer, createFistDetector, createSmoother,
} from "./mapping.js";

export const TIMING = {
  degreeHoldMs: 90, // durée minimale d'une forme de main droite avant de changer de note
  // Tolérance si la main gauche disparaît : un geste rapide de haut en bas rend
  // l'image floue et MediaPipe peut la perdre plusieurs images de suite.
  leftGraceMs: 500,
};
const AUTO_LEVEL = 0.8; // volume et vélocité en jeu à une main

export function createPerformer(timing = TIMING) {
  const stabilize = createStabilizer(timing.degreeHoldMs);
  const fist = createFistDetector();
  const smoothVolume = createSmoother(0.35);
  const smoothDrive = createSmoother(0.3);
  let mode = null; // "trigger" (main gauche visible) | "auto" (une main)
  let leftSeenAt = -Infinity;
  let playing = null; // note MIDI en cours, ou null
  let velocity = 0;
  let volume = AUTO_LEVEL;
  let drive = 0;
  let armed = false; // poing fermé par un vrai geste (pas arrivé déjà fermé)
  let autoBaseline; // degré présent au passage en jeu à une main : ne pas le jouer d'office

  /**
   * @param hands  { left, right } landmarks ou null
   * @param now    temps en ms
   * @param key    { root, scale, octave }
   * @returns état pour l'affichage, événements note on/off, contrôles continus
   *          (volume 0..1 et drive 0..1, à appliquer à chaque image)
   */
  return function step({ left, right }, now, key) {
    const events = [];
    const rightFingers = right ? fingerStates(right) : null;
    const degree = stabilize(rightFingers ? degreeFromFingers(rightFingers) : null, now);
    const selected = degree ? degreeToMidi(degree, key) : null;

    // Distorsion : suit la rotation du poignet droit ; garde sa valeur si la main sort.
    if (right) drive = smoothDrive(driveFromRoll(handRoll(right)));

    if (left) leftSeenAt = now;
    const leftActive = left !== null || now - leftSeenAt < timing.leftGraceMs;
    const nextMode = leftActive ? "trigger" : "auto";

    const release = () => {
      if (playing !== null) events.push({ type: "off" });
      playing = null;
    };
    const play = (midi, vel) => {
      playing = midi;
      velocity = vel;
      events.push({ type: "on", midi, velocity: vel });
    };

    if (nextMode !== mode) {
      release();
      // Main gauche arrivée déjà fermée : on attend qu'elle s'ouvre puis se referme.
      fist.reset(left ? fist.update(fingerStates(left)) : false);
      armed = false;
      autoBaseline = mode === "trigger" ? selected : undefined;
      mode = nextMode;
    }

    if (mode === "trigger" && left) {
      const wasClosed = fist.closed;
      const closed = fist.update(fingerStates(left));
      const y = left[LM.MIDDLE_MCP].y;
      if (closed && !wasClosed) {
        armed = true;
        volume = smoothVolume.reset(volumeFromHeight(y)); // l'appui part du bon volume
      } else if (closed) {
        volume = smoothVolume(volumeFromHeight(y)); // puis le suit en continu
      }
      if (!closed) armed = false;

      if (closed && !wasClosed && selected !== null) {
        play(selected, velocityFromHeight(y));
      } else if (armed && playing === null && selected !== null) {
        play(selected, velocityFromHeight(y)); // poing fermé avant d'avoir choisi la note
      } else if (closed && playing !== null && selected !== null && selected !== playing) {
        play(selected, velocity); // nouvelle note sous le même appui
      } else if (!closed && wasClosed) {
        release();
      }
    } else if (mode === "auto") {
      volume = AUTO_LEVEL;
      if (selected !== autoBaseline) autoBaseline = undefined;
      if (autoBaseline === undefined && selected !== playing) {
        if (selected === null) release();
        else play(selected, AUTO_LEVEL);
      }
    }

    return {
      events,
      degree,
      selected,
      playing,
      velocity: playing !== null ? velocity : 0,
      volume,
      drive,
      mode,
      leftClosed: mode === "trigger" ? fist.closed : false,
      rightFingers,
    };
  };
}
