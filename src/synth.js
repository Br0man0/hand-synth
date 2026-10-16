// Moteur audio Web Audio.
// osc ─┐
//      ├─> filtre passe-bas ─> ampli (main) ─> sortie (mute) ─> limiteur ─> haut-parleurs
// sub ─┘  (sous-oscillateur une octave plus bas, sinus, pour le corps)

const MAX_GAIN = 0.35; // marge pour protéger les oreilles et les enceintes
const GLIDE = 0.025; // constante de temps (s) du portamento
const SMOOTH = 0.04; // constante de temps (s) volume / filtre

export class Synth {
  ctx = null;
  #osc = null;
  #sub = null;
  #filter = null;
  #amp = null;
  #out = null;
  #muted = false;

  /** À appeler depuis un geste utilisateur (politique autoplay des navigateurs). */
  async start() {
    if (this.ctx) return this.ctx.resume();
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;

    this.#osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: 220 });
    this.#sub = new OscillatorNode(ctx, { type: "sine", frequency: 110 });
    const subLevel = new GainNode(ctx, { gain: 0.4 });

    this.#filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 1200, Q: 4 });
    this.#amp = new GainNode(ctx, { gain: 0 });
    this.#out = new GainNode(ctx, { gain: 1 });
    const limiter = new DynamicsCompressorNode(ctx, {
      threshold: -6,
      knee: 0,
      ratio: 20,
      attack: 0.003,
      release: 0.1,
    });

    this.#osc.connect(this.#filter);
    this.#sub.connect(subLevel).connect(this.#filter);
    this.#filter.connect(this.#amp).connect(this.#out).connect(limiter).connect(ctx.destination);

    this.#osc.start();
    this.#sub.start();
    return ctx.resume();
  }

  /** Met à jour les paramètres, lissés pour éviter les clics. */
  set({ freq, gain, cutoff }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (freq !== undefined) {
      this.#osc.frequency.setTargetAtTime(freq, now, GLIDE);
      this.#sub.frequency.setTargetAtTime(freq / 2, now, GLIDE);
    }
    if (gain !== undefined) {
      this.#amp.gain.setTargetAtTime(Math.max(0, Math.min(1, gain)) * MAX_GAIN, now, SMOOTH);
    }
    if (cutoff !== undefined) {
      this.#filter.frequency.setTargetAtTime(cutoff, now, SMOOTH);
    }
  }

  setWaveform(type) {
    if (this.#osc) this.#osc.type = type;
  }

  /** Coupe le son ; renvoie le nouvel état. */
  toggleMute() {
    this.#muted = !this.#muted;
    if (this.ctx) {
      this.#out.gain.setTargetAtTime(this.#muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    return this.#muted;
  }

  get muted() {
    return this.#muted;
  }
}
