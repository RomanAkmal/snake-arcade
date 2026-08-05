// audio.js — all sounds are synthesized with WebAudio, no audio files.
// The AudioContext is created lazily on the first user gesture because
// browsers block audio until the user has interacted with the page.

// Everything ultimately runs through `master`, whose gain is the
// player's volume setting scaled by this. It's the headroom that keeps
// several overlapping sounds from clipping at volume 100.
const MASTER_HEADROOM = 0.4;

// Music bus level relative to SFX. The tracks were originally mixed so
// low (peak ~0.017 after headroom) that they were inaudible on laptop
// speakers, which also made the volume slider look broken: there was
// nothing playing loud enough to hear it move.
const MUSIC_BALANCE = 1.35;

// ---------- background music ----------
// Three loops, all synthesized. Each is a step sequence of semitone
// offsets from `root` (null = a rest), played by one shared scheduler,
// so adding a track means adding data here and nothing else.
const MUSIC = {
  chill: {
    name: 'Chill',
    stepMs: 250,
    // A minor pentatonic, up and back down — the intro sting's voice
    // stretched into a loop
    notes: [0, 3, 7, 10, 12, 10, 7, 3],
    root: 220,
    type: 'triangle',
    vol: 0.15,
    dur: 0.55,
    bassEvery: 8, // one low root per bar
    bassVol: 0.12,
  },
  arcade: {
    name: 'Arcade',
    stepMs: 115,
    // four bars of broken chords: Am - C - Dm - C, chiptune-style
    notes: [
      0, 7, 12, 7,
      3, 10, 15, 10,
      5, 12, 17, 12,
      3, 10, 15, 10,
    ],
    root: 262,
    type: 'square',
    vol: 0.09,
    dur: 0.1, // short and clipped — that's the chiptune character
    bassEvery: 4,
    bassVol: 0.14,
  },
  focus: {
    name: 'Focus',
    stepMs: 520,
    // deliberately almost nothing: a deep pulse with one lift
    notes: [0, null, 5, null],
    root: 110,
    type: 'sine',
    // the ceiling for any voice here: above ~0.16 a sustained pad
    // starts competing with the eat blip instead of sitting under it
    vol: 0.16,
    dur: 0.95,
    bassEvery: 0,
    bassVol: 0,
  },
};

// Tracks first, 'off' last — this is the order the Customise screen
// shows, and "Off" belongs at the end of a list of choices.
export const TRACKS = [
  ...Object.entries(MUSIC).map(([id, t]) => ({ id, name: t.name })),
  { id: 'off', name: 'Off' },
];

export const TRACK_IDS = TRACKS.map((t) => t.id);

// How far ahead the scheduler queues notes, and how often it wakes up.
// Both in seconds/ms: queueing ahead is what keeps the beat steady when
// the main thread stalls.
const MUSIC_LOOKAHEAD = 0.12;
const MUSIC_TICK_MS = 25;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;

    this.sfxOn = true;
    this.volume = 70;      // 0–100, the player's setting
    this.trackId = 'off';
    this.musicRate = 1;    // >1 in Rush's final seconds
    this.musicTimer = null;
    this.musicStepIndex = 0;
    this.nextNoteTime = 0; // ctx time of the next step, 0 = not started
  }

  // Call from any keydown/pointerdown — safe to call repeatedly.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.level();
      this.master.connect(this.ctx.destination);
      // Two buses under master: music and SFX. That split is what lets
      // the SFX toggle silence blips without touching the track, and
      // the volume slider still governs both from above.
      this.musicGain = this.ctx.createGain();
      // Music sits deliberately under the SFX: loud enough to be
      // clearly present under gameplay, quiet enough that an eat blip
      // (0.25) still cuts through a track note (0.15 x this).
      this.musicGain.gain.value = MUSIC_BALANCE;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 1 : 0;
      this.sfxGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---------- volume ----------

  level() {
    return (this.volume / 100) * MASTER_HEADROOM;
  }

  // v is 0–100. Affects SFX and music alike, since both run through
  // master. Ramped rather than assigned: dragging a slider sets this
  // dozens of times a second, and abrupt gain changes click.
  setVolume(v) {
    this.volume = Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.015);
    }
    return this.volume;
  }

  // Mutes the SFX bus only — music keeps playing. Ramped like volume so
  // toggling mid-blip doesn't click.
  setSfx(on) {
    this.sfxOn = !!on;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxOn ? 1 : 0, this.ctx.currentTime, 0.01);
    }
    return this.sfxOn;
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

    osc.connect(gain).connect(this.sfxGain);
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
    osc.connect(oscGain).connect(this.sfxGain);
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

    noise.connect(filter).connect(noiseGain).connect(this.sfxGain);
    noise.start(t);
  }

  // One enveloped oscillator note — shared by the intro sounds and the
  // music scheduler. Attack/decay are ramped (never set abruptly) to
  // avoid clicks. Defaults to the SFX bus; the music scheduler passes
  // musicGain so the SFX toggle can't silence the track.
  note(freq, at, dur, type = 'sine', vol = 0.15, dest = this.sfxGain) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(dest ?? this.sfxGain ?? this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  // ---------- music ----------

  // Pick a track. 'off' stops the loop. Safe before the first gesture:
  // the choice is remembered and the scheduler simply produces nothing
  // until the context is running.
  setTrack(id) {
    this.trackId = TRACK_IDS.includes(id) ? id : 'off';
    if (this.trackId === 'off') {
      this.stopMusic();
    } else if (this.musicTimer) {
      // switching mid-playback: restart the pattern at step 0
      this.musicStepIndex = 0;
      this.nextNoteTime = 0;
    }
    return this.trackId;
  }

  // Begin (or resume) the loop. main.js calls this once the player is
  // past the start gate, so music can never be the thing that trips the
  // browser's autoplay block.
  startMusic() {
    if (this.trackId === 'off' || this.musicTimer) return;
    this.musicStepIndex = 0;
    this.nextNoteTime = 0;
    // A setInterval scheduler, not the rAF loop: requestAnimationFrame
    // is throttled hard in background tabs, which would stall the beat.
    this.musicTimer = setInterval(() => this.scheduleMusic(), MUSIC_TICK_MS);
  }

  isMusicPlaying() {
    return this.musicTimer !== null;
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.nextNoteTime = 0;
    // Notes already queued inside the lookahead window still play out
    // (≤120ms) — cheaper than tracking every oscillator to kill it.
  }

  // Rush's final stretch speeds the track up. Idempotent: it's called
  // from the frame loop, so it must be free to call every frame.
  setMusicRate(rate) {
    if (rate === this.musicRate) return;
    this.musicRate = rate;
  }

  // Queue every step that falls inside the lookahead window. Same rule
  // as ready(): while the context is suspended we schedule NOTHING and
  // rebase the clock, or the backlog would dump out in one burst.
  scheduleMusic() {
    if (!this.ready() || this.trackId === 'off') {
      this.nextNoteTime = 0;
      return;
    }
    const track = MUSIC[this.trackId];
    const now = this.ctx.currentTime;
    if (this.nextNoteTime === 0 || this.nextNoteTime < now) {
      this.nextNoteTime = now + 0.05; // fresh start, or catching up
    }
    while (this.nextNoteTime < now + MUSIC_LOOKAHEAD) {
      this.playStep(track, this.musicStepIndex, this.nextNoteTime);
      this.nextNoteTime += track.stepMs / 1000 / this.musicRate;
      this.musicStepIndex++;
    }
  }

  playStep(track, index, at) {
    const semitone = track.notes[index % track.notes.length];
    if (semitone !== null && semitone !== undefined) {
      this.note(
        track.root * Math.pow(2, semitone / 12),
        at,
        track.dur,
        track.type,
        track.vol,
        this.musicGain
      );
    }
    // one octave-down root on the downbeat, for weight
    if (track.bassEvery && index % track.bassEvery === 0) {
      this.note(track.root / 2, at, track.dur * 1.6, 'sine', track.bassVol, this.musicGain);
    }
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
    src.connect(lp).connect(gain).connect(this.sfxGain);
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
    osc.connect(gain).connect(this.sfxGain);
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
    osc.connect(gain).connect(this.sfxGain);
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
    src.connect(bp).connect(gain).connect(this.sfxGain);
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
    osc.connect(gain).connect(this.sfxGain);
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
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.09);
  }
}
