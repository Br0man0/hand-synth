// Fonctions pures : landmarks MediaPipe -> gestes -> notes.
// Coordonnées MediaPipe normalisées : x, y dans [0, 1], origine en haut à gauche
// de l'image caméra BRUTE (non miroir).

/** Indices des 21 landmarks MediaPipe utilisés. */
export const LM = {
  WRIST: 0,
  THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_TIP: 12,
  RING_PIP: 14, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_TIP: 20,
};

export const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII"];

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // mineur naturel
};

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 0 en bas de la zone, 1 en haut. */
export function heightInZone(y, top, bottom) {
  return clamp01((bottom - y) / (bottom - top));
}

export const midiFromFreq = (hz) => 69 + 12 * Math.log2(hz / 440);
export const freqFromMidi = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Nom de note avec octave, ex. 60 -> "C4". */
export function noteName(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Nom de note sans octave, ex. 0 -> "C". */
export const pitchClassName = (pc) => NOTE_NAMES[((pc % 12) + 12) % 12];

// ---------- Doigts ----------

/**
 * Doigts tendus, indépendamment de l'inclinaison de la main.
 * Un doigt est tendu si son bout est nettement plus loin du poignet que son
 * articulation PIP. On ne compare pas les y (comme gesture-synth) : ça échoue dès
 * que la main penche.
 * Le pouce est tendu si son bout est loin de la base du majeur (rapporté à la
 * largeur de la paume). Replié sur la paume ou contre l'index, il en est proche.
 */
export function fingerStates(lm) {
  const w = lm[LM.WRIST];
  const ext = (tip, pip) => dist(w, lm[tip]) > dist(w, lm[pip]) * 1.1;
  const palmWidth = dist(lm[LM.INDEX_MCP], lm[LM.PINKY_MCP]);
  return {
    thumb: palmWidth > 1e-6 && dist(lm[LM.THUMB_TIP], lm[LM.MIDDLE_MCP]) > palmWidth * 0.9,
    index: ext(LM.INDEX_TIP, LM.INDEX_PIP),
    middle: ext(LM.MIDDLE_TIP, LM.MIDDLE_PIP),
    ring: ext(LM.RING_TIP, LM.RING_PIP),
    pinky: ext(LM.PINKY_TIP, LM.PINKY_PIP),
  };
}

export const countFingers = (f) => FINGERS.filter((k) => f[k]).length;

/**
 * Option R3 : degré 1–7 depuis la forme de la main droite, ou null (poing).
 *   1 à 5 doigts tendus        -> I à V
 *   index + auriculaire        -> VI
 *   index + auriculaire + pouce -> VII
 * Les formes spéciales sont testées avant le comptage (elles ont 2 et 3 doigts).
 */
export function degreeFromFingers(f) {
  if (f.index && f.pinky && !f.middle && !f.ring) return f.thumb ? 7 : 6;
  const n = countFingers(f);
  return n === 0 ? null : n;
}

/** Degré (1–7) -> numéro MIDI dans la tonalité et l'octave choisies. */
export function degreeToMidi(degree, { root = 0, scale = SCALES.major, octave = 4 } = {}) {
  return 12 * (octave + 1) + root + scale[degree - 1];
}

/** Hauteur de la main gauche au moment de frapper -> vélocité 0.25..1 (brillance de l'attaque). */
export function velocityFromHeight(y) {
  return 0.25 + 0.75 * heightInZone(y, 0.15, 0.85);
}

/** Hauteur de la main gauche -> volume 0..1, lu en continu tant que le poing est fermé. */
export function volumeFromHeight(y) {
  return heightInZone(y, 0.15, 0.85);
}

/**
 * Rotation de la main dans le plan de l'image, en degrés : 0 = main verticale
 * (doigts vers le haut), signe selon le sens. Mesurée sur l'axe poignet -> base
 * du majeur, qui ne dépend pas des doigts tendus ou repliés.
 */
export function handRoll(lm) {
  const w = lm[LM.WRIST];
  const m = lm[LM.MIDDLE_MCP];
  return (Math.atan2(m.x - w.x, w.y - m.y) * 180) / Math.PI;
}

export const DRIVE = { deadZone: 15, fullAt: 60 };

/** Rotation du poignet -> distorsion 0..1, dans un sens comme dans l'autre, avec zone morte. */
export function driveFromRoll(deg, { deadZone, fullAt } = DRIVE) {
  return clamp01((Math.abs(deg) - deadZone) / (fullAt - deadZone));
}

/** Lissage exponentiel (anti-tremblement du tracking). `reset(x)` saute directement à x. */
export function createSmoother(alpha) {
  let v = null;
  const smooth = (x) => (v = v === null ? x : v + alpha * (x - v));
  smooth.reset = (x) => (v = x);
  return smooth;
}

// ---------- Filtrage temporel ----------

/**
 * Stabilisateur : une valeur doit rester identique `holdMs` avant d'être validée.
 * Indispensable pour le comptage : passer de 1 à 4 doigts traverse 2 et 3.
 */
export function createStabilizer(holdMs) {
  let committed = null;
  let pending = null;
  let since = 0;
  return (value, now) => {
    if (value !== pending) {
      pending = value;
      since = now;
    }
    if (now - since >= holdMs) committed = pending;
    return committed;
  };
}

/**
 * Poing de la main gauche avec hystérésis :
 * fermé quand aucun des 4 doigts (hors pouce) n'est tendu, ouvert à partir de 2.
 * Entre les deux, l'état précédent est conservé : pas de rebond sur une main mi-fermée.
 */
export function createFistDetector() {
  let closed = false;
  return {
    update(f) {
      const n = ["index", "middle", "ring", "pinky"].filter((k) => f[k]).length;
      if (n === 0) closed = true;
      else if (n >= 2) closed = false;
      return closed;
    },
    reset(value = false) {
      closed = value;
    },
    get closed() {
      return closed;
    },
  };
}

// ---------- Mains ----------

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
