// Moteur audio : synthé monophonique à unisson, enveloppes et effets.
//
//  saw −10 ct ─ pan −0.5 ─┐
//  saw   0 ct ─ pan  0   ─┤
//  saw +10 ct ─ pan +0.5 ─┼─> passe-bas (Q bas, env. filtre) ─> VCA (ADSR) ─┬─> sec ──────────┐
//  sinus −1 oct ──────────┘                                                ├─> delay ⟲ ─────┼─> mute ─> limiteur ─> sortie
//                                                                          └─> réverb ──────┘
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

export class Synth {
  ctx = null;
  #oscs = [];
  #sub = null;
  #filter = null;
  #vca = null;
  #reverbSend = null;
  #delaySend = null;
  #mute = null;
  #muted = false;
  #freq = 0;

  /** Crée l'AudioContext ; à appeler depuis un geste utilisateur (autoplay). */
  async start() {
    if (!this.ctx) this.attach(new AudioContext({ latencyHint: "interactive" }));
    return this.ctx.resume?.();
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

    this.#filter.connect(this.#vca);

    // Bus de sortie
    const master = new GainNode(ctx, { gain: P.masterGain });
    this.#mute = new GainNode(ctx, { gain: 1 });
    const limiter = new DynamicsCompressorNode(ctx, {
      threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.1,
    });
    master.connect(this.#mute).connect(limiter).connect(ctx.destination);
    this.#vca.connect(master); // signal sec

    // Réverbération
    const convolver = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, P.reverb.seconds) });
    this.#reverbSend = new GainNode(ctx, { gain: 0 });
    this.#vca.connect(this.#reverbSend).connect(convolver).connect(master);

    // Delay avec réinjection filtrée (chaque répétition est plus sombre)
    const delay = new DelayNode(ctx, { delayTime: P.delay.time, maxDelayTime: 2 });
    const feedback = new GainNode(ctx, { gain: P.delay.feedback });
    const damping = new BiquadFilterNode(ctx, { type: "lowpass", frequency: P.delay.damping });
    this.#delaySend = new GainNode(ctx, { gain: 0 });
    this.#vca.connect(this.#delaySend).connect(delay);
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

    // ADSR d'amplitude, depuis le niveau courant (pas de clic si une note sonne déjà)
    const peak = 0.3 + 0.7 * velocity;
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
