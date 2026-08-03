// game.js — pure game logic for Classic mode.
// No DOM, no canvas, no audio: this module only knows about the grid,
// the snake, food, scoring and time. Everything else reacts to the
// events it returns from advance().

export const GRID = 21; // 21×21 cells — odd so the snake starts dead-centre

const STEP_START_MS = 160; // time per grid step at the start
const STEP_MIN_MS = 70;    // fastest the game is allowed to get
const STEP_RAMP_MS = 3;    // speed-up per food eaten

const COMBO_WINDOW_MS = 3000; // eat again within this window to raise the combo
const COMBO_MAX = 5;
const POINTS_PER_FOOD = 10;

export class Game {
  constructor(mode = 'classic') {
    this.mode = mode;
    this.reset();
  }

  reset() {
    const mid = Math.floor(GRID / 2);
    // head first; snake starts length 4, moving right
    this.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    // prevSnake holds where each segment was one step ago — the renderer
    // interpolates between prevSnake and snake for smooth movement.
    this.prevSnake = this.snake.map((s) => ({ ...s }));
    this.dir = { x: 1, y: 0 };
    this.dirQueue = [];

    this.score = 0;
    this.combo = 1;
    this.lastEatAt = -Infinity;

    this.stepMs = STEP_START_MS;
    this.acc = 0;   // ms accumulated toward the next step
    this.clock = 0; // total unpaused game time, used for the combo window
    this.alive = true;

    this.food = null;
    this.spawnFood();
  }

  // Queue a direction change. Up to two are buffered so quick corners
  // (e.g. up-then-left within one step) don't drop the second input.
  queueDirection(dir) {
    const last = this.dirQueue.length
      ? this.dirQueue[this.dirQueue.length - 1]
      : this.dir;
    if (dir.x === -last.x && dir.y === -last.y) return; // no 180° reversal
    if (dir.x === last.x && dir.y === last.y) return;   // ignore repeats
    if (this.dirQueue.length < 2) this.dirQueue.push(dir);
  }

  // Fixed-timestep update: the render loop calls this with real elapsed
  // time; the game steps in exact stepMs increments regardless of frame
  // rate, so logic is identical at 30fps and 144fps.
  advance(dtMs) {
    const events = [];
    if (!this.alive) return events;
    this.clock += dtMs;
    this.acc += dtMs;
    while (this.acc >= this.stepMs && this.alive) {
      this.acc -= this.stepMs;
      this.stepOnce(events);
    }
    return events;
  }

  // Renderer reads this: 0..1 progress between the previous and current step.
  interp() {
    return Math.min(this.acc / this.stepMs, 1);
  }

  stepOnce(events) {
    if (this.dirQueue.length) this.dir = this.dirQueue.shift();
    this.prevSnake = this.snake.map((s) => ({ ...s }));

    const head = this.snake[0];
    const nx = head.x + this.dir.x;
    const ny = head.y + this.dir.y;

    // Classic mode: walls kill
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
      return this.die(events, 'wall');
    }

    const ate = this.food && nx === this.food.x && ny === this.food.y;

    // Self collision — the tail cell is about to vacate, so it only
    // counts as a wall when we're growing this step.
    const body = ate ? this.snake : this.snake.slice(0, -1);
    if (body.some((s) => s.x === nx && s.y === ny)) {
      return this.die(events, 'self');
    }

    this.snake.unshift({ x: nx, y: ny });

    if (ate) {
      // Combo: chained eats within the window multiply the points
      this.combo =
        this.clock - this.lastEatAt <= COMBO_WINDOW_MS
          ? Math.min(this.combo + 1, COMBO_MAX)
          : 1;
      this.lastEatAt = this.clock;
      this.score += POINTS_PER_FOOD * this.combo;
      this.stepMs = Math.max(STEP_MIN_MS, this.stepMs - STEP_RAMP_MS);
      events.push({
        type: 'eat',
        x: nx,
        y: ny,
        combo: this.combo,
        score: this.score,
      });
      this.spawnFood();
    } else {
      this.snake.pop();
    }
  }

  die(events, cause) {
    this.alive = false;
    events.push({ type: 'die', cause, score: this.score });
  }

  spawnFood() {
    // Collect every free cell, then pick one — never lands on the snake.
    const taken = new Set(this.snake.map((s) => `${s.x},${s.y}`));
    const free = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!taken.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    this.food = free.length
      ? free[Math.floor(Math.random() * free.length)]
      : null; // board full — you win snake, basically
  }
}
