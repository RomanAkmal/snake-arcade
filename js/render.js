// render.js — everything drawn on the canvas: board, food, snake
// (with interpolation), particles, screen shake and the death flash.
// Owns no game state; it reads a Game instance each frame.

import { GRID } from './game.js';

const REDUCED_MOTION = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

export class Renderer {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = theme;

    this.cell = 0;    // pixel size of one grid cell (device pixels)
    this.time = 0;    // running time for pulsing animations
    this.particles = [];
    this.shake = 0;   // 1 → 0 after death
    this.flash = 0;   // 1 → 0 red flash after death

    this.resize();
    // Re-fit whenever the stage changes size (rotation, window resize)
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  setTheme(theme) {
    this.theme = theme;
  }

  resize() {
    // Render in device pixels for crisp lines on hi-DPI screens.
    const dpr = window.devicePixelRatio || 1;
    const cssSize = this.canvas.clientWidth || 300;
    this.cell = Math.floor((cssSize * dpr) / GRID);
    this.canvas.width = this.cell * GRID;
    this.canvas.height = this.cell * GRID;
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

  draw(game, dtMs) {
    this.time += dtMs;
    const { ctx, cell, theme } = this;
    const size = cell * GRID;
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
    if (game.food) this.drawFood(game.food);
    this.drawSnake(game, t);
    this.drawParticles(dtMs);

    // Red flash over everything, fading out after death
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dtMs / 450);
      ctx.fillStyle = theme.danger;
      ctx.globalAlpha = this.flash * 0.35;
      ctx.fillRect(-cell, -cell, size + cell * 2, size + cell * 2);
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
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
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

  drawSnake(game, t) {
    const { ctx, cell, theme } = this;
    const { snake, prevSnake } = game;

    ctx.save();
    ctx.shadowColor = theme.snakeGlow;
    ctx.shadowBlur = cell * 0.55;

    // Draw tail → head so the head sits on top.
    // Each segment is lerped from where it was last step to where it is
    // now — that's the whole trick behind the smooth movement.
    for (let i = snake.length - 1; i >= 0; i--) {
      const curr = snake[i];
      const prev = prevSnake[i] ?? curr; // freshly-grown tail has no prev
      const x = (prev.x + (curr.x - prev.x) * t) * cell;
      const y = (prev.y + (curr.y - prev.y) * t) * cell;
      ctx.fillStyle = i === 0 ? theme.snakeHead : theme.snake;
      this.roundRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.28);
    }
    ctx.restore();

    this.drawEyes(game, t);
  }

  drawEyes(game, t) {
    const { ctx, cell } = this;
    const head = game.snake[0];
    const prev = game.prevSnake[0] ?? head;
    const hx = (prev.x + (head.x - prev.x) * t + 0.5) * cell;
    const hy = (prev.y + (head.y - prev.y) * t + 0.5) * cell;
    const d = game.dir;
    // Two dots offset perpendicular to the travel direction
    const px = -d.y, py = d.x;
    const fwd = cell * 0.18, side = cell * 0.16, r = cell * 0.07;
    ctx.fillStyle = this.theme.board;
    for (const s of [1, -1]) {
      ctx.beginPath();
      ctx.arc(hx + d.x * fwd + px * side * s, hy + d.y * fwd + py * side * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
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
