// main.js — boots everything and owns the glue: the screen manager
// (INTRO → MENU → GAME → GAMEOVER), the requestAnimationFrame loop,
// and input routing (keyboard + swipe) per screen.

import { Game, chooseAiDirection } from './game.js';
import { Renderer, Intro, Fx } from './render.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { getTheme, applyTheme } from './themes.js';
import {
  getBestScore,
  setBestScore,
  getPlayerName,
  setPlayerName,
} from './storage.js';

const theme = getTheme('midnight');
applyTheme(theme);

const canvas = document.getElementById('game-canvas');
const stage = document.getElementById('stage');

const game = new Game('classic');
// The menu's idle snake: wraps instead of dying, stays short so it
// can't box itself in, and never speeds up.
const aiGame = new Game('menu', { wrap: true, maxLength: 9, speedRamp: false });
const renderer = new Renderer(canvas, theme);
const fx = new Fx(document.getElementById('fx-canvas'));
const audio = new AudioEngine();
const ui = new UI();

// Checked live (not cached) so an OS-level toggle applies immediately
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- screen manager ----------

const SCREEN = {
  GATE: 'gate',       // "press any key" — the gesture that unlocks audio
  INTRO: 'intro',
  WELCOME: 'welcome', // Zig the mascot greets the player
  MENU: 'menu',
  GAME: 'game',
  GAMEOVER: 'gameover',
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
let aboutOpen = false;

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

function enterIntro() {
  // Returning players (saved name) skip the logo entirely — Zig just
  // says hi. First-timers get the logo, then Zig asks their name.
  if (getPlayerName()) {
    introPlayed = true;
    enterWelcome('return');
    return;
  }
  // Reduced motion (or a replay) skips the logo but still gets the
  // name flow. Either way this session has now "had" its intro.
  const skip = introPlayed || prefersReducedMotion();
  introPlayed = true;
  if (skip) {
    enterWelcome('greet');
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
  intro = null; // no fade — jump ahead (Zig still needs a name)
  fx.clear();
  enterWelcome('greet');
}

function finishIntro() {
  intro.fadeT = INTRO_FADE_MS; // logo crossfades out over what follows
  enterWelcome('greet');
}

// ---------- Zig's welcome ----------
// Modes: 'greet' (first visit: typewriter hello → name form → confirm),
// 'return' (returning player: one random line, 1.6s, any input skips),
// 'rename' (from About: straight to the name form).
// Stage timing is driven from update(dt); Zig's idle blinks/flicks are
// the only timers, owned and cleared by ui.hideZig().

const RETURN_HOLD_MS = 1600;
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
// 'load' | 'enter' (body whip) | 'hiss' | 'greet' | 'ask' | 'confirm' | 'return'
let welcomeStage = null;
let stageTimer = 0;
let zigLanded = false; // whether Zig's head has appeared during 'enter'
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

  const ok = await ui.loadMascot('assets/mascot.svg');
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
    ui.showBubbleNameForm(getPlayerName() ?? '');
    audio.hiss();
  } else if (rm) {
    // reduced motion: static Zig, content only
    ui.showZig('pop', true);
    if (mode === 'return') beginReturnLine();
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
  celebrate(false); // little sparkle shower
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
  aboutOpen = false;
  fx.stopWhip(); // skipping mid-whip must not leave a stray body flying
  ui.hideZig();
  if (!aiGame.alive) aiGame.reset();
  ui.setHudVisible(false);
  ui.setPauseVisible(false);
  ui.showMenu(MENU_ITEMS, menuIndex);
}

function startGame(mode) {
  intro = null; // safety: never keep the logo fading over a game
  fx.clear();
  ui.hideZig();
  game.reset(); // mode is always 'classic' until Rush lands
  ui.setScore(0);
  ui.setCombo(1);
  ui.hideOverlay();
  ui.setHudVisible(true);
  ui.setPauseVisible(true);
  gameState = 'playing';
  screen = SCREEN.GAME;
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
  if (id === 'classic') {
    startGame('classic');
  } else if (id === 'about') {
    aboutOpen = true;
    ui.showAbout(getPlayerName() || 'Chief');
  } else {
    // rush / customise / leaderboard — later phases
    ui.toast('Coming soon ✨');
  }
}

function closeAbout() {
  aboutOpen = false;
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
    closeAbout();
  } else if (action === 'change-name') {
    audio.click();
    aboutOpen = false;
    enterWelcome('rename');
  } else if (action === 'zig-submit') {
    audio.click();
    submitZigName();
  } else if (action === 'zig-skip') {
    audio.click();
    // 'just play': first-timers become "Chief"; a rename keeps the old name
    if (welcomeMode !== 'rename') setPlayerName('Chief');
    enterMenu();
  } else if (action === 'zig-type') {
    audio.typeTick(); // soft tick per keystroke in the name input
  } else if (action === 'zig-poke') {
    pokeZig();
  } else if (action === 'play-again') {
    startGame('classic');
  } else if (action === 'goto-menu') {
    audio.click();
    enterMenu();
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
      }
    }
  } else if (screen === SCREEN.GAME && gameState === 'playing') {
    for (const e of game.advance(dt)) handleGameEvent(e);
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
  } else {
    renderer.draw(game, dt);
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
    // returning greeting (incl. the whip beat): any key jumps to the
    // menu. Other stages own the keyboard (the name input needs it).
    if (welcomeMode === 'return' && welcomeStage !== 'load') {
      e.preventDefault();
      enterMenu();
    }
    return;
  }

  if (screen === SCREEN.MENU) {
    if (aboutOpen) {
      if (key === 'escape' || key === 'backspace') {
        e.preventDefault();
        closeAbout();
      }
      return;
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

  if (screen === SCREEN.GAMEOVER) {
    if (key === 'enter' || key === ' ') {
      e.preventDefault();
      startGame('classic');
    } else if (key === 'escape') {
      e.preventDefault();
      enterMenu();
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
    welcomeMode === 'return' &&
    welcomeStage !== 'load' &&
    !e.target.closest('#zig-bubble') &&
    !e.target.closest('#zig-wrap') // tapping Zig pokes him instead
  ) {
    enterMenu(); // tap anywhere else skips the returning greeting
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
    if (!touchOrigin || screen !== SCREEN.GAME || gameState !== 'playing') return;
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
  if (document.hidden && screen === SCREEN.GAME && gameState === 'playing') {
    pauseGame();
  }
});

// ---------- boot ----------

ui.setBest(getBestScore(game.mode));
enterGate();
requestAnimationFrame(frame);

// Dev hook for console debugging and the phase logic checks.
// TODO: remove before final deploy (noted in CLAUDE.md).
window.__snakeDebug = {
  game,
  aiGame,
  renderer,
  fx,
  ui,
  update,
  enterIntro,
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
