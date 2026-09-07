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

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  // speed: collision speed in px/s (already accounts for physics scale)
  // instrumentId: which timbre to use
  play(instrumentId, speed) {
    this.ensureContext();
    const instrument = INSTRUMENTS[instrumentId] || INSTRUMENTS.marimba;
    // Map speed -> frequency (musical, pentatonic-ish spread) and -> velocity (loudness/brightness)
    const clamped = Math.max(20, Math.min(speed, 1600));
    const t = (clamped - 20) / (1600 - 20); // 0..1
    const freq = 130 * Math.pow(2, t * 3.2); // ~130Hz .. ~1250Hz
    const vel = 0.25 + t * 0.75; // 0.25..1.0
    instrument.make(this.ctx, this.master, freq, vel);
  }
}
