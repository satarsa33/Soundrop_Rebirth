// audio.js — Soundrop Rebirth
// Procedural instrument synthesis via Web Audio API.
// Each instrument is a small "voice recipe" driven by collision velocity.

const INSTRUMENTS = {
  marimba: {
    label: "Marimba",
    make(ctx, dest, freq, vel) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = "sine";
      osc2.type = "sine";
      osc.frequency.value = freq;
      osc2.frequency.value = freq * 4; // bright wooden overtone
      const gain = ctx.createGain();
      const gain2 = ctx.createGain();
      const now = ctx.currentTime;
      const peak = 0.5 * vel;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(peak * 0.25, now + 0.003);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(gain).connect(dest);
      osc2.connect(gain2).connect(dest);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 0.6);
      osc2.stop(now + 0.15);
    },
  },
  synth: {
    label: "Synth",
    make(ctx, dest, freq, vel) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(8000, freq * 6 + 400);
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const peak = 0.35 * vel;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(filter).connect(gain).connect(dest);
      osc.start(now);
      osc.stop(now + 0.4);
    },
  },
  bell: {
    label: "Bell",
    make(ctx, dest, freq, vel) {
      const now = ctx.currentTime;
      const partials = [1, 2.01, 3.4, 4.7];
      const gain = ctx.createGain();
      const peak = 0.28 * vel;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      gain.connect(dest);
      partials.forEach((mult, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq * mult;
        const partialGain = ctx.createGain();
        partialGain.gain.value = 1 / (i + 1);
        osc.connect(partialGain).connect(gain);
        osc.start(now);
        osc.stop(now + 1.4);
      });
    },
  },
  pluck: {
    label: "Pluck",
    make(ctx, dest, freq, vel) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(freq * 8, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.2, ctx.currentTime + 0.18);
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const peak = 0.4 * vel;
      gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(filter).connect(gain).connect(dest);
      osc.start(now);
      osc.stop(now + 0.25);
    },
  },
  drum: {
    label: "Drum",
    make(ctx, dest, freq, vel) {
      // Noise burst + low sine thump; freq nudges the thump pitch slightly.
      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 900;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5 * vel, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      noise.connect(noiseFilter).connect(noiseGain).connect(dest);

      const thump = ctx.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(Math.max(50, freq * 0.15), now);
      thump.frequency.exponentialRampToValueAtTime(35, now + 0.12);
      const thumpGain = ctx.createGain();
      thumpGain.gain.setValueAtTime(0.6 * vel, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      thump.connect(thumpGain).connect(dest);

      noise.start(now);
      thump.start(now);
      thump.stop(now + 0.2);
    },
  },
};

export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS);

// Sample-backed instrument ids are prefixed so they never collide with the
// procedural ones above (e.g. a sample named "marimba" won't clash with
// INSTRUMENTS.marimba).
const SAMPLE_PREFIX = "sample:";

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voiceBus = null; // every instrument voice connects here instead of master directly
    this.samples = new Map(); // id (without prefix) -> { buffer, baseFrequency, gain, label }
    this.samplesReady = null;

    this.fx = {
      delay: { enabled: false, time: 0.3, feedback: 0.35, mix: 0.3 },
      reverb: { enabled: false, decay: 2.0, damping: 0.4, mix: 0.25 },
    };
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      // Every instrument voice connects to voiceBus. From there the dry
      // signal always reaches master, and a send amount is tapped off to
      // each effect chain (delay / reverb), which mixes back into master.
      this.voiceBus = this.ctx.createGain();
      this.voiceBus.connect(this.master); // dry path, always on

      this._buildDelayChain();
      this._buildReverbChain();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  // ---- Delay -------------------------------------------------------------

  _buildDelayChain() {
    const ctx = this.ctx;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0; // starts disabled
    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = this.fx.delay.time;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = this.fx.delay.feedback;
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = "lowpass";
    this.delayTone.frequency.value = 4200; // gently tames repeats so they don't get harsh

    this.voiceBus.connect(this.delaySend);
    this.delaySend.connect(this.delayNode);
    this.delayNode.connect(this.delayTone);
    this.delayTone.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode); // feedback loop
    this.delayTone.connect(this.master); // wet output
  }

  setDelayEnabled(enabled) {
    this.ensureContext();
    this.fx.delay.enabled = enabled;
    this.delaySend.gain.setTargetAtTime(enabled ? this.fx.delay.mix : 0, this.ctx.currentTime, 0.02);
  }
  setDelayTime(seconds) {
    this.ensureContext();
    this.fx.delay.time = seconds;
    this.delayNode.delayTime.setTargetAtTime(seconds, this.ctx.currentTime, 0.02);
  }
  setDelayFeedback(amount) {
    this.ensureContext();
    this.fx.delay.feedback = amount;
    this.delayFeedback.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.02);
  }
  setDelayMix(amount) {
    this.ensureContext();
    this.fx.delay.mix = amount;
    if (this.fx.delay.enabled) {
      this.delaySend.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.02);
    }
  }

  // ---- Reverb --------------------------------------------------------------
  // Algorithmic reverb: a convolver fed with a synthetically generated
  // impulse response (filtered noise with an exponential decay envelope),
  // so no external audio file is needed.

  _buildReverbChain() {
    const ctx = this.ctx;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0; // starts disabled
    this.convolver = ctx.createConvolver();
    this._regenerateImpulse();

    this.voiceBus.connect(this.reverbSend);
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.master);
  }

  _regenerateImpulse() {
    const ctx = this.ctx;
    const decay = this.fx.reverb.decay;
    const damping = this.fx.reverb.damping; // 0..1, higher = darker tail
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * decay));
    const impulse = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      // One-pole lowpass smoothing on the noise itself: higher damping
      // rolls off more high end as the tail decays, mimicking how real
      // rooms absorb high frequencies faster than low ones.
      const smoothing = 0.05 + damping * 0.9;
      for (let i = 0; i < length; i++) {
        const noise = Math.random() * 2 - 1;
        lp = lp + (noise - lp) * (1 - smoothing);
        const envelope = Math.pow(1 - i / length, 2 + damping * 3);
        data[i] = lp * envelope;
      }
    }
    this.convolver.buffer = impulse;
  }

  setReverbEnabled(enabled) {
    this.ensureContext();
    this.fx.reverb.enabled = enabled;
    this.reverbSend.gain.setTargetAtTime(enabled ? this.fx.reverb.mix : 0, this.ctx.currentTime, 0.02);
  }
  setReverbDecay(seconds) {
    this.ensureContext();
    this.fx.reverb.decay = seconds;
    this._regenerateImpulse();
  }
  setReverbDamping(amount) {
    this.ensureContext();
    this.fx.reverb.damping = amount;
    this._regenerateImpulse();
  }
  setReverbMix(amount) {
    this.ensureContext();
    this.fx.reverb.mix = amount;
    if (this.fx.reverb.enabled) {
      this.reverbSend.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.02);
    }
  }

  // Restores every FX parameter at once (used when loading a saved session).
  applyFxState(fx) {
    this.ensureContext();
    if (!fx) return;
    if (fx.delay) {
      this.fx.delay = { ...this.fx.delay, ...fx.delay };
      this.setDelayTime(this.fx.delay.time);
      this.setDelayFeedback(this.fx.delay.feedback);
      this.setDelayEnabled(this.fx.delay.enabled); // reads the mix value just merged above
    }
    if (fx.reverb) {
      this.fx.reverb = { ...this.fx.reverb, ...fx.reverb };
      this._regenerateImpulse();
      this.setReverbEnabled(this.fx.reverb.enabled); // reads the mix value just merged above
    }
  }

  // Loads samples/samples.json (an array of {id, label, file, baseFrequency, gain})
  // and decodes each referenced audio file. Safe to call once at startup —
  // any entry that fails to load (missing file, bad path) is skipped silently
  // so a broken manifest never blocks the app from starting.
  async loadSamples() {
    this.ensureContext();
    if (this.samplesReady) return this.samplesReady;
    this.samplesReady = (async () => {
      let manifest = [];
      try {
        const res = await fetch("samples/samples.json");
        if (res.ok) manifest = await res.json();
      } catch {
        manifest = [];
      }
      await Promise.all(
        manifest.map(async (entry) => {
          try {
            const res = await fetch(`samples/${encodeURIComponent(entry.file)}`);
            const arrayBuffer = await res.arrayBuffer();
            const buffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.samples.set(entry.id, {
              buffer,
              baseFrequency: entry.baseFrequency || 261.63,
              gain: entry.gain ?? 1,
              label: entry.label || entry.id,
            });
          } catch (err) {
            console.warn(`Soundrop: campione "${entry.id}" non caricato.`, err);
          }
        })
      );
    })();
    return this.samplesReady;
  }

  // Combined list for UI dropdowns: procedural instruments + loaded samples.
  getAvailableInstruments() {
    const procedural = INSTRUMENT_IDS.map((id) => ({ id, label: INSTRUMENTS[id].label }));
    const sampled = [...this.samples.entries()].map(([id, s]) => ({
      id: SAMPLE_PREFIX + id,
      label: `🎵 ${s.label}`,
    }));
    return [...procedural, ...sampled];
  }

  // speed: collision speed in px/s (already accounts for physics scale)
  // instrumentId: which timbre to use — either a procedural id, or a
  // "sample:<id>" id referring to an entry loaded via loadSamples().
  play(instrumentId, speed) {
    this.ensureContext();
    const clamped = Math.max(20, Math.min(speed, 1600));
    const t = (clamped - 20) / (1600 - 20); // 0..1
    const freq = 130 * Math.pow(2, t * 3.2); // ~130Hz .. ~1250Hz
    const vel = 0.25 + t * 0.75; // 0.25..1.0

    if (typeof instrumentId === "string" && instrumentId.startsWith(SAMPLE_PREFIX)) {
      const sample = this.samples.get(instrumentId.slice(SAMPLE_PREFIX.length));
      if (sample) {
        this.playSample(sample, freq, vel);
        return;
      }
      // Sample missing/not loaded yet — fall through to procedural default.
    }
    const instrument = INSTRUMENTS[instrumentId] || INSTRUMENTS.marimba;
    instrument.make(this.ctx, this.voiceBus, freq, vel);
  }

  playSample(sample, freq, vel) {
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = sample.buffer;
    // Pitch-shift the sample by playback rate, clamped so extreme collision
    // speeds don't turn it into an unrecognizable chipmunk/demon voice.
    const rate = Math.max(0.5, Math.min(2.2, freq / sample.baseFrequency));
    source.playbackRate.value = rate;

    const gainNode = this.ctx.createGain();
    const peak = 0.8 * vel * sample.gain;
    const durationAtRate = sample.buffer.duration / rate;
    gainNode.gain.setValueAtTime(peak, now);
    // Fade out just before the sample's natural end to avoid a click if the
    // source file doesn't already fade to silence.
    gainNode.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.05, durationAtRate - 0.03));

    source.connect(gainNode).connect(this.voiceBus);
    source.start(now);
    source.stop(now + durationAtRate);
  }
}
