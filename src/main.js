import { Synth } from "./synth.js";
import { startCamera, createHandTracker } from "./vision.js";
import { createOverlay } from "./overlay.js";
import { createPerformer } from "./performer.js";
import {
  SCALES, ROMANS, FINGERS, assignHands, degreeToMidi, freqFromMidi, noteName, pitchClassName,
} from "./mapping.js";

const $ = (id) => document.getElementById(id);
const el = {
  app: $("app"), stage: $("stage"), video: $("video"), canvas: $("overlay"),
  start: $("start"), error: $("error"), status: $("status"),
  note: $("note"), detail: $("detail"), degrees: $("degrees"),
  fingers: $("fingers"), velocity: $("meter-velocity"),
  ledLeft: $("led-left"), ledRight: $("led-right"),
  key: $("key"), mute: $("mute"),
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
const GESTURES = ["1 doigt", "2 doigts", "3 doigts", "4 doigts", "5 doigts", "index et auriculaire", "index, auriculaire et pouce"];

// ---------- Démarrage ----------

el.start.addEventListener("click", async () => {
  el.error.hidden = true;
  el.start.disabled = true;
  try {
    el.start.textContent = "Ouverture de la caméra…";
    await synth.start(); // dans le geste utilisateur : requis pour l'audio
    // Sur petit écran, les réglages sont repliés pour laisser la place à la vidéo.
if (matchMedia("(max-width: 560px)").matches) $("settings").open = false;

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
    overlay.draw(hands, frame);
    render(frame, hands);
  }
  requestAnimationFrame(loop);
}

// ---------- Affichage ----------

function setIfChanged(key, value, apply) {
  if (state.ui[key] === value) return;
  state.ui[key] = value;
  apply(value);
}

function render(frame, hands) {
  const { playing, selected, degree, velocity, mode, leftClosed, rightFingers } = frame;
  const shown = playing ?? selected;

  setIfChanged("note", shown === null ? "—" : noteName(shown), (v) => (el.note.textContent = v));
  setIfChanged("noteState", playing !== null ? "playing" : selected !== null ? "armed" : "idle",
    (v) => (el.note.dataset.state = v));
  const detail =
    playing !== null ? `${ROMANS[degreeOf(playing) - 1] ?? ""}, ${Math.round(freqFromMidi(playing))} Hz`
    : selected !== null ? `${ROMANS[degree - 1]} prêt, ferme le poing gauche`
    : "Silence";
  setIfChanged("detail", detail, (v) => (el.detail.textContent = v));

  setIfChanged("degSel", degree ?? 0, (d) => markDegree("selected", d));
  setIfChanged("degPlay", playing === null ? 0 : degreeOf(playing), (d) => markDegree("playing", d));

  const vel = Math.round(velocity * 100);
  setIfChanged("vel", vel, (v) => setMeter(el.velocity, v, `${v} %`));

  const fingerKey = rightFingers ? FINGERS.map((f) => (rightFingers[f] ? 1 : 0)).join("") : "";
  setIfChanged("fingers", fingerKey, () => {
    const up = rightFingers ? FINGERS.filter((f) => rightFingers[f]) : [];
    for (const span of el.fingers.children) span.dataset.on = up.includes(span.dataset.finger);
    el.fingers.setAttribute("aria-label",
      `Doigts tendus : ${up.length ? up.map((f) => FINGER_NAMES[f]).join(", ") : "aucun"}`);
  });

  const leftText = hands.left ? (leftClosed ? "Main gauche : poing fermé" : "Main gauche : ouverte")
    : mode === "auto" ? "Sans main gauche : jeu à une main" : "Main gauche absente";
  setIfChanged("ledL", leftText, (v) => {
    el.ledLeft.textContent = v;
    el.ledLeft.dataset.on = !!hands.left;
  });
  setIfChanged("ledR", !!hands.right, (v) => {
    el.ledRight.textContent = v ? "Main droite détectée" : "Main droite absente";
    el.ledRight.dataset.on = v;
  });
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

/** Guide des 7 degrés : chiffre romain, note dans la tonalité, geste. */
function renderDegrees() {
  el.degrees.replaceChildren(
    ...ROMANS.map((roman, i) => {
      const li = document.createElement("li");
      li.className = "degree";
      li.dataset.degree = i + 1;
      li.innerHTML = `<span class="degree__roman"></span><span class="degree__note"></span><span class="degree__gesture"></span>`;
      li.children[0].textContent = roman;
      li.children[1].textContent = noteName(degreeToMidi(i + 1, state.key));
      li.children[2].textContent = GESTURES[i];
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
  el.key.append(new Option(pitchClassName(pc), pc, pc === 0, pc === 0));
}

function readControls() {
  const checked = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
  state.key = {
    root: Number(el.key.value),
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

el.key.addEventListener("change", applyControls);
document.querySelectorAll(".panel input[type=radio]").forEach((input) =>
  input.addEventListener("change", applyControls));

function toggleMute() {
  const muted = synth.toggleMute();
  el.mute.setAttribute("aria-pressed", muted);
  el.mute.textContent = muted ? "Rétablir le son" : "Couper le son";
}
el.mute.addEventListener("click", toggleMute);
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("select")) return;
  if (e.key.toLowerCase() === "m" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) toggleMute();
});

// Sur petit écran, les réglages sont repliés pour laisser la place à la vidéo.
if (matchMedia("(max-width: 560px)").matches) $("settings").open = false;

applyControls();
