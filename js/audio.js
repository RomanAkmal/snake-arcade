// audio.js — all sounds are synthesized with WebAudio, no audio files.
// The AudioContext is created lazily on the first user gesture because
// browsers block audio until the user has interacted with the page.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  // Call from any keydown/pointerdown — safe to call repeatedly.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // True when we can make noise RIGHT NOW. Crucially, sounds are
  // skipped (not queued) while the context is still 'suspended':
  // scheduling against a suspended context freezes the clock, and all
  // those stale notes would dump out in a burst — "really late" —
  // the moment the context finally resumes.
  ready() {
    if (!this.ctx) return false;
    if (this.ctx.state !== 'running') {
      this.ctx.resume(); // keep nudging; resolves after a user gesture
      return false;
    }
    return true;
  }

  // Short rising blip. Pitch climbs with the combo so chains *sound*
  // rewarding. Gain is ramped (never set abruptly) to avoid clicks.
  eat(combo = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const f0 = 330 * (1 + 0.15 * (combo - 1));

    osc.type = 'square';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.7, t + 0.09);

    // Fast attack, exponential decay — reads as a clean arcade "blip"
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // Descending saw + a burst of filtered noise = a chunky crash.
  death() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(oscGain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);

    // White noise: a buffer of random samples, lowpassed so it thuds
    // instead of hissing
    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

    noise.connect(filter).connect(noiseGain).connect(this.master);
    noise.start(t);
  }

  // One enveloped oscillator note — shared by the intro sounds.
  // Attack/decay are ramped (never set abruptly) to avoid clicks.
  note(freq, at, dur, type = 'sine', vol = 0.15) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  // Rising arpeggio while the intro snake draws the logo. Safe to call
  // before the first user gesture: browsers block audio until the user
  // interacts, so without a context this simply stays silent.
  introSting() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    [392, 494, 587, 784].forEach((f, i) =>
      this.note(f, t + i * 0.13, 0.35, 'triangle', 0.1)
    );
  }

  // Tiny tick per typewriter character in Zig's speech bubble —
  // very short and quiet so a whole sentence doesn't get annoying
  typeTick() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.note(1050 + Math.random() * 150, t, 0.045, 'square', 0.035);
  }

  // Soft two-note "ready" chime when the word completes
  readyChime() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.note(523.25, t, 0.28, 'sine', 0.12);
    this.note(784, t + 0.1, 0.45, 'sine', 0.1);
  }

  // Airy whoosh for entrances: noise swept through a falling lowpass
  whoosh() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.38);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(lp).connect(gain).connect(this.master);
    src.start(t);
  }

  // Cartoon landing pop: a fast downward pitch bend
  pop() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(170, t + 0.11);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // One blip per finished intro letter — pitch climbs across the word
  letterPop(index = 0) {
    if (!this.ready()) return;
    this.note(440 * Math.pow(1.14, index), this.ctx.currentTime, 0.16, 'triangle', 0.09);
  }

  // Low thump to go with the word-complete screen shake
  boom() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  // Snake hiss: white noise pushed through a bandpass so it reads as
  // "ssss" rather than static, with a swell-and-fade envelope
  hiss() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.55);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    bp.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.07);
    gain.gain.setValueAtTime(0.16, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(bp).connect(gain).connect(this.master);
    src.start(t);
  }

  // Celebration arpeggio when the player submits their name — by then
  // they've interacted, so the context exists and this actually plays
  fanfare() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.note(f, t + i * 0.09, 0.35, 'triangle', 0.12)
    );
    this.note(1568, t + 0.36, 0.5, 'sine', 0.07); // sparkle on top
  }

  // Barely-there tick for moving between menu items — quieter and
  // shorter than click() so scrolling the menu doesn't get noisy
  move() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // Rush countdown tick — pitch rises as the clock runs out
  timeTick(urgency = 0) {
    if (!this.ready()) return;
    this.note(640 + urgency * 55, this.ctx.currentTime, 0.07, 'square', 0.09);
  }

  // Rush time-up gong: two descending notes, softer than a death
  timeUp() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.note(660, t, 0.35, 'triangle', 0.16);
    this.note(440, t + 0.2, 0.55, 'triangle', 0.14);
  }

  // Soft click for UI actions (select, pause, resume)
  click() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.09);
  }
}
