// game.js — pure game logic. No DOM, no canvas, no audio: this module
// only knows about the grid, the snake, food, scoring and time.
// Everything else reacts to the events it returns from advance().
// Also home to the little autopilot that drives the menu's idle snake.

export const GRID = 21; // 21×21 cells — odd so the snake starts dead-centre

const STEP_START_MS = 160; // time per grid step at the start
const STEP_MIN_MS = 70;    // fastest the game is allowed to get
const STEP_RAMP_MS = 3;    // speed-up per food eaten

const COMBO_WINDOW_MS = 3000; // eat again within this window to raise the combo
const COMBO_MAX = 5;
const POINTS_PER_FOOD = 10;

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export class Game {
  // Options beyond Classic (all default to Classic behaviour):
  //   wrap      — walls teleport to the far side instead of killing
  //               (Rush mode, and the menu AI's escape hatch)
  //   maxLength — snake stops growing past this length (menu AI stays
  //               short so it can't box itself in); 0 = grow forever
  //   speedRamp — whether eating speeds the game up
  constructor(mode = 'classic', { wrap = false, maxLength = 0, speedRamp = true } = {}) {
    this.mode = mode;
    this.wrap = wrap;
    this.maxLength = maxLength;
    this.speedRamp = speedRamp;
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
    let nx = head.x + this.dir.x;
    let ny = head.y + this.dir.y;

    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
      if (!this.wrap) return this.die(events, 'wall'); // Classic: walls kill
      nx = (nx + GRID) % GRID; // wrap modes: teleport to the far side
      ny = (ny + GRID) % GRID;
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
      if (this.speedRamp) {
        this.stepMs = Math.max(STEP_MIN_MS, this.stepMs - STEP_RAMP_MS);
      }
      if (this.maxLength && this.snake.length > this.maxLength) {
        this.snake.pop(); // capped: ate but doesn't grow
      }
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

// ---------- menu autopilot ----------
// Greedy steering for the idle snake behind the menu. Not meant to be
// clever — just lively: head toward the food, never step on yourself,
// stay inside the walls unless boxed in. Its Game runs with wrap
// enabled, so the "trapped" escape hatch is simply walking off-board
// and teleporting to the far side.

export function chooseAiDirection(game) {
  const head = game.snake[0];
  const { food } = game;
  let best = game.dir; // fallback: keep going (only if every move is fatal)
  let bestCost = Infinity;

  for (const d of DIRS) {
    if (d.x === -game.dir.x && d.y === -game.dir.y) continue; // no 180°
    let nx = head.x + d.x;
    let ny = head.y + d.y;
    const wraps = nx < 0 || ny < 0 || nx >= GRID || ny >= GRID;
    nx = (nx + GRID) % GRID;
    ny = (ny + GRID) % GRID;

    // never step on the body (tail vacates unless this move eats)
    const eats = food && nx === food.x && ny === food.y;
    const body = eats ? game.snake : game.snake.slice(0, -1);
    if (body.some((s) => s.x === nx && s.y === ny)) continue;

    // Cost: distance to food; walls strongly discouraged (wrapping is
    // the last resort); dead ends discouraged so it rarely traps itself.
    let cost = food ? Math.abs(nx - food.x) + Math.abs(ny - food.y) : 0;
    if (wraps) cost += 1000;
    if (freeNeighbours(nx, ny, body) === 0) cost += 500;

    if (cost < bestCost) {
      bestCost = cost;
      best = d;
    }
  }
  return best;
}

function freeNeighbours(x, y, body) {
  let free = 0;
  for (const d of DIRS) {
    const nx = (x + d.x + GRID) % GRID;
    const ny = (y + d.y + GRID) % GRID;
    if (!body.some((s) => s.x === nx && s.y === ny)) free++;
  }
  return free;
}
