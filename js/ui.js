// ui.js — the DOM layer: HUD numbers, and the overlay used for the
// start screen, pause screen and game-over screen. Buttons report back
// through a single onAction callback (set by main.js) instead of the
// UI knowing anything about game state.

export class UI {
  constructor() {
    this.scoreEl = document.getElementById('score');
    this.bestEl = document.getElementById('best');
    this.comboEl = document.getElementById('combo');
    this.comboValueEl = document.getElementById('combo-value');
    this.overlayEl = document.getElementById('overlay');
    this.pauseBtn = document.getElementById('pause-btn');

    this.actionHandler = null;

    // One delegated listener covers every overlay button, present or future
    this.overlayEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn && this.actionHandler) this.actionHandler(btn.dataset.action);
    });
    this.pauseBtn.addEventListener('click', () => {
      if (this.actionHandler) this.actionHandler('toggle-pause');
    });
  }

  onAction(handler) {
    this.actionHandler = handler;
  }

  // ----- HUD -----

  setScore(n) {
    this.scoreEl.textContent = n;
  }

  setBest(n) {
    this.bestEl.textContent = n;
  }

  setCombo(combo) {
    this.comboEl.hidden = combo < 2;
    this.comboValueEl.textContent = combo;
    if (combo >= 2) {
      // restart the pop animation on every combo change
      this.comboEl.style.animation = 'none';
      void this.comboEl.offsetWidth; // force reflow so the reset sticks
      this.comboEl.style.animation = '';
    }
  }

  setPauseVisible(visible) {
    this.pauseBtn.hidden = !visible;
  }

  // ----- overlay screens -----

  showStart() {
    this.overlayEl.innerHTML = `
      <div class="panel">
        <h1 class="title">SNAKE<span>ARCADE</span></h1>
        <p class="hint">Arrow keys / WASD &mdash; or swipe</p>
        <button class="btn" data-action="play">Play Classic</button>
      </div>`;
    this.overlayEl.hidden = false;
  }

  showPause() {
    this.overlayEl.innerHTML = `
      <div class="panel">
        <h2>Paused</h2>
        <button class="btn" data-action="toggle-pause">Resume</button>
        <p class="hint">P / Esc / Space to resume</p>
      </div>`;
    this.overlayEl.hidden = false;
  }

  showGameOver({ score, best, newBest }) {
    this.overlayEl.innerHTML = `
      <div class="panel">
        <h2>Game Over</h2>
        <p class="final-score">${score}</p>
        ${newBest ? '<p class="new-best">New best!</p>' : `<p class="hint">Best: ${best}</p>`}
        <button class="btn" data-action="play">Play Again</button>
      </div>`;
    this.overlayEl.hidden = false;
  }

  hideOverlay() {
    this.overlayEl.hidden = true;
    this.overlayEl.innerHTML = '';
  }
}
