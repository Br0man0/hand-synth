import { Synth } from "./synth.js";
import { startCamera, createHandTracker } from "./vision.js";
import { createOverlay } from "./overlay.js";
import {
  LM, PITCH, SCALES,
  assignHands, heightInZone, freqFromHeight, quantize, noteInfo,
  pinchOpenness, cutoffFromOpenness, playableNotes, coverRect, freqFromMidi,
} from "./mapping.js";

// Réglages quand la main gauche n'est pas visible : on peut jouer à une main.
const DEFAULT_GAIN = 0.6;
const DEFAULT_CUTOFF = 2000;
const VOLUME_ZONE = { top: 0.15, bottom: 0.85 };

const $ = (id) => document.getElementById(id);
const el = {
  app: $("app"), stage: $("stage"), video: $("video"), canvas: $("overlay"),
  gate: $("gate"), start: $("start"), error: $("error"), status: $("status"),
  note: $("note"), detail: $("detail"),
  volume: $("meter-volume"), filter: $("meter-filter"),
  ledLeft: $("led-left"), ledRight: $("led-right"),
  rail: $("rail"), railTicks: $("rail-ticks"), railCursor: $("rail-cursor"),
  mute: $("mute"),
};

const css = getComputedStyle(document.documentElement);
const overlay = createOverlay(el.canvas, {
  left: css.getPropertyValue("--hand-left").trim(),
  right: css.getPropertyValue("--hand-right").trim(),
});

const synth = new Synth();
const state = { scale: SCALES.chromatic, landmarker: null, lastVideoTime: -1, running: false, ui: {} };

const ERRORS = {
  insecure: "La caméra ne fonctionne qu'en HTTPS ou sur localhost. Ouvre la page via son adresse https://.",
  "no-camera-api": "Ce navigateur ne donne pas accès à la caméra. Essaie avec une version récente de Chrome, Edge, Firefox ou Safari.",
  "camera-denied": "L'accès à la caméra a été refusé. Autorise-le dans les réglages du site, puis recharge la page.",
  "camera-missing": "Aucune caméra n'a été trouvée. Branche une webcam, puis réessaie.",
  camera: "La caméra n'a pas pu démarrer. Ferme les autres applications qui l'utilisent, puis réessaie.",
  model: "Le modèle de suivi des mains n'a pas pu se charger. Vérifie ta connexion, puis réessaie.",
};

// ---------- Démarrage ----------

el.start.addEventListener("click", async () => {
  el.error.hidden = true;
  el.start.disabled = true;
  try {
    el.start.textContent = "Ouverture de la caméra…";
    await synth.start(); // dans le geste utilisateur : requis pour l'audio
    const stream = await startCamera(el.video);
    stream.getVideoTracks()[0]?.addEventListener("ended", onCameraLost);
    el.start.textContent = "Chargement du suivi des mains…";
    state.landmarker ??= await createHandTracker();
    el.app.dataset.state = "playing";
    announce("Prêt. Lève la main droite pour jouer.");
    layoutRail();
    if (!state.running) {
      state.running = true;
      requestAnimationFrame(loop);
    }
  } catch (e) {
    console.error(e);
    el.error.textContent = ERRORS[e.code] ?? ERRORS.camera;
    el.error.hidden = false;
    el.start.disabled = false;
    el.start.textContent = "Réessayer";
  }
});

// ---------- Boucle principale ----------

function loop() {
  const { video } = el;
  if (video.readyState >= 2 && video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    overlay.resize(video.videoWidth, video.videoHeight);
    const result = state.landmarker.detectForVideo(video, performance.now());
    const hands = assignHands(result.landmarks);
    play(hands);
    overlay.draw(hands);
  }
  requestAnimationFrame(loop);
}

function play({ left, right }) {
  let freq = null;
  let rawT = null;
  if (right) {
    rawT = heightInZone(right[LM.MIDDLE_MCP].y);
    freq = quantize(freqFromHeight(rawT), state.scale);
  }

  const gain = left
    ? heightInZone(left[LM.MIDDLE_MCP].y, VOLUME_ZONE.top, VOLUME_ZONE.bottom)
    : DEFAULT_GAIN;
  const cutoff = left ? cutoffFromOpenness(pinchOpenness(left)) : DEFAULT_CUTOFF;

  // Pas de main droite = silence (on garde la dernière fréquence pour éviter un saut).
  synth.set(freq ? { freq, gain, cutoff } : { gain: 0, cutoff });
  render({ freq, rawT, gain: freq ? gain : 0, cutoff, left: !!left, right: !!right });
}

// ---------- Affichage ----------

function setIfChanged(key, value, apply) {
  if (state.ui[key] === value) return;
  state.ui[key] = value;
  apply(value);
}

function render({ freq, rawT, gain, cutoff, left, right }) {
  if (freq) {
    const { name, cents } = noteInfo(freq);
    const sign = cents > 0 ? "+" : cents < 0 ? "−" : "±";
    setIfChanged("note", name, (v) => (el.note.textContent = v));
    setIfChanged("detail", `${Math.round(freq)} Hz, ${sign}${Math.abs(cents)} cents`,
      (v) => (el.detail.textContent = v));
  } else {
    setIfChanged("note", "—", (v) => (el.note.textContent = v));
    setIfChanged("detail", "Silence", (v) => (el.detail.textContent = v));
  }

  const vol = Math.round(gain * 100);
  setIfChanged("vol", vol, (v) => setMeter(el.volume, v, v, `${v} %`));
  const cut = Math.round(cutoff / 10) * 10;
  const cutPct = Math.round((Math.log(cutoff / 200) / Math.log(40)) * 100);
  setIfChanged("cut", cut, (v) =>
    setMeter(el.filter, cutPct, v, v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v} Hz`));

  setIfChanged("ledL", left, (v) => (el.ledLeft.dataset.on = v));
  setIfChanged("ledR", right, (v) => (el.ledRight.dataset.on = v));

  const pos = rawT === null ? null : Math.round(rawT * 1000) / 1000;
  setIfChanged("cursor", pos, (v) => {
    el.railCursor.hidden = v === null;
    if (v !== null) el.railCursor.style.setProperty("--t", v);
  });
}

function setMeter(meter, pct, value, text) {
  meter.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct))}%`);
  meter.setAttribute("aria-valuenow", value);
  meter.setAttribute("aria-valuetext", text);
  meter.querySelector(".meter__value").textContent = text;
}

/** Place le rail sur la zone de jeu réellement visible (vidéo en object-fit: cover). */
function layoutRail() {
  const { video, stage } = el;
  if (!video.videoWidth) return;
  const box = stage.getBoundingClientRect();
  const r = coverRect(box.width, box.height, video.videoWidth, video.videoHeight);
  // Pas de clamp : si la vidéo est rognée, le rail déborde et la scène le masque,
  // ce qui garde les graduations alignées sur la main.
  el.rail.style.top = `${r.y + PITCH.zoneTop * r.h}px`;
  el.rail.style.height = `${(PITCH.zoneBottom - PITCH.zoneTop) * r.h}px`;

  el.railTicks.replaceChildren(
    ...playableNotes(state.scale).map(({ midi, t, isRoot }) => {
      const tick = document.createElement("li");
      tick.className = isRoot ? "rail__tick rail__tick--root" : "rail__tick";
      tick.style.setProperty("--t", t);
      if (isRoot) {
        const label = document.createElement("span");
        label.className = "rail__label";
        label.textContent = noteInfo(freqFromMidi(midi)).name;
        tick.append(label);
      }
      return tick;
    }),
  );
}

function silence() {
  synth.set({ gain: 0 });
  render({ freq: null, rawT: null, gain: 0, cutoff: DEFAULT_CUTOFF, left: false, right: false });
}

// Caméra débranchée : plus aucune image n'arrive, la dernière note resterait figée.
function onCameraLost() {
  silence();
  el.app.dataset.state = "idle";
  el.error.textContent = "La caméra s'est arrêtée. Rebranche-la, puis appuie sur Réessayer.";
  el.error.hidden = false;
  el.start.disabled = false;
  el.start.textContent = "Réessayer";
}

// Onglet masqué : requestAnimationFrame s'arrête, on coupe pour ne pas laisser une note tenue.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) silence();
});

function announce(msg) {
  el.status.textContent = msg;
}

// ---------- Contrôles ----------

document.querySelectorAll('input[name="wave"]').forEach((input) =>
  input.addEventListener("change", () => synth.setWaveform(input.value)));

document.querySelectorAll('input[name="scale"]').forEach((input) =>
  input.addEventListener("change", () => {
    state.scale = SCALES[input.value];
    layoutRail();
  }));

function toggleMute() {
  const muted = synth.toggleMute();
  el.mute.setAttribute("aria-pressed", muted);
  el.mute.textContent = muted ? "Rétablir le son" : "Couper le son";
}
el.mute.addEventListener("click", toggleMute);
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "m" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) toggleMute();
});

new ResizeObserver(layoutRail).observe(el.stage);
el.video.addEventListener("loadedmetadata", layoutRail);
