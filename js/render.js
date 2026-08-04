// render.js — everything drawn on the canvas: board, food, snake
// (with interpolation), particles, screen shake and the death flash.
// Owns no game state; it reads a Game instance each frame.

import { GRID } from './game.js';

const REDUCED_MOTION = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

// ---------- snake skins ----------
// A skin changes how the snake is *drawn*, never what colour it is —
// every one of these paints with the active theme's snake colours, so
// all 4 skins work with all 6 themes. Order is the Customise order.
export const SKINS = [
  { id: 'solid', name: 'Solid' },
  { id: 'gradient', name: 'Gradient' },
  { id: 'neon', name: 'Neon' },
  { id: 'pixel', name: 'Pixel' },
];

export const SKIN_IDS = SKINS.map((s) => s.id);

// Colour maths for the gradient skin. Theme colours are authored as
// hex; parsing is memoised because this runs per segment per frame.
const rgbCache = new Map();

function toRgb(hex) {
  if (rgbCache.has(hex)) return rgbCache.get(hex);
  let out = null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex ?? '');
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    out = [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  rgbCache.set(hex, out);
  return out;
}

// Blend two theme colours. Anything that isn't plain hex (an rgba()
// glow, say) falls back to `a` rather than painting garbage.
function mix(a, b, amount) {
  const ca = toRgb(a);
  const cb = toRgb(b);
  if (!ca || !cb) return a;
  const f = Math.min(Math.max(amount, 0), 1);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * f)},${Math.round(
    ca[1] + (cb[1] - ca[1]) * f
  )},${Math.round(ca[2] + (cb[2] - ca[2]) * f)})`;
}

export class Renderer {
  // `grid` must match the Game it draws. Only the Customise preview
  // passes anything other than GRID.
  constructor(canvas, theme, skin = 'solid', grid = GRID) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = theme;
    this.grid = grid;
    // One renderer draws both the game snake and the idle menu snake,
    // so setting this once covers both.
    this.skin = SKIN_IDS.includes(skin) ? skin : 'solid';

    this.cell = 0;    // pixel size of one grid cell (device pixels)
    this.time = 0;    // running time for pulsing animations
    this.particles = [];
    this.shake = 0;   // 1 → 0 after death
    this.flash = 0;   // 1 → 0 red flash after death

    this.resize();
    // Re-fit whenever the stage changes size (rotation, window resize)
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  // The preview renderer is thrown away every time the Customise screen
  // closes; without this its observer would keep the detached canvas
  // alive, one per visit.
  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  setTheme(theme) {
    this.theme = theme;
  }

  setSkin(id) {
    this.skin = SKIN_IDS.includes(id) ? id : 'solid';
    return this.skin;
  }

  resize() {
    // Render in device pixels for crisp lines on hi-DPI screens.
    const dpr = window.devicePixelRatio || 1;
    const cssSize = this.canvas.clientWidth || 300;
    this.cell = Math.floor((cssSize * dpr) / this.grid);
    this.canvas.width = this.cell * this.grid;
    this.canvas.height = this.cell * this.grid;
  }

  // ----- one-shot effects, triggered from main.js on game events -----

  onEat(cellX, cellY) {
    if (REDUCED_MOTION) return;
    const cx = (cellX + 0.5) * this.cell;
    const cy = (cellY + 0.5) * this.cell;
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.06 + Math.random() * 0.18) * this.cell;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, // 1 → 0, doubles as alpha
      });
    }
  }

  onDeath() {
    if (REDUCED_MOTION) return;
    this.shake = 1;
    this.flash = 1;
  }

  // ----- per-frame drawing -----

  draw(game, dtMs, { dim = false, edgePulse = 0 } = {}) {
    this.time += dtMs;
    const { ctx, cell, theme } = this;
    const size = cell * this.grid;
    const t = game.interp();

    ctx.save();

    // Screen shake: random offset that fades out over ~0.4s
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dtMs / 400);
      const mag = this.shake * this.shake * cell * 0.5;
      ctx.translate(
        (Math.random() * 2 - 1) * mag,
        (Math.random() * 2 - 1) * mag
      );
    }

    this.drawBoard(size);
    for (const f of game.foods) {
      if (f) this.drawFood(f);
    }
    this.drawSnake(game, t);
    this.drawParticles(dtMs);

    // Rush final seconds: the board edges pulse red
    if (edgePulse > 0) {
      const a = edgePulse * (0.3 + 0.25 * Math.sin(this.time / 140));
      ctx.save();
      ctx.globalAlpha = Math.max(a, 0);
      ctx.strokeStyle = theme.danger;
      ctx.lineWidth = cell * 0.45;
      ctx.shadowColor = theme.danger;
      ctx.shadowBlur = cell * 1.2;
      ctx.strokeRect(
        ctx.lineWidth / 2,
        ctx.lineWidth / 2,
        size - ctx.lineWidth,
        size - ctx.lineWidth
      );
      ctx.restore();
    }

    // Red flash over everything, fading out after death
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dtMs / 450);
      ctx.fillStyle = theme.danger;
      ctx.globalAlpha = this.flash * 0.35;
      ctx.fillRect(-cell, -cell, size + cell * 2, size + cell * 2);
      ctx.globalAlpha = 1;
    }

    // Menu mode: wash the board toward the background color so overlay
    // text stays readable over the moving AI snake
    if (dim) {
      ctx.fillStyle = theme.bg;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  drawBoard(size) {
    const { ctx, cell, theme } = this;
    ctx.fillStyle = theme.board;
    ctx.fillRect(0, 0, size, size);
    // Subtle checkerboard so movement is readable against the background
    ctx.fillStyle = theme.boardAlt;
    for (let y = 0; y < this.grid; y++) {
      for (let x = 0; x < this.grid; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  drawFood(food) {
    const { ctx, cell, theme } = this;
    const pulse = REDUCED_MOTION ? 0 : Math.sin(this.time / 220) * 0.06;
    const r = cell * (0.32 + pulse);
    ctx.save();
    ctx.shadowColor = theme.foodGlow;
    ctx.shadowBlur = cell * 0.8;
    ctx.fillStyle = theme.food;
    ctx.beginPath();
    ctx.arc((food.x + 0.5) * cell, (food.y + 0.5) * cell, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Where each segment is *right now*, in canvas pixels (top-left of
  // the cell). Every skin draws from this one list, so they all inherit
  // the interpolation — and the wrap handling — for free.
  //
  // Each segment is lerped from where it was last step to where it is
  // now: that's the whole trick behind the smooth movement. A wrap
  // teleport jumps more than one cell, so those snap to the new side
  // instead of sliding across the whole board.
  snakePoints(game, t) {
    const { cell } = this;
    const { snake, prevSnake } = game;
    const pts = [];
    for (let i = 0; i < snake.length; i++) {
      const curr = snake[i];
      const prev = prevSnake[i] ?? curr; // freshly-grown tail has no prev
      const px = Math.abs(curr.x - prev.x) > 1 ? curr.x : prev.x;
      const py = Math.abs(curr.y - prev.y) > 1 ? curr.y : prev.y;
      pts.push({
        x: (px + (curr.x - px) * t) * cell,
        y: (py + (curr.y - py) * t) * cell,
      });
    }
    return pts;
  }

  drawSnake(game, t) {
    const pts = this.snakePoints(game, t);
    if (!pts.length) return;

    if (this.skin === 'gradient') this.drawSnakeGradient(pts);
    else if (this.skin === 'neon') this.drawSnakeNeon(pts);
    else if (this.skin === 'pixel') this.drawSnakePixel(pts);
    else this.drawSnakeSolid(pts);

    this.drawEyes(game, t);
  }

  // 1. solid — the original look: rounded segments, lighter head.
  drawSnakeSolid(pts) {
    const { ctx, cell, theme } = this;
    ctx.save();
    ctx.shadowColor = theme.snakeGlow;
    ctx.shadowBlur = cell * 0.55;
    // tail → head, so the head sits on top
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.fillStyle = i === 0 ? theme.snakeHead : theme.snake;
      this.segment(pts[i]);
    }
    ctx.restore();
  }

  // 2. gradient — head colour bleeding into body colour and then down
  //    toward the board, so the tail reads as "further away".
  drawSnakeGradient(pts) {
    const { ctx, cell, theme } = this;
    const last = Math.max(pts.length - 1, 1);
    ctx.save();
    ctx.shadowColor = theme.snakeGlow;
    ctx.shadowBlur = cell * 0.45;
    for (let i = pts.length - 1; i >= 0; i--) {
      const f = i / last; // 0 at the head, 1 at the tail
      const blend = mix(theme.snakeHead, theme.snake, f);
      ctx.fillStyle = i === 0 ? theme.snakeHead : mix(blend, theme.board, f * 0.35);
      this.segment(pts[i]);
    }
    ctx.restore();
  }

  // 3. neon — a glowing tube whose trail thins and fades out behind the
  //    head. Drawn as links between segment centres rather than blocks,
  //    which is what makes it read as one continuous streak.
  drawSnakeNeon(pts) {
    const { ctx, cell, theme } = this;
    const n = pts.length;
    const c = (p) => [p.x + cell / 2, p.y + cell / 2];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = theme.snake;
    ctx.shadowColor = theme.snakeGlow;

    // tail → head so brighter links paint over dimmer ones
    for (let i = n - 1; i > 0; i--) {
      const [ax, ay] = c(pts[i]);
      const [bx, by] = c(pts[i - 1]);
      // Don't bridge a wrap: those two segments are on opposite edges
      // and a link would draw a stripe straight across the board.
      if (Math.abs(ax - bx) > cell * 1.5 || Math.abs(ay - by) > cell * 1.5) continue;
      const f = 1 - i / n; // 0 at the tail, ~1 at the head
      ctx.globalAlpha = 0.22 + 0.78 * f;
      ctx.lineWidth = cell * (0.42 + 0.42 * f);
      ctx.shadowBlur = cell * (0.3 + 1.1 * f);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // bright head cap on top of the streak
    const [hx, hy] = c(pts[0]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.snakeHead;
    ctx.shadowBlur = cell * 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy, cell * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. pixel — hard-edged blocks, no rounding, no glow. Coordinates are
  //    snapped to whole device pixels so the edges stay crisp instead of
  //    smearing across two pixels mid-slide.
  drawSnakePixel(pts) {
    const { ctx, cell, theme } = this;
    const inset = Math.max(1, Math.round(cell * 0.04));
    const size = Math.round(cell) - inset * 2;
    ctx.save();
    ctx.shadowBlur = 0;
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.fillStyle = i === 0 ? theme.snakeHead : theme.snake;
      ctx.fillRect(
        Math.round(pts[i].x) + inset,
        Math.round(pts[i].y) + inset,
        size,
        size
      );
    }
    ctx.restore();
  }

  // one rounded body block, inset slightly so segments read separately
  segment(p) {
    const { cell } = this;
    this.roundRect(
      p.x + cell * 0.06,
      p.y + cell * 0.06,
      cell * 0.88,
      cell * 0.88,
      cell * 0.28
    );
  }

  drawEyes(game, t) {
    const { ctx, cell } = this;
    const head = game.snake[0];
    const prev = game.prevSnake[0] ?? head;
    const bx = Math.abs(head.x - prev.x) > 1 ? head.x : prev.x; // wrap snap
    const by = Math.abs(head.y - prev.y) > 1 ? head.y : prev.y;
    const hx = (bx + (head.x - bx) * t + 0.5) * cell;
    const hy = (by + (head.y - by) * t + 0.5) * cell;
    const d = game.dir;
    // Two dots offset perpendicular to the travel direction
    const px = -d.y, py = d.x;
    const fwd = cell * 0.18, side = cell * 0.16, r = cell * 0.07;
    const square = this.skin === 'pixel'; // round eyes would break the grid
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.theme.board;
    for (const s of [1, -1]) {
      const ex = hx + d.x * fwd + px * side * s;
      const ey = hy + d.y * fwd + py * side * s;
      if (square) {
        const w = Math.max(2, Math.round(r * 2));
        ctx.fillRect(Math.round(ex - w / 2), Math.round(ey - w / 2), w, w);
      } else {
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawParticles(dtMs) {
    const { ctx, cell, theme } = this;
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx * (dtMs / 16.7);
      p.y += p.vy * (dtMs / 16.7);
      p.vx *= 0.92; // friction so the burst settles
      p.vy *= 0.92;
      p.life -= dtMs / 500;
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = theme.food;
      const s = cell * 0.16;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  roundRect(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h); // ancient-browser fallback
    }
    ctx.fill();
  }
}

// ---------- fullscreen fx layer ----------
// One fixed transparent canvas covering the viewport (#fx-canvas).
// The intro paints its whole show onto it; the rest of the time it
// carries loose particle bursts (confetti for Zig, etc.). Everything
// is drawn in device pixels; burst() takes CSS pixels for convenience.

export class Fx {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.whip = null; // an in-flight body whip (see startWhip)
    this.needsClear = false;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
  }

  // Spawn a firework of little squares at a CSS-pixel position
  burst(cssX, cssY, { count = 40, colors = ['#ffffff'], speed = 1 } = {}) {
    const d = this.dpr;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.08 + Math.random() * 0.4) * speed * d;
      this.parts.push({
        x: cssX * d,
        y: cssY * d,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.15 * d, // slight upward bias, then gravity
        g: 0.0009 * d,
        life: 1,
        decay: 0.0011 + Math.random() * 0.001,
        size: (2.5 + Math.random() * 3.5) * d,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.02,
      });
    }
  }

  // Advance + render every particle onto the current ctx transform.
  // Shared: called by Intro inside its own frame, or by draw() alone.
  stepParts(dt) {
    const { ctx } = this;
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.parts) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= p.decay * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  // A thick glowing snake body that whips in from the right edge and
  // dives into a target point (CSS pixels) — used when Zig arrives, so
  // the player sees his whole body and tapered tail rush past before
  // the head settles in the corner.
  startWhip(toCssX, toCssY, { dur = 750, color, glow, width = 40 } = {}) {
    const d = this.dpr;
    this.whip = {
      t: 0,
      dur,
      from: { x: this.canvas.width + 80 * d, y: this.canvas.height * 0.45 },
      to: { x: toCssX * d, y: toCssY * d },
      trail: [],
      width: width * d,
      color,
      glow,
    };
  }

  stepWhip(dt) {
    const w = this.whip;
    const { ctx, canvas } = this;
    w.t += dt;
    const p = Math.min(w.t / w.dur, 1);
    if (p < 1) {
      const e = 1 - Math.pow(1 - p, 3); // ease-out: fast entry, soft landing
      const x = w.from.x + (w.to.x - w.from.x) * e;
      const baseY = w.from.y + (w.to.y - w.from.y) * e;
      // serpentine wiggle that settles as he lands
      const y = baseY + Math.sin(p * Math.PI * 3.2) * (1 - p) * canvas.height * 0.16;
      w.trail.push({ x, y });
      if (Math.random() < 0.5) {
        this.burst(x / this.dpr, y / this.dpr, { count: 1, colors: [w.color], speed: 0.4 });
      }
    } else {
      // head has landed — the tail rushes in after it
      w.trail.shift();
      w.trail.shift();
    }
    if (w.trail.length > 26) w.trail.shift(); // cap = visible body length
    if (p >= 1 && w.trail.length < 2) {
      this.whip = null;
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = w.glow;
    ctx.shadowBlur = canvas.height * 0.025;
    for (let i = 1; i < w.trail.length; i++) {
      const f = i / w.trail.length; // 0 tail → 1 head
      ctx.globalAlpha = 0.35 + 0.65 * f;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width * (0.22 + 0.78 * f); // tapered tail
      ctx.beginPath();
      ctx.moveTo(w.trail[i - 1].x, w.trail[i - 1].y);
      ctx.lineTo(w.trail[i].x, w.trail[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Standalone mode (no intro on the canvas): clear + run whip/particles
  draw(dt) {
    this.resize();
    const { ctx, canvas } = this;
    if (!this.parts.length && !this.whip) {
      // wipe the last frame once, then stop touching the canvas
      if (this.needsClear) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.needsClear = false;
      }
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.needsClear = true;
    if (this.whip) this.stepWhip(dt);
    this.stepParts(dt);
  }

  // Stop an in-flight whip without touching the particles (confetti
  // may still be falling and should finish naturally)
  stopWhip() {
    this.whip = null;
  }

  clear() {
    this.parts = [];
    this.whip = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.needsClear = false;
  }
}

// ---------- intro: the snake sweeps the screen, then draws "SNAKE" ----------
// Each letter is a polyline on a 3×5 grid of cells, written as
// axis-aligned waypoints. One continuous route strings all five letters
// together (with unlit travel hops between them); a snake head walks
// the route cell by cell with the same interpolated movement as
// gameplay. Letter cells it passes stay lit ("ink"), so the finished
// word looks like the snake's own body. Retracing over lit cells is
// fine — it just glides over its trail.
// Before the word, a showy fly-by: the snake serpentines across the
// full viewport trailing sparks. On completion: radial flash, screen
// shake, and spark bursts off the letters.

const WORD = 'SNAKE';
const LETTER_W = 3;
const LETTER_GAP = 2;
const LETTER_H = 5;
const LETTER_SPACING = LETTER_W + LETTER_GAP;
const INTRO_STEP_MS = 36; // route is ~100 cells → ≈3.6s of drawing
const INTRO_BODY = 10;    // bright moving trail behind the head
const SWEEP_MS = 1700;    // the opening fly-by

const LETTER_PATHS = {
  S: [[2,0],[0,0],[0,2],[2,2],[2,4],[0,4]],
  N: [[0,4],[0,0],[1,0],[1,2],[2,2],[2,4],[2,0]],
  A: [[0,4],[0,0],[2,0],[2,4],[2,2],[0,2]],
  K: [[0,0],[0,4],[0,2],[1,2],[1,1],[2,1],[2,0],[2,1],[1,1],[1,2],[1,3],[2,3],[2,4]],
  E: [[2,0],[0,0],[0,2],[2,2],[0,2],[0,4],[2,4]],
};

function buildIntroRoute() {
  const route = [{ x: -3, y: 0, ink: false }]; // lead-in from off-screen
  const letterEnds = []; // route index where each letter finishes
  // walk from the route's current end to (x,y) in unit steps
  const walkTo = (x, y, ink) => {
    let { x: cx, y: cy } = route[route.length - 1];
    while (cx !== x) { cx += Math.sign(x - cx); route.push({ x: cx, y: cy, ink }); }
    while (cy !== y) { cy += Math.sign(y - cy); route.push({ x: cx, y: cy, ink }); }
  };
  WORD.split('').forEach((ch, i) => {
    const ox = i * LETTER_SPACING;
    const pts = LETTER_PATHS[ch];
    walkTo(ox + pts[0][0], pts[0][1], false); // unlit travel to the letter
    route[route.length - 1].ink = true;       // the start cell is part of it
    for (let p = 1; p < pts.length; p++) {
      walkTo(ox + pts[p][0], pts[p][1], true);
    }
    letterEnds.push(route.length - 1);
  });
  return { route, letterEnds };
}

// small local helper — rounded rect fill on any ctx
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

export class Intro {
  constructor(fx, theme) {
    this.fx = fx; // fullscreen Fx layer — we draw the entire show on it
    this.theme = theme;
    const built = buildIntroRoute();
    this.route = built.route;
    this.letterEnds = built.letterEnds;
    this.nextLetter = 0; // which letter completes next (for sound cues)
    this.phase = 'sweep'; // 'sweep' (fly-by) → 'word' (drawing SNAKE)
    this.sweepT = 0;
    this.trail = [];  // recent fly-by head positions
    this.head = 0;    // fractional index along the word route
    this.time = 0;    // for the glow pulse
    this.done = false;
    this.fadeT = 0;   // main.js sets this to crossfade out over the menu
    this.shake = 0;   // impact shake when the word completes
    this.flash = 0;   // radial glow burst on completion
    this.sparkAcc = 0;
  }

  // Advance the sequence. Returns 'sweepEnd' the frame the fly-by
  // dives in (collide moment before the word), 'letter' when an
  // individual letter finishes, 'word' when the whole word completes,
  // or null otherwise. All three are sound cues for main.js.
  update(dtMs) {
    if (this.done) return null;
    if (this.phase === 'sweep') {
      this.sweepT += dtMs;
      if (this.sweepT >= SWEEP_MS) {
        this.phase = 'word';
        return 'sweepEnd';
      }
      return null;
    }
    // never let the head go negative — route[-1] doesn't exist
    this.head = Math.max(0, this.head + dtMs / INTRO_STEP_MS);
    if (this.head >= this.route.length - 1) {
      this.head = this.route.length - 1;
      this.done = true;
      this.shake = 1;
      this.flash = 1;
      this.burstFromWord();
      return 'word';
    }
    if (
      this.nextLetter < this.letterEnds.length &&
      this.head >= this.letterEnds[this.nextLetter]
    ) {
      this.nextLetter++;
      return 'letter';
    }
    return null;
  }

  // Word geometry, scaled to the viewport: ~88% of the width on
  // desktop, capped by height so it also fits a 380px phone
  metrics(W = this.fx.canvas.width, H = this.fx.canvas.height) {
    const cols = WORD.length * LETTER_SPACING - LETTER_GAP;
    const cell = Math.min((W * 0.88) / cols, (H * 0.26) / LETTER_H);
    return { W, H, cell, ox: (W - cols * cell) / 2, oy: H * 0.34 };
  }

  // Serpentine fly-by: left → right across the top, back right → left
  // while descending, wiggling the whole way
  sweepPos(p, W, H) {
    const x = p < 0.5 ? W * (-0.08 + 2.3 * p) : W * (1.07 - 2.3 * (p - 0.5));
    const y = H * (0.14 + 0.34 * p) + Math.sin(p * Math.PI * 4) * H * 0.13;
    return { x, y };
  }

  burstFromWord() {
    const m = this.metrics();
    const ink = this.route.filter((p) => p.ink);
    for (let i = 0; i < 18; i++) {
      const p = ink[Math.floor(Math.random() * ink.length)];
      this.fx.burst(
        (m.ox + (p.x + 0.5) * m.cell) / this.fx.dpr,
        (m.oy + (p.y + 0.5) * m.cell) / this.fx.dpr,
        { count: 4, colors: [this.theme.snake, this.theme.snakeHead, '#ffffff'], speed: 1.4 }
      );
    }
  }

  draw(dtMs, { alpha = 1 } = {}) {
    this.fx.resize();
    const { ctx, canvas } = this.fx;
    this.time += dtMs;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (alpha <= 0) return;
    const m = this.metrics(W, H);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, W, H);

    // impact shake — decays over ~0.45s after the word completes
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dtMs / 450);
      const mag = this.shake * this.shake * H * 0.02;
      ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
    }

    if (this.phase === 'sweep') this.drawSweep(dtMs, W, H, alpha);
    else this.drawWord(dtMs, m, alpha);

    // radial glow flash bursting out of the finished word
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dtMs / 550);
      const cx = W / 2;
      const cy = m.oy + m.cell * 2.5;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.55);
      grad.addColorStop(0, this.theme.snakeGlow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha * this.flash * 0.7;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = alpha;
    }

    // sparks/confetti ride inside the same transform (they shake too)
    this.fx.stepParts(dtMs);
    ctx.restore();
  }

  drawSweep(dtMs, W, H, alpha) {
    const { ctx } = this.fx;
    const p = Math.min(this.sweepT / SWEEP_MS, 1);
    const pos = this.sweepPos(p, W, H);
    this.trail.push(pos);
    if (this.trail.length > 34) this.trail.shift();

    // spark shower off the head
    this.sparkAcc += dtMs;
    while (this.sparkAcc >= 30) {
      this.sparkAcc -= 30;
      this.fx.burst(pos.x / this.fx.dpr, pos.y / this.fx.dpr, {
        count: 2,
        colors: [this.theme.snake, this.theme.snakeHead],
        speed: 0.5,
      });
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = this.theme.snakeGlow;
    ctx.shadowBlur = H * 0.03;
    // trail segments thicken + brighten toward the head
    for (let i = 1; i < this.trail.length; i++) {
      const f = i / this.trail.length;
      ctx.globalAlpha = alpha * (0.1 + 0.9 * f);
      ctx.strokeStyle = this.theme.snake;
      ctx.lineWidth = H * (0.008 + 0.024 * f);
      ctx.beginPath();
      ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
      ctx.lineTo(this.trail[i].x, this.trail[i].y);
      ctx.stroke();
    }
    // bright head
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.theme.snakeHead;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, H * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawWord(dtMs, m, alpha) {
    const { ctx } = this.fx;
    const rect = (p, fx2, fy2) => {
      const x = m.ox + (fx2 ?? p.x) * m.cell;
      const y = m.oy + (fy2 ?? p.y) * m.cell;
      rr(ctx, x + m.cell * 0.08, y + m.cell * 0.08, m.cell * 0.84, m.cell * 0.84, m.cell * 0.25);
    };

    // gentle pulse once the word is complete
    const pulse = this.done ? 1 + Math.sin(this.time / 180) * 0.15 : 1;
    ctx.shadowColor = this.theme.snakeGlow;
    ctx.shadowBlur = m.cell * 0.7 * pulse;

    const headIdx = Math.max(0, Math.min(Math.floor(this.head), this.route.length - 1));

    // permanent ink: every letter cell the head has passed stays lit
    ctx.globalAlpha = alpha * (this.done ? 0.88 + 0.12 * Math.sin(this.time / 180) : 1);
    ctx.fillStyle = this.theme.snake;
    for (let i = 0; i <= headIdx; i++) {
      if (this.route[i].ink) rect(this.route[i]);
    }

    if (!this.done) {
      // the moving body: a short bright trail fading toward the tail
      ctx.fillStyle = this.theme.snakeHead;
      for (let k = INTRO_BODY; k >= 1; k--) {
        const i = headIdx - k;
        if (i < 0) continue;
        ctx.globalAlpha = alpha * 0.6 * (1 - k / INTRO_BODY);
        rect(this.route[i]);
      }
      // head interpolated between route cells, same trick as gameplay
      const a = this.route[headIdx];
      const b = this.route[Math.min(headIdx + 1, this.route.length - 1)];
      const f = this.head - headIdx;
      ctx.globalAlpha = alpha;
      rect(a, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      // sparks trickle off the drawing head
      this.sparkAcc += dtMs;
      while (this.sparkAcc >= 45) {
        this.sparkAcc -= 45;
        const hx = (m.ox + (a.x + (b.x - a.x) * f + 0.5) * m.cell) / this.fx.dpr;
        const hy = (m.oy + (a.y + (b.y - a.y) * f + 0.5) * m.cell) / this.fx.dpr;
        this.fx.burst(hx, hy, { count: 1, colors: [this.theme.snakeHead], speed: 0.4 });
      }
    }
    ctx.shadowBlur = 0;
  }
}
