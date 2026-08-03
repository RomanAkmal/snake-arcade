// main.js — boots the game and owns the glue: the requestAnimationFrame
// loop, input (keyboard + swipe), and the state machine
// (start → playing ⇄ paused → dying → gameover).

import { Game } from './game.js';
import { Renderer } from './render.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { getTheme, applyTheme } from './themes.js';
import { getBestScore, setBestScore } from './storage.js';

const theme = getTheme('midnight');
applyTheme(theme);

const canvas = document.getElementById('game-canvas');
const stage = document.getElementById('stage');

const game = new Game('classic');
const renderer = new Renderer(canvas, theme);
const audio = new AudioEngine();
const ui = new UI();

let state = 'start'; // 'start' | 'playing' | 'paused' | 'dying' | 'gameover'

ui.setBest(getBestScore(game.mode));
ui.showStart();

// ---------- state transitions ----------

function startGame() {
  game.reset();
  ui.setScore(0);
  ui.setCombo(1);
  ui.hideOverlay();
  ui.setPauseVisible(true);
  audio.click();
  state = 'playing';
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    ui.showPause();
    audio.click();
  } else if (state === 'paused') {
    state = 'playing';
    ui.hideOverlay();
    audio.click();
  }
}

function handleGameEvent(e) {
  if (e.type === 'eat') {
    ui.setScore(e.score);
    ui.setCombo(e.combo);
    renderer.onEat(e.x, e.y);
    audio.eat(e.combo);
  } else if (e.type === 'die') {
    state = 'dying';
    ui.setPauseVisible(false);
    renderer.onDeath();
    audio.death();
    // let the shake/flash play out before showing the score
    setTimeout(() => showGameOver(e.score), 700);
  }
}

function showGameOver(score) {
  const prevBest = getBestScore(game.mode);
  const newBest = score > prevBest;
  if (newBest) {
    setBestScore(game.mode, score);
    ui.setBest(score);
  }
  ui.showGameOver({ score, best: Math.max(prevBest, score), newBest });
  state = 'gameover';
}

ui.onAction((action) => {
  audio.unlock();
  if (action === 'play') startGame();
  else if (action === 'toggle-pause') togglePause();
});

// ---------- main loop ----------
// Real elapsed time goes into game.advance(), which internally steps in
// fixed increments (see game.js) — the renderer then interpolates
// between steps for smooth motion at any frame rate.

let last = performance.now();
function frame(now) {
  // Clamp dt so returning from a background tab doesn't fast-forward
  const dt = Math.min(now - last, 100);
  last = now;

  if (state === 'playing') {
    for (const e of game.advance(dt)) handleGameEvent(e);
  }
  renderer.draw(game, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

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
  const dir = KEY_DIRS[key];

  if (state === 'start' || state === 'gameover') {
    // any key starts; a direction key also becomes the first move
    e.preventDefault();
    startGame();
    if (dir) game.queueDirection(dir);
    return;
  }

  if (dir && state === 'playing') {
    e.preventDefault();
    game.queueDirection(dir);
  } else if (key === 'p' || key === 'escape' || key === ' ') {
    e.preventDefault();
    togglePause();
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
    e.preventDefault(); // keep the page from scrolling while steering
    if (!touchOrigin || state !== 'playing') return;
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

// Auto-pause when the tab loses focus so nobody dies off-screen
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

// Dev hook: lets you poke at the live game from the console
// (e.g. __snakeDebug.game.score). Not used by the game itself.
window.__snakeDebug = { game, renderer };
