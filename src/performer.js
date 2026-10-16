// Logique de jeu, sans DOM ni audio : mains -> événements note on / note off.
//
// Main droite (option R3) : la forme de la main choisit le degré I–VII.
// Main gauche (architecture D) : fermer le poing joue la note choisie, l'ouvrir la
// relâche, comme une touche. La hauteur de la main au moment de fermer donne la
// vélocité. Changer de doigts pendant que le poing est fermé rejoue une note.
// Sans main gauche visible : jeu à une main, chaque changement de degré joue la
// note, et le poing droit la relâche.

import {
  LM, fingerStates, degreeFromFingers, degreeToMidi, velocityFromHeight,
  createStabilizer, createFistDetector,
} from "./mapping.js";

export const TIMING = {
  degreeHoldMs: 90, // durée minimale d'une forme de main droite avant de changer de note
  leftGraceMs: 200, // tolérance si la main gauche disparaît une ou deux images
};
const AUTO_VELOCITY = 0.8;

export function createPerformer(timing = TIMING) {
  const stabilize = createStabilizer(timing.degreeHoldMs);
  const fist = createFistDetector();
  let mode = null; // "trigger" (main gauche visible) | "auto" (une main)
  let leftSeenAt = -Infinity;
  let playing = null; // note MIDI en cours, ou null
  let velocity = 0;

  /**
   * @param hands  { left, right } landmarks ou null
   * @param now    temps en ms
   * @param key    { root, scale, octave }
   * @returns état pour l'affichage + liste d'événements à envoyer au synthé
   */
  return function step({ left, right }, now, key) {
    const events = [];
    const rightFingers = right ? fingerStates(right) : null;
    const degree = stabilize(rightFingers ? degreeFromFingers(rightFingers) : null, now);
    const selected = degree ? degreeToMidi(degree, key) : null;

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
      // Si la main gauche arrive déjà fermée, on attend qu'elle s'ouvre puis se referme.
      fist.reset(left ? fist.update(fingerStates(left)) : false);
      mode = nextMode;
    } else if (mode === "trigger" && left) {
      const wasClosed = fist.closed;
      const closed = fist.update(fingerStates(left));
      if (closed && !wasClosed && selected !== null) {
        play(selected, velocityFromHeight(left[LM.MIDDLE_MCP].y));
      } else if (closed && playing !== null && selected !== null && selected !== playing) {
        play(selected, velocity); // nouvelle note sous le même appui : même vélocité
      } else if (!closed && wasClosed) {
        release();
      }
    } else if (mode === "auto") {
      if (selected !== playing) {
        if (selected === null) release();
        else play(selected, AUTO_VELOCITY);
      }
    }

    return {
      events,
      degree,
      selected,
      playing,
      velocity: playing !== null ? velocity : 0,
      mode,
      leftClosed: mode === "trigger" ? fist.closed : false,
      rightFingers,
    };
  };
}
