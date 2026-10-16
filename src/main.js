import { Synth } from "./synth.js";
import { startCamera, createHandTracker } from "./vision.js";
import { createOverlay } from "./overlay.js";
import { createPerformer } from "./performer.js";
import {
  SCALES, ROMANS, FINGERS, assignHands, degreeToMidi, freqFromMidi, noteName, pitchClassName,
} from "./mapping.js";

const $ = (id) => document.getElementById(id);
const el = {
  app: $("app"), video: $("video"), canvas: $("overlay"),
  start: $("start"), error: $("error"), status: $("status"),
  note: $("note"), detail: $("detail"), degrees: $("degrees"),
  fingers: $("fingers"), volume: $("meter-volume"), drive: $("meter-drive"),
  ledLeft: $("led-left"), ledRight: $("led-right"),
  keys: $("keys"), mute: $("mute"),
  settings: $("settings"), settingsToggle: $("settings-toggle"),
};

const css = getComputedStyle(document.documentElement);
const overlay = createOverlay(el.canvas, {
  left: css.getPropertyValue("--hand-left").trim(),
  right: css.getPropertyValue("--hand-right").trim(),
});

const synth = new Synth();
let perform = createPerformer();
const state = {
  key: { root: 0, scale: SCALES.major, octave: 3 },
  landmarker: null,
  lastVideoTime: -1,
  running: false,
  ui: {},
};

const ERRORS = {
  insecure: "La caméra ne fonctionne qu'en HTTPS ou sur localhost. Ouvre la page via son adresse https://.",
  "no-camera-api": "Ce navigateur ne donne pas accès à la caméra. Essaie avec une version récente de Chrome, Edge, Firefox ou Safari.",
  "camera-denied": "L'accès à la caméra a été refusé. Autorise-le dans les réglages du site, puis recharge la page.",
  "camera-missing": "Aucune caméra n'a été trouvée. Branche une webcam, puis réessaie.",
  camera: "La caméra n'a pas pu démarrer. Ferme les autres applications qui l'utilisent, puis réessaie.",
  model: "Le modèle de suivi des mains n'a pas pu se charger. Vérifie ta connexion, puis réessaie.",
};

const FINGER_NAMES = { thumb: "pouce", index: "index", middle: "majeur", ring: "annulaire", pinky: "auriculaire" };

/** Doigts à lever pour chaque degré (option R3), dans l'ordre pouce → auriculaire. */
const DEGREE_SHAPES = [
  { label: "1 doigt", up: ["index"] },
  { label: "2 doigts", up: ["index", "middle"] },
  { label: "3 doigts", up: ["index", "middle", "ring"] },
  { label: "4 doigts", up: ["index", "middle", "ring", "pinky"] },
  { label: "5 doigts", up: FINGERS },
  { label: "Index et auriculaire", up: ["index", "pinky"] },
  { label: "Index, auriculaire et pouce", up: ["thumb", "index", "pinky"] },
];

// ---------- Démarrage ----------

el.start.addEventListener("click", async () => {
  el.error.hidden = true;
  el.start.disabled = true;
  try {
    el.start.textContent = "Ouverture de la caméra…";
    await synth.start(); // dans le geste utilisateur : requis pour l'audio
    applyControls();
    const stream = await startCamera(el.video);
    stream.getVideoTracks()[0]?.addEventListener("ended", onCameraLost);
    el.start.textContent = "Chargement du suivi des mains…";
    state.landmarker ??= await createHandTracker();
    el.app.dataset.state = "playing";
    announce("Prêt. Choisis une note avec la main droite, ferme le poing gauche pour la jouer.");
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
    const now = performance.now();
    const hands = assignHands(state.landmarker.detectForVideo(video, now).landmarks);
    const frame = perform(hands, now, state.key);
    for (const e of frame.events) {
      if (e.type === "on") synth.noteOn(freqFromMidi(e.midi), e.velocity);
      else synth.noteOff();
    }
    // Contrôles continus : volume (poing gauche) et distorsion (poignet droit)
    sendIfMoved("volume", frame.volume, (v) => synth.setVolume(v));
    sendIfMoved("drive", frame.drive, (v) => synth.setDrive(v));
    overlay.draw(hands, frame);
    render(frame, hands);
  }
  requestAnimationFrame(loop);
}

// ---------- Affichage ----------

/** N'envoie une valeur continue à l'audio que si elle a bougé (évite d'empiler les rampes). */
const sent = {};
function sendIfMoved(key, value, apply) {
  if (sent[key] !== undefined && Math.abs(sent[key] - value) < 0.005) return;
  sent[key] = value;
  apply(value);
}

function setIfChanged(key, value, apply) {
  if (state.ui[key] === value) return;
  state.ui[key] = value;
  apply(value);
}

function render(frame, hands) {
  const { playing, selected, degree, volume, drive, mode, leftClosed, rightFingers } = frame;
  const shown = playing ?? selected;

  setIfChanged("note", shown === null ? "—" : noteName(shown), (v) => (el.note.textContent = v));
  setIfChanged("noteState", playing !== null ? "playing" : selected !== null ? "armed" : "idle",
    (v) => (el.note.dataset.state = v));
  const detail =
    playing !== null ? `${ROMANS[degreeOf(playing) - 1] ?? ""}, ${Math.round(freqFromMidi(playing))} Hz`
    : selected !== null
      ? mode === "auto" ? `${ROMANS[degree - 1]} prêt` : `${ROMANS[degree - 1]} prêt, ferme le poing gauche`
    : "Silence";
  setIfChanged("detail", detail, (v) => (el.detail.textContent = v));

  setIfChanged("degSel", degree ?? 0, (d) => markDegree("selected", d));
  setIfChanged("degPlay", playing === null ? 0 : degreeOf(playing), (d) => markDegree("playing", d));

  const vol = Math.round(volume * 100);
  setIfChanged("vol", vol, (v) => setMeter(el.volume, v, `${v} %`));
  const drv = Math.round(drive * 100);
  setIfChanged("drv", drv, (v) => setMeter(el.drive, v, `${v} %`));

  const fingerKey = rightFingers ? FINGERS.map((f) => (rightFingers[f] ? 1 : 0)).join("") : "";
  setIfChanged("fingers", fingerKey, () => {
    const up = rightFingers ? FINGERS.filter((f) => rightFingers[f]) : [];
    for (const bar of el.fingers.children) bar.dataset.on = up.includes(bar.dataset.finger);
    el.fingers.setAttribute("aria-label",
      `Doigts tendus : ${up.length ? up.map((f) => FINGER_NAMES[f]).join(", ") : "aucun"}`);
  });

  const left =
    hands.left ? (leftClosed ? ["Main gauche : poing fermé", "Poing fermé"] : ["Main gauche : ouverte", "Ouverte"])
    : mode === "auto" ? ["Sans main gauche : jeu à une main", "Une main"]
    : ["Main gauche absente", "Gauche"];
  setIfChanged("ledL", left.join("|"), () => setLed(el.ledLeft, !!hands.left, left));
  const right = hands.right ? ["Main droite détectée", "Droite"] : ["Main droite absente", "Droite"];
  setIfChanged("ledR", !!hands.right, (on) => setLed(el.ledRight, on, right));
}

function setLed(led, on, [long, short]) {
  led.dataset.on = on;
  led.querySelector(".led__long").textContent = long;
  led.querySelector(".led__short").textContent = short;
}

/** Degré (1–7) d'une note jouée dans la tonalité courante. */
function degreeOf(midi) {
  for (let d = 1; d <= 7; d++) if (degreeToMidi(d, state.key) === midi) return d;
  return 0;
}

function markDegree(attr, degree) {
  for (const li of el.degrees.children) li.toggleAttribute(`data-${attr}`, +li.dataset.degree === degree);
}

function setMeter(meter, value, text) {
  meter.style.setProperty("--fill", `${value}%`);
  meter.setAttribute("aria-valuenow", value);
  meter.setAttribute("aria-valuetext", text);
  meter.querySelector(".meter__value").textContent = text;
}

/** Touches des 7 degrés : chiffre romain, note dans la tonalité, glyphe des doigts à lever. */
function renderDegrees() {
  el.degrees.replaceChildren(
    ...ROMANS.map((roman, i) => {
      const li = document.createElement("li");
      li.className = "degree";
      li.dataset.degree = i + 1;
      const r = Object.assign(document.createElement("span"), { className: "degree__roman", textContent: roman });
      const n = Object.assign(document.createElement("span"), {
        className: "degree__note",
        textContent: noteName(degreeToMidi(i + 1, state.key)),
      });
      const glyph = Object.assign(document.createElement("span"), { className: "glyph" });
      glyph.setAttribute("role", "img");
      glyph.setAttribute("aria-label", DEGREE_SHAPES[i].label);
      for (const f of FINGERS) {
        const bar = document.createElement("i");
        bar.dataset.on = DEGREE_SHAPES[i].up.includes(f);
        glyph.append(bar);
      }
      li.append(r, n, glyph);
      return li;
    }),
  );
  state.ui.degSel = state.ui.degPlay = undefined; // forcer le surlignage au prochain rendu
}

function announce(msg) {
  el.status.textContent = msg;
}

/** Relâche la note et repart d'un état de jeu neuf. */
function releaseAll() {
  if (synth.ctx) synth.noteOff();
  perform = createPerformer();
  for (const k of Object.keys(sent)) delete sent[k];
}

// Caméra débranchée : plus aucune image n'arrive, la note resterait tenue.
function onCameraLost() {
  releaseAll();
  el.app.dataset.state = "idle";
  el.error.textContent = "La caméra s'est arrêtée. Rebranche-la, puis appuie sur Réessayer.";
  el.error.hidden = false;
  el.start.disabled = false;
  el.start.textContent = "Réessayer";
}

// Onglet masqué : requestAnimationFrame s'arrête, on relâche la note.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseAll();
});

// ---------- Contrôles ----------

for (let pc = 0; pc < 12; pc++) {
  const label = document.createElement("label");
  const input = Object.assign(document.createElement("input"), {
    type: "radio", name: "key", value: pc, checked: pc === 0,
  });
  label.append(input, Object.assign(document.createElement("span"), { textContent: pitchClassName(pc) }));
  el.keys.append(label);
}

function readControls() {
  const checked = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
  state.key = {
    root: Number(checked("key")),
    scale: SCALES[checked("scale")],
    octave: Number(checked("octave")),
  };
  return { wave: checked("wave"), fx: checked("fx") };
}

function applyControls() {
  const { wave, fx } = readControls();
  if (synth.ctx) {
    synth.setWaveform(wave);
    synth.setEffects(fx);
  }
  renderDegrees();
}

el.settings.addEventListener("change", applyControls);

function setSettingsOpen(open) {
  el.settings.hidden = !open;
  el.settingsToggle.setAttribute("aria-expanded", open);
  if (open) el.settings.querySelector("input:checked")?.focus({ preventScroll: true });
}
el.settingsToggle.addEventListener("click", () => setSettingsOpen(el.settings.hidden));

function toggleMute() {
  const muted = synth.toggleMute();
  el.mute.setAttribute("aria-pressed", muted);
  el.mute.setAttribute("aria-label", muted ? "Rétablir le son" : "Couper le son");
}
el.mute.addEventListener("click", toggleMute);

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.key === "Escape" && !el.settings.hidden) {
    setSettingsOpen(false);
    el.settingsToggle.focus();
  } else if (e.key.toLowerCase() === "m" && el.app.dataset.state === "playing") {
    toggleMute();
  }
});

applyControls();
