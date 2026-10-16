// Moteur audio : synthé monophonique à unisson, enveloppes et effets.
//
//  saw −10 ct ─ pan −0.5 ─┐                                ┌─ sec ─────────────────────────┐
//  saw   0 ct ─ pan  0   ─┤                                │                               │
//  saw +10 ct ─ pan +0.5 ─┼─> passe-bas (Q bas, env.) ─────┤                               ├─> VCA (ADSR) ─> volume ─┬─> sec ─────┐
//  sinus −1 oct ──────────┘                                └─ gain ─> saturation ─> tonalité ┘   (main gauche)       ├─> delay ⟲ ┼─> mute ─> limiteur
//                                                            (distorsion, main droite)                               └─> réverb ─┘
//                                                       (le delay alimente aussi la réverb)

export const PATCH = {
  detuneCents: 10, // unisson : ±10 cents
  subLevel: 0.2,
  voiceLevel: 0.22,
  // Enveloppe d'amplitude (secondes, niveau de sustain 0..1)
  amp: { attack: 0.015, decay: 0.25, sustain: 0.65, release: 0.3 },
  // Enveloppe de filtre : ouvre à l'attaque puis redescend (« pluck »)
  filter: { q: 1.1, attack: 0.008, decay: 0.35, envAmount: 5500, sustainAmount: 900 },
  glide: 0.004, // constante de temps de la hauteur (évite les sauts secs)
  masterGain: 0.75,
  // Distorsion : mélange sec / saturé à puissance constante, piloté par le poignet droit
  drive: { maxGain: 30, wetLevel: 0.45, tone: 5000 },
  // Volume de la main gauche : 0..1 -> -30 dB..0 dB
  expression: { floorDb: -30, smooth: 0.04 },
  reverb: { seconds: 2.4, send: 0.25 },
  delay: { time: 0.32, feedback: 0.32, send: 0.18, damping: 2500 },
};

export const EFFECTS = {
  dry: { reverb: 0, delay: 0 },
  reverb: { reverb: 1, delay: 0 },
  space: { reverb: 1, delay: 1 },
};

/** Fige un paramètre à sa valeur courante avant une nouvelle courbe (sans clic). */
function hold(param, t) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(t);
  } else {
    // Firefox : pas de cancelAndHoldAtTime
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

/** Courbe de saturation douce (tanh), normalisée à ±1. */
export function makeDriveCurve(n = 2048, k = 3) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/** Réponse impulsionnelle stéréo : bruit à décroissance exponentielle, de plus en plus sombre. */
export function makeImpulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.exp(-6.9 * t); // -60 dB à la fin
      const smooth = 0.2 + 0.75 * t; // passe-bas qui se ferme avec le temps
      lp += (1 - smooth) * ((Math.random() * 2 - 1) - lp);
      data[i] = lp * env;
    }
  }
  return buf;
}

/**
 * iOS : par défaut, le son Web Audio est traité comme un son « d'ambiance » et il
 * est COUPÉ quand l'iPhone est en mode silencieux (interrupteur latéral ou bouton
 * Action). On demande une session de lecture, comme une app de musique.
 * - Safari 16.4+ : API navigator.audioSession.
 * - Plus ancien : un élément <audio> silencieux joué en boucle force la même
 *   catégorie de session.
 */
let silentAudio = null;
export function useSpeakerSession() {
  if (navigator.audioSession) {
    try {
      navigator.audioSession.type = "playback";
    } catch {
      /* ignoré */
    }
    return;
  }
  if (!/iPad|iPhone|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) return;
  if (!silentAudio) {
    silentAudio = document.createElement("audio");
    silentAudio.src = URL.createObjectURL(silentWav());
    silentAudio.loop = true;
    silentAudio.setAttribute("playsinline", "");
    silentAudio.setAttribute("x-webkit-airplay", "deny");
  }
  silentAudio.play().catch(() => {});
}

/** WAV de 0,5 s de silence (8 kHz, 8 bits, mono). */
function silentWav() {
  const n = 4000;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true);
  v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128); // 128 = zéro en PCM 8 bits non signé
  return new Blob([buf], { type: "audio/wav" });
}

export class Synth {
  ctx = null;
  #oscs = [];
  #sub = null;
  #filter = null;
  #vca = null;
  #expr = null;
  #dry = null;
  #wet = null;
  #preGain = null;
  #reverbSend = null;
  #delaySend = null;
  #mute = null;
  #muted = false;
  #freq = 0;

  #stateListeners = new Set();

  /**
   * Crée et débloque l'audio. À appeler AU DÉBUT d'un geste utilisateur (clic),
   * avant tout `await` : iOS n'autorise l'audio que pendant le geste.
   */
  async start() {
    useSpeakerSession();
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      this.attach(new Ctx({ latencyHint: "interactive" }));
      this.#watch();
    }
    // iOS : jouer un buffer silencieux dans le geste « réveille » la sortie audio.
    const blip = this.ctx.createBufferSource();
    blip.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    blip.connect(this.ctx.destination);
    blip.start();
    return this.resume();
  }

  /** Relance l'audio s'il a été suspendu ou interrompu (appel, caméra, onglet en arrière-plan…). */
  async resume() {
    if (!this.ctx || this.ctx.state === "running" || this.ctx.state === "closed") return this.running;
    try {
      await this.ctx.resume();
    } catch {
      /* refusé hors geste : un toucher suivant réessaiera */
    }
    return this.running;
  }

  get running() {
    return this.ctx?.state === "running";
  }

  /** Prévient l'interface quand l'audio passe en marche ou s'arrête. */
  onStateChange(cb) {
    this.#stateListeners.add(cb);
  }

  /**
   * Safari iOS met le contexte en état « interrupted » ou « suspended » quand la
   * caméra démarre, après un appel, ou au retour d'arrière-plan. On tente une
   * relance à chaque changement, et à chaque toucher de l'écran (un geste suffit
   * toujours).
   */
  #watch() {
    const ctx = this.ctx;
    ctx.addEventListener("statechange", () => {
      for (const cb of this.#stateListeners) cb(ctx.state);
      if (ctx.state !== "running" && !document.hidden) this.resume();
    });
    const wake = () => {
      if (ctx.state !== "running") {
        useSpeakerSession();
        this.resume();
      }
    };
    for (const type of ["pointerdown", "touchend", "keydown"]) {
      document.addEventListener(type, wake, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.resume();
    });
  }

  /** Construit le graphe dans un contexte donné (AudioContext ou OfflineAudioContext). */
  attach(ctx) {
    this.ctx = ctx;
    const P = PATCH;

    this.#filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 400, Q: P.filter.q });
    this.#vca = new GainNode(ctx, { gain: 0 });

    for (const [cents, pan] of [[-P.detuneCents, -0.5], [0, 0], [P.detuneCents, 0.5]]) {
      const osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: 220, detune: cents });
      osc.connect(new GainNode(ctx, { gain: P.voiceLevel }))
        .connect(new StereoPannerNode(ctx, { pan }))
        .connect(this.#filter);
      osc.start();
      this.#oscs.push(osc);
    }
    this.#sub = new OscillatorNode(ctx, { type: "sine", frequency: 110 });
    this.#sub.connect(new GainNode(ctx, { gain: P.subLevel })).connect(this.#filter);
    this.#sub.start();

    // Distorsion : deux chemins mélangés avant le VCA
    this.#dry = new GainNode(ctx, { gain: 1 });
    this.#wet = new GainNode(ctx, { gain: 0 });
    this.#preGain = new GainNode(ctx, { gain: 1 });
    const shaper = new WaveShaperNode(ctx, { curve: makeDriveCurve(), oversample: "4x" });
    const tone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: P.drive.tone, Q: 0.5 });
    this.#filter.connect(this.#dry).connect(this.#vca);
    this.#filter.connect(this.#preGain).connect(shaper).connect(tone).connect(this.#wet).connect(this.#vca);

    // Volume continu (main gauche), après l'enveloppe
    this.#expr = new GainNode(ctx, { gain: 1 });
    this.#vca.connect(this.#expr);

    // Bus de sortie
    const master = new GainNode(ctx, { gain: P.masterGain });
    this.#mute = new GainNode(ctx, { gain: 1 });
    const limiter = new DynamicsCompressorNode(ctx, {
      threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.1,
    });
    master.connect(this.#mute).connect(limiter).connect(ctx.destination);
    this.#expr.connect(master); // signal sec

    // Réverbération
    const convolver = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, P.reverb.seconds) });
    this.#reverbSend = new GainNode(ctx, { gain: 0 });
    this.#expr.connect(this.#reverbSend).connect(convolver).connect(master);

    // Delay avec réinjection filtrée (chaque répétition est plus sombre)
    const delay = new DelayNode(ctx, { delayTime: P.delay.time, maxDelayTime: 2 });
    const feedback = new GainNode(ctx, { gain: P.delay.feedback });
    const damping = new BiquadFilterNode(ctx, { type: "lowpass", frequency: P.delay.damping });
    this.#delaySend = new GainNode(ctx, { gain: 0 });
    this.#expr.connect(this.#delaySend).connect(delay);
    delay.connect(damping).connect(feedback).connect(delay);
    damping.connect(master);
    damping.connect(this.#reverbSend);

    this.setEffects("reverb");
    return this;
  }

  /** Nouvelle note : hauteur, ADSR d'amplitude et enveloppe de filtre redémarrent. */
  noteOn(freq, velocity = 0.8, t = this.ctx.currentTime) {
    const { amp, filter, glide } = PATCH;
    this.#freq = freq;
    for (const osc of this.#oscs) osc.frequency.setTargetAtTime(freq, t, glide);
    this.#sub.frequency.setTargetAtTime(freq / 2, t, glide);

    // ADSR d'amplitude, depuis le niveau courant (pas de clic si une note sonne déjà).
    // Le niveau est fixe : le volume est piloté en continu par setVolume (main gauche),
    // la vélocité ne règle que la brillance de l'attaque (enveloppe de filtre).
    const peak = 0.85;
    const g = this.#vca.gain;
    hold(g, t);
    g.linearRampToValueAtTime(peak, t + amp.attack);
    g.setTargetAtTime(peak * amp.sustain, t + amp.attack, amp.decay / 3);

    // Enveloppe de filtre : la fréquence de base suit la note (keytracking)
    const base = this.#filterBase(freq);
    const f = this.#filter.frequency;
    hold(f, t);
    f.linearRampToValueAtTime(base + velocity * filter.envAmount, t + filter.attack);
    f.setTargetAtTime(base + velocity * filter.sustainAmount, t + filter.attack, filter.decay / 3);
  }

  noteOff(t = this.ctx.currentTime) {
    const { amp } = PATCH;
    hold(this.#vca.gain, t);
    this.#vca.gain.setTargetAtTime(0, t, amp.release / 4);
    hold(this.#filter.frequency, t);
    this.#filter.frequency.setTargetAtTime(this.#filterBase(this.#freq || 220), t, amp.release / 4);
  }

  #filterBase(freq) {
    return 250 + freq * 0.8;
  }

  /** Volume continu 0..1 (main gauche), en échelle de décibels. */
  setVolume(v, t = this.ctx.currentTime) {
    const { floorDb, smooth } = PATCH.expression;
    const gain = v <= 0.01 ? 0 : 10 ** (((1 - Math.min(1, v)) * floorDb) / 20);
    this.#expr.gain.setTargetAtTime(gain, t, smooth);
  }

  /** Distorsion 0..1 (rotation du poignet droit) : mélange à puissance constante. */
  setDrive(amount, t = this.ctx.currentTime) {
    const a = Math.max(0, Math.min(1, amount));
    const { maxGain, wetLevel } = PATCH.drive;
    this.#preGain.gain.setTargetAtTime(1 + maxGain * a, t, 0.03);
    this.#dry.gain.setTargetAtTime(Math.cos((a * Math.PI) / 2), t, 0.03);
    this.#wet.gain.setTargetAtTime(Math.sin((a * Math.PI) / 2) * wetLevel, t, 0.03);
  }

  setWaveform(type) {
    for (const osc of this.#oscs) osc.type = type;
  }

  /** "dry" | "reverb" | "space" (réverb + delay) */
  setEffects(name, t = this.ctx?.currentTime ?? 0) {
    const fx = EFFECTS[name] ?? EFFECTS.reverb;
    this.#reverbSend?.gain.setTargetAtTime(fx.reverb * PATCH.reverb.send, t, 0.05);
    this.#delaySend?.gain.setTargetAtTime(fx.delay * PATCH.delay.send, t, 0.05);
  }

  /** Coupe le son ; renvoie le nouvel état. */
  toggleMute() {
    this.#muted = !this.#muted;
    if (this.ctx) this.#mute.gain.setTargetAtTime(this.#muted ? 0 : 1, this.ctx.currentTime, 0.02);
    return this.#muted;
  }

  get muted() {
    return this.#muted;
  }
}
