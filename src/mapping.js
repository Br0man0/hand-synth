// Fonctions pures : landmarks MediaPipe -> paramètres musicaux.
// Coordonnées MediaPipe normalisées : x, y dans [0, 1], origine en haut à gauche
// de l'image caméra BRUTE (non miroir).

/** Indices des landmarks utilisés (voir le schéma des 21 points MediaPipe). */
export const LM = { WRIST: 0, THUMB_TIP: 4, INDEX_TIP: 8, MIDDLE_MCP: 9 };

export const PITCH = {
  minHz: 110, // A2
  octaves: 3, // -> A5 (880 Hz)
  zoneTop: 0.1, // y du haut de la zone de jeu
  zoneBottom: 0.9, // y du bas de la zone de jeu
};

export const SCALES = {
  glide: null,
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  pentatonic: [0, 3, 5, 7, 10], // pentatonique mineure de La
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** 0 en bas de la zone de jeu, 1 en haut. */
export function heightInZone(y, top = PITCH.zoneTop, bottom = PITCH.zoneBottom) {
  return clamp01((bottom - y) / (bottom - top));
}

/** Hauteur (0..1) -> fréquence, échelle exponentielle (une octave = même distance). */
export function freqFromHeight(t, { minHz, octaves } = PITCH) {
  return minHz * 2 ** (clamp01(t) * octaves);
}

export const midiFromFreq = (hz) => 69 + 12 * Math.log2(hz / 440);
export const freqFromMidi = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Arrondit une fréquence à la note la plus proche de la gamme (racine La). */
export function quantize(hz, scale) {
  if (!scale) return hz;
  const midi = midiFromFreq(hz);
  const base = Math.floor(midi / 12) * 12;
  let best = midi;
  let bestDist = Infinity;
  // On teste l'octave courante et ses voisines pour gérer les bords.
  for (const oct of [base - 12, base, base + 12]) {
    for (const step of scale) {
      const candidate = oct + 9 + step; // 9 = La dans une octave MIDI (C = 0)
      const d = Math.abs(candidate - midi);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
  }
  return freqFromMidi(best);
}

/** Nom de note et écart en cents, ex. { name: "A4", cents: -12 }. */
export function noteInfo(hz) {
  const midi = midiFromFreq(hz);
  const nearest = Math.round(midi);
  const name = NOTE_NAMES[((nearest % 12) + 12) % 12] + (Math.floor(nearest / 12) - 1);
  return { name, cents: Math.round((midi - nearest) * 100) };
}

/** Notes jouables d'une gamme dans la plage, avec leur hauteur 0..1 (pour le rail). */
export function playableNotes(scale, { minHz, octaves } = PITCH) {
  const lo = midiFromFreq(minHz);
  const hi = lo + 12 * octaves;
  const steps = scale ?? SCALES.chromatic;
  const notes = [];
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
    const rel = (((m - 9) % 12) + 12) % 12;
    if (steps.includes(rel)) {
      notes.push({ midi: m, t: (m - lo) / (hi - lo), isRoot: rel === 0 });
    }
  }
  return notes;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Pincement pouce-index normalisé par la taille de la main :
 * 0 = doigts collés, 1 = main grande ouverte. Indépendant de la distance à la caméra.
 */
export function pinchOpenness(lm) {
  const palm = dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP]);
  if (palm < 1e-6) return 0;
  const ratio = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / palm;
  return clamp01((ratio - 0.15) / 0.9);
}

/** Ouverture 0..1 -> fréquence de coupure, exponentielle de 200 Hz à 8 kHz. */
export function cutoffFromOpenness(o) {
  return 200 * 40 ** clamp01(o);
}

/**
 * Répartit les mains détectées selon leur côté À L'ÉCRAN (vidéo miroir).
 * On n'utilise pas le label « handedness » de MediaPipe : il suppose une image
 * déjà miroir et se trompe sur un flux webcam brut.
 * L'écran miroir affiche x_écran = 1 - x, donc la main de droite à l'écran est
 * la main droite de l'utilisateur.
 */
export function assignHands(hands) {
  const withX = hands.map((lm) => ({ lm, screenX: 1 - lm[LM.MIDDLE_MCP].x }));
  if (withX.length >= 2) {
    withX.sort((a, b) => a.screenX - b.screenX);
    return { left: withX[0].lm, right: withX[withX.length - 1].lm };
  }
  if (withX.length === 1) {
    const h = withX[0];
    return h.screenX >= 0.5 ? { left: null, right: h.lm } : { left: h.lm, right: null };
  }
  return { left: null, right: null };
}

/**
 * Rectangle réellement occupé par la vidéo dans son conteneur avec
 * object-fit: cover. Sert à placer le rail sur les vraies coordonnées.
 */
export function coverRect(boxW, boxH, mediaW, mediaH) {
  const scale = Math.max(boxW / mediaW, boxH / mediaH);
  const w = mediaW * scale;
  const h = mediaH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Lissage exponentiel simple, pour stabiliser l'affichage (pas l'audio). */
export function smoother(alpha = 0.35) {
  let v = null;
  return (x) => (v = v === null ? x : v + alpha * (x - v));
}
