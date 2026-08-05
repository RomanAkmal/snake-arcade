// main.js — boots everything and owns the glue: the screen manager
// (INTRO → MENU → GAME → GAMEOVER), the requestAnimationFrame loop,
// and input routing (keyboard + swipe) per screen.

import { Game, chooseAiDirection } from './game.js';
import { Renderer, Intro, Fx, SKINS } from './render.js';
import { AudioEngine, TRACKS } from './audio.js';
import { UI } from './ui.js';
import {
  fetchTopScores,
  submitScore,
  makesTopTen,
  defaultName,
  isValidName,
  NAME_MIN,
  NAME_MAX,
} from './leaderboard.js';
import { THEMES, getTheme, applyTheme } from './themes.js';
import {
  getBestScore,
  setBestScore,
  getPlayerName,
  setPlayerName,
  getThemeId,
  setThemeId,
  getSkinId,
  setSkinId,
  getMusicTrack,
  setMusicTrack,
  getVolume,
  setVolume,
  getSfxOn,
  setSfxOn,
  getGamesCompleted,
  incrementGamesCompleted,
  getCreatorMomentShown,
  setCreatorMomentShown,
} from './storage.js';

// Everywhere the game points at Roman. One place, so the About card,
// Zig's creator moment and the footer can never drift apart.
const LINKS = {
  portfolio: 'https://romanakmal.dev',
  github: 'https://github.com/RomanAkmal/snake-arcade',
  linkedin: 'https://www.linkedin.com/in/roman-akmal-a4563320a/',
};

// Zig mentions his creator once, ever, after this many finished games.
const CREATOR_AFTER_GAMES = 3;

// Reassigned by setTheme(). Everything that draws reads it at call
// time (or is handed the new object), so a switch applies immediately —
// including mid-game.
let theme = getTheme(getThemeId());
applyTheme(theme);

const canvas = document.getElementById('game-canvas');
const stage = document.getElementById('stage');

// Recreated per run by startGame() — 'classic' or 'rush'
let game = new Game('classic');
// The menu's idle snake: wraps instead of dying, stays short so it
// can't box itself in, and never speeds up.
const aiGame = new Game('menu', { wrap: true, maxLength: 9, speedRamp: false });

// Rush mode: 60s countdown, wrapping walls, two foods, and a chain
// multiplier that decays when the 2.5s window lapses
const RUSH_OPTS = {
  wrap: true,
  foodCount: 2,
  chainWindowMs: 2500,
  chainDecays: true,
  timeLimitMs: 60_000,
};
const RUSH_URGENT_MS = 10_000; // final stretch: red edges, big timer, ticks
let lastTickSec = 0;           // dedupes the once-per-second countdown tick
const renderer = new Renderer(canvas, theme, getSkinId());
const fx = new Fx(document.getElementById('fx-canvas'));
const audio = new AudioEngine();
const ui = new UI();

// Checked live (not cached) so an OS-level toggle applies immediately
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Swap palette everywhere at once: CSS variables for the page chrome,
// the renderer for the canvas, and localStorage so it sticks. Safe to
// call from any screen — the intro keeps the palette it started with
// (it's a 4s cinematic, not worth re-colouring mid-flight).
function setTheme(id) {
  theme = getTheme(id);
  applyTheme(theme);
  renderer.setTheme(theme);
  previewRenderer?.setTheme(theme);
  setThemeId(theme.id);
  return theme.id;
}

// Rush's final stretch runs the track this much faster.
const RUSH_MUSIC_RATE = 1.3;

function setTrack(id) {
  const applied = audio.setTrack(id);
  setMusicTrack(applied);
  // 'off' stopped the loop; anything else needs it running again. Both
  // calls are no-ops if there's nothing to do.
  audio.startMusic();
  return applied;
}

let lastVolumeBlip = 0; // throttles the drag preview blip

function setMasterVolume(v) {
  const applied = audio.setVolume(v);
  setVolume(applied);
  return applied;
}

// Skin is a renderer setting, not a palette: it changes how the snake
// is drawn while the colours keep coming from the active theme. One
// renderer draws the game snake and the idle menu snake, so this
// applies to both at once.
function setSkin(id) {
  const applied = renderer.setSkin(id);
  previewRenderer?.setSkin(applied);
  setSkinId(applied);
  return applied;
}

function setSfx(on) {
  const applied = audio.setSfx(on);
  setSfxOn(applied);
  return applied;
}

// ---------- screen manager ----------

const SCREEN = {
  GATE: 'gate',       // "press any key" — the gesture that unlocks audio
  INTRO: 'intro',
  WELCOME: 'welcome', // Zig the mascot greets the player
  MENU: 'menu',
  GAME: 'game',
  GAMEOVER: 'gameover',
  INITIALS: 'initials', // arcade name entry, only when a score makes top 10
};

const MENU_ITEMS = [
  { id: 'classic', label: 'Play Classic' },
  { id: 'rush', label: 'Play Rush' },
  { id: 'customise', label: 'Customise' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'about', label: 'About' },
];

let screen = SCREEN.INTRO;
let gameState = 'playing'; // GAME sub-state: 'playing' | 'paused' | 'dying'
let menuIndex = 0;
// Which panel is open over the menu: null | 'about' | 'customise' | 'leaderboard'
let panel = null;

// ---------- leaderboard ----------
// Tab state persists for the session so flipping back to the board
// returns you where you were. `lbRequest` is a token: switching tabs
// twice quickly must not let a slow first response paint over the
// second one.
let lbPeriod = 'all';
let lbMode = 'classic';
let lbRequest = 0;

// Identifies one run, so a leaderboard reply that arrives after the
// player has already restarted can be discarded.
let runToken = 0;

// The run being submitted: captured at game over, because `game` is
// replaced the moment Play Again is pressed.
let pendingRun = null;

// ---------- Customise preview ----------
// A real Game and a real Renderer, just small: a 9×9 board makes the
// cells big enough to actually judge a skin by. Reusing both means the
// preview can't drift from what the game looks like. Both are created
// when the screen opens and thrown away when it closes.
const PREVIEW_GRID = 9;
let previewGame = null;
let previewRenderer = null;

function startPreview(canvas) {
  if (!canvas) return;
  previewGame = new Game('preview', {
    wrap: true,        // never dies at a wall
    maxLength: 6,      // stays short so it can't box itself in
    speedRamp: false,  // a preview shouldn't accelerate forever
    grid: PREVIEW_GRID,
  });
  previewRenderer = new Renderer(canvas, theme, renderer.skin, PREVIEW_GRID);
}

function stopPreview() {
  previewRenderer?.destroy(); // drops the ResizeObserver on a dead canvas
  previewRenderer = null;
  previewGame = null;
}

// ---------- intro sequence ----------
// Phases: 'draw' (snake traces the word) → 'hold' (600ms glow pulse)
// → 'loading' (fake 2s bar with rotating messages) → crossfade to menu.
// Everything is driven by update(dt) — no timers — so skipping leaves
// nothing behind.

const INTRO_HOLD_MS = 600;
const INTRO_LOADING_MS = 2000;
const INTRO_MSG_EVERY_MS = 700;
const INTRO_FADE_MS = 400;
const INTRO_MESSAGES = [
  'Polishing apples…',
  'Teaching snake manners…',
  'Warming up synths…',
];

let intro = null;        // Intro instance; null whenever no logo is on screen
let introPhase = 'draw';
let introTimer = 0;      // ms spent in the current phase
let introElapsed = 0;    // ms since the intro started (for the skip hint)
let introMsgTimer = 0;
let introMsgIdx = 0;
let introMsgs = [];
let introPlayed = false; // once per session

// The gate solves the autoplay catch-22: browsers only allow audio
// after a user gesture, but any gesture during the intro would SKIP
// it — so nobody could ever hear the intro. Here the first key/tap
// unlocks audio and starts the show; gestures after that skip.
function enterGate() {
  screen = SCREEN.GATE;
  ui.setHudVisible(false);
  ui.setPauseVisible(false);
  ui.showGate();
}

function startFromGate() {
  if (screen !== SCREEN.GATE) return; // double-fire guard (pointer+key)
  enterIntro();
}

// Everyone sees the logo intro — a returning player is not a reason to
// cut the show (it's the part people are shown first). What the saved
// name changes is only what Zig says afterwards: 'greet' asks for a
// name, 'return' welcomes them back.
const visitMode = () => (getPlayerName() ? 'return' : 'greet');

function enterIntro() {
  // Reduced motion (or a replay inside the same session) skips the
  // logo but still gets Zig. Either way this session has now had its
  // intro.
  const skip = introPlayed || prefersReducedMotion();
  introPlayed = true;
  if (skip) {
    enterWelcome(visitMode());
    return;
  }
  screen = SCREEN.INTRO;
  intro = new Intro(fx, theme);
  introPhase = 'draw';
  introTimer = 0;
  introElapsed = 0;
  introMsgTimer = 0;
  introMsgIdx = 0;
  introMsgs = [...INTRO_MESSAGES].sort(() => Math.random() - 0.5);
  ui.setHudVisible(false);
  ui.setPauseVisible(false);
  ui.showIntro();
  audio.introSting(); // silent on a cold load — no context before a gesture
}

function skipIntro() {
  if (screen !== SCREEN.INTRO) return;
  intro = null; // no fade — jump straight to Zig
  fx.clear();
  enterWelcome(visitMode());
}

function finishIntro() {
  intro.fadeT = INTRO_FADE_MS; // logo crossfades out over what follows
  enterWelcome(visitMode());
}

// ---------- Zig's welcome ----------
// Modes: 'greet' (first visit: typewriter hello → name form → confirm),
// 'return' (returning player: one random line, 1.6s, any input skips),
// 'rename' (from About: straight to the name form).
// Stage timing is driven from update(dt); Zig's idle blinks/flicks are
// the only timers, owned and cleared by ui.hideZig().

// Long enough to read the line and reach for "not you?", short enough
// that a returning player isn't kept waiting.
const RETURN_HOLD_MS = 2400;
const GREET_PAUSE_MS = 1200;   // after the hello line, before the form
const CONFIRM_HOLD_MS = 1100;  // "Let's play!" + bounce, then menu
const TYPE_CHAR_MS = 38;
const ENTER_ZIG_AT_MS = 500;   // Zig's head lands while his body whips in
const ENTER_TOTAL_MS = 1000;   // whip beat length before the next stage
const HISS_MS = 850;           // "Hsssssss!" beat before the greeting

const RETURN_LINES = [
  'Welcome back, {name}!',
  "{name}! You're back!",
  'Ready for a new record, {name}?',
  'Missed you, {name} 🐍',
];

let welcomeMode = null;  // 'greet' | 'return' | 'rename'
let namePrefill = '';    // what the 'rename' form opens with
// 'load' | 'enter' (body whip) | 'hiss' | 'greet' | 'ask' | 'confirm' | 'return'
let welcomeStage = null;
let stageTimer = 0;
let zigLanded = false; // whether Zig's head has appeared during 'enter'
let creatorLinksShown = false; // bubble buttons appear once typing ends
let typeChars = [];      // Array.from keeps emoji in one piece
let typeCount = 0;
let typeAccum = 0;
let typeActive = false;

async function enterWelcome(mode) {
  screen = SCREEN.WELCOME;
  welcomeMode = mode;
  welcomeStage = 'load';
  ui.hideOverlay();
  ui.setHudVisible(false);
  ui.setPauseVisible(false);

  // Usually already resolved — the fetch starts at boot (see below)
  const ok = await ui.loadMascot('assets/mascot.svg').catch(() => false);
  // if the fetch failed (or something else took over meanwhile), bail
  if (screen !== SCREEN.WELCOME) return;
  if (!ok) {
    enterMenu();
    return;
  }

  const rm = prefersReducedMotion();
  stageTimer = 0;
  zigLanded = false;
  if (mode === 'rename') {
    // functional path — no theatrics, straight to the form (but he
    // still hisses hello; sound only, so the pop entrance isn't cut short)
    welcomeStage = 'ask';
    ui.showZig('pop', rm);
    ui.setBubbleText('What should I call you?');
    ui.showBubbleNameForm(namePrefill);
    audio.hiss();
  } else if (rm) {
    // reduced motion: static Zig, content only
    ui.showZig('pop', true);
    if (mode === 'return') beginReturnLine();
    else if (mode === 'creator') beginCreatorMessage();
    else {
      welcomeStage = 'greet';
      startTypewriter('Oh! A new challenger! 🐍');
    }
  } else {
    // showtime (first visit and returning alike): his glowing body
    // whips across the screen into the corner and Zig's head lands
    // mid-whip, so the body appears to flow into him (see update())
    welcomeStage = 'enter';
    startZigWhip();
    audio.whoosh(); // silent on a cold load, like all pre-gesture audio
  }
}

function startZigWhip(dur = 750) {
  // aim the whip at the corner Zig lands in (roughly his neck base)
  const zigPx = Math.min(window.innerHeight * 0.52, 560);
  fx.startWhip(zigPx * 0.25, window.innerHeight - zigPx * 0.3, {
    dur,
    color: theme.snake,
    glow: theme.snakeGlow,
    width: Math.min(46, window.innerHeight * 0.055),
  });
}

function beginReturnLine() {
  welcomeStage = 'return';
  stageTimer = 0;
  const line = RETURN_LINES[Math.floor(Math.random() * RETURN_LINES.length)];
  ui.setBubbleText(line.replace(/\{name\}/g, getPlayerName()));
  ui.showBubbleNotYou(); // the name is saved per browser, not per person
  celebrate(false); // little sparkle shower
}

// Zig's one plug for his creator. Same voice as the rest of the game:
// the welcome typewriter, the welcome slide, his own bubble.
function beginCreatorMessage() {
  welcomeStage = 'creator';
  creatorLinksShown = false;
  const name = getPlayerName() || 'Chief';
  startTypewriter(
    `Psst, ${name}. My creator Roman built me from scratch. Zero frameworks. ` +
    `If you're enjoying this, star the repo or say hi!`
  );
}

function beginHiss() {
  welcomeStage = 'hiss';
  stageTimer = 0;
  ui.setBubbleText('Hsssssss!');
  ui.zigHiss();
  audio.hiss(); // silent on a cold load, like all pre-gesture audio
}

function startTypewriter(text) {
  if (prefersReducedMotion()) {
    // no typewriter — the full line appears at once
    ui.setBubbleText(text);
    typeActive = false;
    stageTimer = 0;
    return;
  }
  typeChars = Array.from(text);
  typeCount = 0;
  typeAccum = 0;
  typeActive = true;
  ui.setBubbleText('');
}

function enterAskStage() {
  welcomeStage = 'ask';
  ui.setBubbleText('What should I call you?');
  ui.showBubbleNameForm('');
  audio.click(); // little boop as the form appears
}

// Clicking Zig anywhere he's on screen gets a reaction — half the
// time a happy bounce, half the time an indignant hiss
function pokeZig() {
  if (Math.random() < 0.5) {
    ui.zigBounce();
    audio.pop();
  } else {
    ui.zigHiss();
    audio.hiss();
  }
}

function submitZigName() {
  const name = ui.getZigName() || 'Chief';
  setPlayerName(name);
  ui.clearBubbleForm();
  ui.setBubbleText(`Let's play, ${name}!`);
  if (!prefersReducedMotion()) ui.zigBounce();
  celebrate(true);
  audio.fanfare(); // audible: typing/clicking already unlocked audio
  welcomeStage = 'confirm';
  stageTimer = 0;
}

// Confetti around Zig and his speech bubble (skipped under reduced motion)
function celebrate(big) {
  if (prefersReducedMotion()) return;
  const colors = [theme.accent, theme.food, '#bbf7d0', '#ffffff'];
  const bubble = document.getElementById('zig-bubble');
  const wrap = document.getElementById('zig-wrap');
  if (bubble && !bubble.hidden) {
    const r = bubble.getBoundingClientRect();
    fx.burst(r.left + r.width / 2, r.top + r.height / 2, {
      count: big ? 50 : 22,
      colors,
      speed: big ? 1.2 : 0.8,
    });
  }
  if (wrap) {
    const r = wrap.getBoundingClientRect();
    fx.burst(r.left + r.width * 0.45, r.top + r.height * 0.35, {
      count: big ? 40 : 18,
      colors,
      speed: big ? 1.1 : 0.8,
    });
  }
}

function enterMenu() {
  screen = SCREEN.MENU;
  panel = null;
  stopPreview(); // in case we left straight from Customise
  fx.stopWhip(); // skipping mid-whip must not leave a stray body flying
  ui.hideZig();
  // Music starts here rather than at the gate: the intro and Zig's
  // welcome are scored beat by beat, and a loop underneath muddies
  // them. This is still after the gate's gesture, so the autoplay
  // guarantee holds. Idempotent — later menu visits change nothing.
  audio.setMusicRate(1); // a Rush run may have left it sped up
  audio.startMusic();
  if (!aiGame.alive) aiGame.reset();
  ui.setHudVisible(false);
  ui.setPauseVisible(false);
  ui.showMenu(MENU_ITEMS, menuIndex);
}

function startGame(mode) {
  intro = null; // safety: never keep the logo fading over a game
  fx.clear();
  ui.hideZig();
  game = mode === 'rush' ? new Game('rush', RUSH_OPTS) : new Game('classic');
  runToken++;    // invalidates any leaderboard check still in flight
  pendingRun = null;
  audio.setMusicRate(1); // clear the previous run's urgency
  ui.setScore(0);
  ui.setCombo(1);
  ui.setBest(getBestScore(mode));
  ui.setTimerVisible(mode === 'rush');
  if (mode === 'rush') {
    ui.setTimer(60);
    ui.setTimerUrgent(false);
    lastTickSec = 0;
  }
  ui.hideOverlay();
  ui.setHudVisible(true);
  ui.setPauseVisible(true);
  gameState = 'playing';
  screen = SCREEN.GAME;
}

// Leaving the game-over screen for the menu is the one moment the
// creator message is allowed to appear: it never covers the score and
// never interrupts play. Play Again bypasses this on purpose — if the
// third game ends in a replay, the moment waits for whenever the
// player next heads to the menu.
function leaveGameOver() {
  if (getGamesCompleted() >= CREATOR_AFTER_GAMES && !getCreatorMomentShown()) {
    setCreatorMomentShown(); // latch first, so no exit path can re-fire it
    enterWelcome('creator');
    return;
  }
  enterMenu();
}

function enterGameOver(score) {
  const prevBest = getBestScore(game.mode);
  const newBest = score > prevBest;
  if (newBest) {
    setBestScore(game.mode, score);
    ui.setBest(score);
  }
  ui.showGameOver({ score, best: Math.max(prevBest, score), newBest });
  screen = SCREEN.GAMEOVER;
  // a "completed game" is a run that reached game over; quitting to
  // the menu from pause doesn't count
  incrementGamesCompleted();

  // game.clock is the run's unpaused time — exactly what the server's
  // points-per-second check needs, and it must be read now because
  // Play Again replaces `game`.
  pendingRun = { mode: game.mode, score, durationMs: Math.round(game.clock) };
  maybeAskForInitials(runToken);
}

// The board is checked *after* the game-over screen is already up, so
// a slow network never delays it. If the score qualifies we swap to the
// initials screen; if we can't reach the board we stay quiet, since
// there'd be nowhere to send them.
async function maybeAskForInitials(token) {
  const run = pendingRun;
  if (!run || run.score <= 0) return;
  const { ok, qualifies } = await makesTopTen(run.mode, run.score);
  // player restarted, went to the menu, or this is a stale reply
  if (!ok || !qualifies) return;
  if (token !== runToken || screen !== SCREEN.GAMEOVER) return;
  enterInitials();
}

function enterInitials() {
  screen = SCREEN.INITIALS;
  ui.setPauseVisible(false);
  ui.showNameConfirm({
    score: pendingRun.score,
    mode: pendingRun.mode,
    name: defaultName(getPlayerName()),
    min: NAME_MIN,
    max: NAME_MAX,
  });
  audio.readyChime();
}

function backToGameOver(rank = null) {
  screen = SCREEN.GAMEOVER;
  const best = getBestScore(pendingRun?.mode ?? game.mode);
  ui.showGameOver({
    score: pendingRun?.score ?? 0,
    best,
    newBest: false,
    rank,
  });
}

async function submitInitials() {
  const run = pendingRun;
  if (!run) return;
  const name = ui.getLeaderboardName();
  if (!isValidName(name)) {
    ui.setNameNote(`Please use ${NAME_MIN} to ${NAME_MAX} characters`, true);
    return; // stay on the screen rather than round-tripping a rejection
  }
  audio.click();
  const res = await submitScore({ ...run, name });
  if (screen !== SCREEN.INITIALS) return; // player bailed mid-request

  if (res.ok) {
    audio.fanfare();
    backToGameOver(res.rank);
    return;
  }
  // 4xx is the server refusing the score itself; anything else is the
  // network, and that isn't the player's fault
  if (res.status >= 400 && res.status < 500) {
    ui.toast('nice try 👀');
  } else {
    ui.toast('Leaderboard offline, score not sent');
  }
  backToGameOver();
}

// ---------- menu actions ----------

function setMenuIndex(i) {
  const n = MENU_ITEMS.length;
  const next = (i + n) % n; // arrows wrap around the list
  if (next === menuIndex) return;
  menuIndex = next;
  ui.setMenuSelection(next);
  audio.move();
}

function selectMenuItem(id) {
  audio.click();
  if (id === 'classic' || id === 'rush') {
    startGame(id);
  } else if (id === 'about') {
    panel = 'about';
    openAbout();
  } else if (id === 'customise') {
    panel = 'customise';
    openCustomise();
  } else if (id === 'leaderboard') {
    panel = 'leaderboard';
    openLeaderboard();
  }
}

// Paints the loading state immediately, then fills it in. Every repaint
// re-renders the tabs, so they stay usable while a fetch is in flight.
async function openLeaderboard() {
  const token = ++lbRequest;
  ui.showLeaderboard({ period: lbPeriod, mode: lbMode, state: 'loading' });
  const { ok, scores } = await fetchTopScores(lbMode, lbPeriod);
  // a newer tab press (or leaving the panel) wins
  if (token !== lbRequest || panel !== 'leaderboard') return;
  ui.showLeaderboard({
    period: lbPeriod,
    mode: lbMode,
    state: ok ? 'ready' : 'offline',
    scores,
  });
}

function openAbout() {
  ui.showAbout({ name: getPlayerName() || 'Chief', links: LINKS });
}

function openCustomise() {
  const canvas = ui.showCustomise({
    themes: Object.values(THEMES),
    theme: theme.id,
    skins: SKINS,
    skin: renderer.skin,
    tracks: TRACKS,
    track: audio.trackId,
    sfxOn: audio.sfxOn,
    volume: audio.volume,
  });
  startPreview(canvas);
}

// Back button and Esc share this — whichever panel is open.
function closePanel() {
  panel = null;
  stopPreview();
  ui.showMenu(MENU_ITEMS, menuIndex);
  audio.click();
}

// ---------- game flow ----------

function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  ui.showPause();
  audio.click();
}

function resumeGame() {
  if (gameState !== 'paused') return;
  gameState = 'playing';
  ui.hideOverlay();
  audio.click();
}

function handleGameEvent(e) {
  if (e.type === 'eat') {
    ui.setScore(e.score);
    ui.setCombo(e.combo);
    renderer.onEat(e.x, e.y);
    audio.eat(e.combo);
  } else if (e.type === 'chain-reset') {
    ui.setCombo(1); // Rush: multiplier lapsed back to ×1
  } else if (e.type === 'timeout') {
    // Rush clock ran out — softer ending than a death
    gameState = 'dying';
    ui.setPauseVisible(false);
    audio.timeUp();
    setTimeout(() => enterGameOver(e.score), 500);
  } else if (e.type === 'die') {
    gameState = 'dying';
    ui.setPauseVisible(false);
    renderer.onDeath();
    audio.death();
    // let the shake/flash play out before showing the score
    setTimeout(() => enterGameOver(e.score), 700);
  }
}

ui.onAction((action) => {
  audio.unlock();
  if (action.startsWith('menu:')) {
    selectMenuItem(action.slice(5));
  } else if (action.startsWith('menu-hover:')) {
    setMenuIndex(Number(action.slice(11)));
  } else if (action === 'menu-back') {
    closePanel();
  } else if (action === 'change-name') {
    audio.click();
    panel = null;
    namePrefill = getPlayerName() ?? ''; // editing your own name
    enterWelcome('rename');
  } else if (action === 'replay-intro') {
    audio.click();
    panel = null;
    ui.hideOverlay();
    introPlayed = false; // let the show run again this session
    enterIntro();
  } else if (action === 'zig-rename') {
    // "not you?" on the returning greeting — a different person is at
    // the keyboard, so the form starts empty
    audio.click();
    namePrefill = '';
    enterWelcome('rename');
    // ----- Customise: apply instantly, persist, and give a short
    // sound preview. Selections are re-marked in place rather than by
    // rebuilding the panel, which would restart the preview snake.
  } else if (action.startsWith('theme:')) {
    const id = setTheme(action.slice(6));
    ui.setOptionSelection('theme', id);
    // pitch climbs with the theme's position, so each one sounds distinct
    audio.letterPop(Object.keys(THEMES).indexOf(id));
  } else if (action.startsWith('skin:')) {
    const id = setSkin(action.slice(5));
    ui.setOptionSelection('skin', id);
    audio.pop();
  } else if (action.startsWith('track:')) {
    const id = setTrack(action.slice(6));
    ui.setOptionSelection('track', id);
    audio.click(); // the track itself is the rest of the preview
  } else if (action.startsWith('sfx:')) {
    const on = setSfx(action.slice(4) === 'on');
    ui.setOptionSelection('sfx', on ? 'on' : 'off');
    if (on) audio.click(); // turning them off is its own preview
    // ----- leaderboard tabs -----
  } else if (action.startsWith('lb-period:')) {
    lbPeriod = action.slice(10);
    audio.click();
    openLeaderboard();
  } else if (action.startsWith('lb-mode:')) {
    lbMode = action.slice(8);
    audio.click();
    openLeaderboard();
    // ----- leaderboard name entry -----
  } else if (action === 'name-typed') {
    audio.typeTick();
    ui.setNameNote(`${NAME_MIN} to ${NAME_MAX} characters`, false);
  } else if (action === 'name-submit') {
    submitInitials();
  } else if (action === 'name-skip') {
    audio.click();
    backToGameOver();
  } else if (action.startsWith('volume:')) {
    // fires continuously while dragging
    setMasterVolume(action.slice(7));
    // A blip every so often during the drag, so the new level is
    // audible immediately even with music off. Throttled, or a drag
    // would fire dozens of overlapping clicks.
    const now = performance.now();
    if (now - lastVolumeBlip > 120) {
      lastVolumeBlip = now;
      audio.move();
    }
  } else if (action === 'volume-preview') {
    audio.click(); // on release: something to judge the new level by
  } else if (action === 'zig-submit') {
    audio.click();
    submitZigName();
  } else if (action === 'zig-skip') {
    audio.click();
    // 'just play' means "don't ask me". Only the flows that were ASKING
    // for a name may default it to Chief: a first-timer's greet, or a
    // "not you?" rename (empty prefill). The creator moment reuses this
    // same button as "keep playing" and must never touch the name.
    if (welcomeMode === 'greet' || (welcomeMode === 'rename' && !namePrefill)) {
      setPlayerName('Chief');
    }
    enterMenu();
  } else if (action === 'zig-type') {
    audio.typeTick(); // soft tick per keystroke in the name input
  } else if (action === 'zig-poke') {
    pokeZig();
  } else if (action === 'play-again') {
    startGame(game.mode); // restart whichever mode just ended
  } else if (action === 'creator-link') {
    // the anchor's default opens the tab; Zig's job here is done
    audio.click();
    enterMenu();
  } else if (action === 'goto-menu') {
    audio.click();
    // only a game-over dismissal may trigger the creator moment; the
    // pause screen's Exit to Menu is mid-run and must never show it
    if (screen === SCREEN.GAMEOVER) leaveGameOver();
    else enterMenu();
  } else if (action === 'toggle-pause' && screen === SCREEN.GAME) {
    gameState === 'playing' ? pauseGame() : resumeGame();
  }
});

// ---------- main loop ----------
// update() holds all per-frame logic; frame() adds drawing + scheduling.
// Real elapsed time goes into game.advance(), which internally steps in
// fixed increments (see game.js) — the renderer then interpolates
// between steps for smooth motion at any frame rate.

function update(dt) {
  if (screen === SCREEN.INTRO) {
    introElapsed += dt;
    introTimer += dt;
    if (introElapsed > 1000) ui.setSkipHintVisible(true);

    if (introPhase === 'draw') {
      const ev = intro.update(dt);
      if (ev === 'sweepEnd') {
        // the fly-by dives into position — collide thump + air
        audio.pop();
        audio.whoosh();
      } else if (ev === 'letter') {
        // one rising blip per finished letter
        audio.letterPop(intro.nextLetter);
      } else if (ev === 'word') {
        audio.boom(); // thump under the screen shake
        audio.readyChime();
        introPhase = 'hold';
        introTimer = 0;
      }
    } else if (introPhase === 'hold') {
      if (introTimer >= INTRO_HOLD_MS) {
        introPhase = 'loading';
        introTimer = 0;
        introMsgTimer = 0; // first message shows immediately
        ui.setIntroLoadingVisible(true);
      }
    } else if (introPhase === 'loading') {
      introMsgTimer -= dt;
      if (introMsgTimer <= 0) {
        ui.setIntroMessage(introMsgs[introMsgIdx++ % introMsgs.length]);
        introMsgTimer = INTRO_MSG_EVERY_MS;
      }
      ui.setIntroProgress(Math.min(introTimer / INTRO_LOADING_MS, 1));
      if (introTimer >= INTRO_LOADING_MS) finishIntro();
    }
    return;
  }

  if (screen === SCREEN.MENU || screen === SCREEN.WELCOME) {
    // let the intro logo finish its crossfade over menu/welcome
    if (intro) {
      intro.fadeT -= dt;
      if (intro.fadeT <= 0) {
        intro = null;
        fx.clear(); // wipe the last faded frame off the fx canvas
      }
    }
    // idle AI snake plays behind both screens
    if (!aiGame.dirQueue.length) {
      aiGame.queueDirection(chooseAiDirection(aiGame));
    }
    for (const e of aiGame.advance(dt)) {
      if (e.type === 'eat') renderer.onEat(e.x, e.y); // particles, no sound
    }
    if (!aiGame.alive) aiGame.reset(); // safety net — should never trigger

    // Customise preview: same autopilot, its own small board. Silent —
    // the only sounds on this screen are the setting previews.
    if (previewGame) {
      if (!previewGame.dirQueue.length) {
        previewGame.queueDirection(chooseAiDirection(previewGame));
      }
      for (const e of previewGame.advance(dt)) {
        if (e.type === 'eat') previewRenderer.onEat(e.x, e.y);
      }
      if (!previewGame.alive) previewGame.reset();
    }

    // welcome stage timing
    if (screen === SCREEN.WELCOME) {
      if (typeActive) {
        typeAccum += dt;
        while (typeAccum >= TYPE_CHAR_MS && typeCount < typeChars.length) {
          typeAccum -= TYPE_CHAR_MS;
          typeCount++;
          ui.setBubbleText(typeChars.slice(0, typeCount).join(''));
          audio.typeTick();
        }
        if (typeCount >= typeChars.length) {
          typeActive = false;
          stageTimer = 0;
        }
      } else if (welcomeStage === 'enter') {
        stageTimer += dt;
        // head lands mid-whip so the body appears to flow into him
        if (!zigLanded && stageTimer >= ENTER_ZIG_AT_MS) {
          zigLanded = true;
          ui.showZig(welcomeMode === 'return' ? 'pop' : 'slide', false);
          audio.pop();
        }
        if (stageTimer >= ENTER_TOTAL_MS) {
          if (welcomeMode === 'return') beginReturnLine();
          else if (welcomeMode === 'creator') beginCreatorMessage();
          else beginHiss();
        }
      } else if (welcomeStage === 'hiss') {
        stageTimer += dt;
        if (stageTimer >= HISS_MS) {
          welcomeStage = 'greet';
          stageTimer = 0;
          startTypewriter('Oh! A new challenger! 🐍');
        }
      } else if (welcomeStage === 'greet') {
        stageTimer += dt;
        if (stageTimer >= GREET_PAUSE_MS) enterAskStage();
      } else if (welcomeStage === 'confirm') {
        stageTimer += dt;
        if (stageTimer >= CONFIRM_HOLD_MS) enterMenu();
      } else if (welcomeStage === 'return') {
        stageTimer += dt;
        if (stageTimer >= RETURN_HOLD_MS) enterMenu();
      } else if (welcomeStage === 'creator' && !creatorLinksShown) {
        // typing just finished (typeActive went false) — show the
        // buttons and then hold; the player decides when this ends
        creatorLinksShown = true;
        ui.showCreatorLinks(LINKS);
        audio.click();
      }
    }
  } else if (screen === SCREEN.GAME && gameState === 'playing') {
    for (const e of game.advance(dt)) handleGameEvent(e);

    // Rush countdown HUD + final-stretch ticks
    if (game.mode === 'rush' && gameState === 'playing') {
      const sec = Math.ceil(game.timeLeft / 1000);
      ui.setTimer(sec);
      const urgent = game.timeLeft <= RUSH_URGENT_MS;
      ui.setTimerUrgent(urgent);
      // whichever track is playing, it runs hot for the last 10s
      audio.setMusicRate(urgent ? RUSH_MUSIC_RATE : 1);
      if (urgent && sec !== lastTickSec && sec > 0) {
        lastTickSec = sec;
        audio.timeTick(10 - sec); // pitch climbs as time runs out
      }
    }
  }
}

let last = performance.now();
function frame(now) {
  // Clamp dt: never above 100ms (returning from a background tab must
  // not fast-forward) and never below 0 — the first rAF timestamp can
  // predate the performance.now() that seeded `last` by a few ms, and
  // a negative dt once froze the intro on frame one.
  const dt = Math.max(0, Math.min(now - last, 100));
  last = now;
  update(dt);
  if (screen === SCREEN.INTRO || screen === SCREEN.MENU || screen === SCREEN.WELCOME) {
    renderer.draw(aiGame, dt, { dim: true });
    // undimmed: the preview is the thing being judged
    if (previewGame) previewRenderer.draw(previewGame, dt);
  } else {
    const edgePulse =
      screen === SCREEN.GAME &&
      game.mode === 'rush' &&
      game.timeLeft <= RUSH_URGENT_MS
        ? 1
        : 0;
    renderer.draw(game, dt, { edgePulse });
  }
  // Fullscreen fx layer: the intro owns it while it exists (opaque
  // during INTRO, fading out over menu/welcome afterwards); otherwise
  // it just runs loose particles (Zig's confetti).
  if (intro) {
    intro.draw(dt, {
      alpha: screen === SCREEN.INTRO ? 1 : Math.max(intro.fadeT, 0) / INTRO_FADE_MS,
    });
  } else {
    fx.draw(dt);
  }
  requestAnimationFrame(frame);
}

// ---------- keyboard ----------

const KEY_DIRS = {
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

window.addEventListener('keydown', (e) => {
  audio.unlock();
  const key = e.key.toLowerCase();

  if (screen === SCREEN.GATE) {
    e.preventDefault();
    startFromGate();
    return;
  }

  if (screen === SCREEN.INTRO) {
    e.preventDefault(); // any key skips
    skipIntro();
    return;
  }

  if (screen === SCREEN.WELCOME) {
    if (welcomeStage !== 'load') {
      if (welcomeMode === 'return') {
        // returning greeting (incl. the whip beat): any key skips it
        e.preventDefault();
        enterMenu();
      } else if (welcomeMode === 'creator' && key === 'escape') {
        // creator moment: only Esc dismisses from the keyboard. Any-key
        // would swallow Tab, and the bubble holds real links a keyboard
        // user should be able to reach.
        e.preventDefault();
        enterMenu();
      }
    }
    return;
  }

  if (screen === SCREEN.MENU) {
    if (panel) {
      if (key === 'escape' || key === 'backspace') {
        e.preventDefault();
        closePanel();
      }
      return; // an open panel owns the keyboard (the slider needs arrows)
    }
    if (key === 'arrowup' || key === 'w') {
      e.preventDefault();
      setMenuIndex(menuIndex - 1);
    } else if (key === 'arrowdown' || key === 's') {
      e.preventDefault();
      setMenuIndex(menuIndex + 1);
    } else if (key === 'enter' || key === ' ') {
      e.preventDefault();
      selectMenuItem(MENU_ITEMS[menuIndex].id);
    }
    return;
  }

  if (screen === SCREEN.GAME) {
    const dir = KEY_DIRS[key];
    if (dir && gameState === 'playing') {
      e.preventDefault();
      game.queueDirection(dir);
    } else if (key === 'p' || key === ' ') {
      e.preventDefault();
      gameState === 'playing' ? pauseGame() : resumeGame();
    } else if (key === 'escape') {
      // first Esc pauses, a second one exits to the menu
      e.preventDefault();
      if (gameState === 'playing') pauseGame();
      else if (gameState === 'paused') enterMenu();
    }
    return;
  }

  // The name field owns the keyboard here — it's a real text input, so
  // only Enter and Esc are intercepted.
  if (screen === SCREEN.INITIALS) {
    if (key === 'enter') {
      e.preventDefault();
      submitInitials();
    } else if (key === 'escape') {
      e.preventDefault();
      audio.click();
      backToGameOver();
    }
    return;
  }

  if (screen === SCREEN.GAMEOVER) {
    if (key === 'enter' || key === ' ') {
      e.preventDefault();
      startGame(game.mode); // replay the same mode
    } else if (key === 'escape') {
      e.preventDefault();
      leaveGameOver(); // may hand off to the creator moment
    }
  }
});

// Any click/tap during the intro skips it (this is also the user
// gesture that unlocks audio for everything after)
window.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (screen === SCREEN.GATE) {
    startFromGate();
  } else if (screen === SCREEN.INTRO) {
    skipIntro();
  } else if (
    screen === SCREEN.WELCOME &&
    (welcomeMode === 'return' || welcomeMode === 'creator') &&
    welcomeStage !== 'load' &&
    !e.target.closest('#zig-bubble') &&
    !e.target.closest('#zig-wrap') // tapping Zig pokes him instead
  ) {
    enterMenu(); // tap anywhere else dismisses the greeting/plug
  }
});

// ---------- touch (swipe to steer) ----------

let touchOrigin = null;
const SWIPE_PX = 24;

stage.addEventListener(
  'touchstart',
  (e) => {
    audio.unlock();
    touchOrigin = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  },
  { passive: true }
);

stage.addEventListener(
  'touchmove',
  (e) => {
    // Only swallow the gesture while actually steering. This used to
    // preventDefault every touchmove inside the stage, which also ate
    // drags on the volume slider and scrolling of the Customise panel —
    // both of which live in an overlay that is a child of the stage.
    if (!touchOrigin || screen !== SCREEN.GAME || gameState !== 'playing') return;
    e.preventDefault(); // keep the page from scrolling while steering
    const dx = e.touches[0].clientX - touchOrigin.x;
    const dy = e.touches[0].clientY - touchOrigin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    // dominant axis wins; reset the origin so one long drag can chain
    // several turns without lifting the finger
    game.queueDirection(
      Math.abs(dx) > Math.abs(dy)
        ? { x: Math.sign(dx), y: 0 }
        : { x: 0, y: Math.sign(dy) }
    );
    touchOrigin = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  },
  { passive: false }
);

// ---------- quality-of-life ----------

// Auto-pause when the tab loses focus so nobody dies off-screen — and
// silence the music with it. Browsers throttle setInterval to about
// once a second in a hidden tab, which the music scheduler can't keep a
// beat through; it would come back as sporadic blips.
let musicWasPlaying = false;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    musicWasPlaying = audio.isMusicPlaying();
    audio.stopMusic();
    if (screen === SCREEN.GAME && gameState === 'playing') pauseGame();
  } else if (musicWasPlaying) {
    // only resume what we ourselves stopped: a player still on the gate
    // or in the intro must not get music early
    musicWasPlaying = false;
    audio.startMusic();
  }
});

// ---------- boot ----------

ui.setBest(getBestScore(game.mode));
// Audio settings are restored now but make no sound: there's no
// AudioContext until the gate's gesture, and startMusic() waits for
// the menu.
audio.setVolume(getVolume());
audio.setSfx(getSfxOn());
audio.setTrack(getMusicTrack());
// Fetch Zig now, while the gate and intro are on screen, so the welcome
// screen never sits there waiting on a network round trip.
ui.loadMascot('assets/mascot.svg').catch(() => {});
enterGate();
requestAnimationFrame(frame);

// Dev hook for console debugging and the phase logic checks.
// TODO: remove before final deploy (noted in CLAUDE.md).
window.__snakeDebug = {
  get game() {
    return game; // live getter — startGame() replaces the instance
  },
  aiGame,
  renderer,
  fx,
  ui,
  update,
  enterIntro,
  startGame,
  setTheme,
  setSkin,
  setTrack,
  setMasterVolume,
  setSfx,
  SKINS,
  TRACKS,
  audio,
  get panel() {
    return panel;
  },
  get previewGame() {
    return previewGame;
  },
  get theme() {
    return theme;
  },
  get skin() {
    return renderer.skin;
  },
  get intro() {
    return intro;
  },
  get welcomeStage() {
    return welcomeStage;
  },
  get welcomeMode() {
    return welcomeMode;
  },
  get introPhase() {
    return introPhase;
  },
  get introPlayed() {
    return introPlayed;
  },
  set introPlayed(v) {
    introPlayed = v;
  },
  get screen() {
    return screen;
  },
  get gameState() {
    return gameState;
  },
};
