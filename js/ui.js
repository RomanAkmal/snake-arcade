// ui.js — the DOM layer: HUD numbers, toasts, and the overlay used for
// the menu, about panel, pause screen and game-over screen. Buttons
// report back through a single onAction callback (set by main.js)
// instead of the UI knowing anything about game state.

export class UI {
  constructor() {
    this.hudEl = document.querySelector('.hud');
    this.scoreEl = document.getElementById('score');
    this.bestEl = document.getElementById('best');
    this.comboEl = document.getElementById('combo');
    this.comboValueEl = document.getElementById('combo-value');
    this.overlayEl = document.getElementById('overlay');
    this.stageEl = document.getElementById('stage');
    this.pauseBtn = document.getElementById('pause-btn');
    this.timerBox = document.getElementById('timer-box');
    this.timerEl = document.getElementById('timer');

    this.actionHandler = null;
    this.toastEl = null;
    this.toastTimer = 0;

    // Zig the mascot (built lazily by loadMascot)
    this.zigLayer = null;
    this.zigWrap = null;
    this.zigSvg = null;
    this.zigBubble = null;
    this.zigText = null;
    this.zigFormSlot = null;
    this.zigTimers = [];

    // One delegated listener covers every overlay button, present or future
    this.overlayEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn && this.actionHandler) this.actionHandler(btn.dataset.action);
    });
    // Hovering a menu item moves the selection (same as arrow keys)
    this.overlayEl.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.menu-item');
      if (item && this.actionHandler) {
        this.actionHandler('menu-hover:' + item.dataset.index);
      }
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

  // visibility (not display) so the layout doesn't jump between screens
  setHudVisible(visible) {
    this.hudEl.style.visibility = visible ? 'visible' : 'hidden';
  }

  setPauseVisible(visible) {
    this.pauseBtn.hidden = !visible;
  }

  // ----- Rush countdown -----

  setTimerVisible(visible) {
    this.timerBox.hidden = !visible;
  }

  setTimer(seconds) {
    this.timerEl.textContent = seconds;
  }

  setTimerUrgent(urgent) {
    this.timerBox.classList.toggle('urgent', urgent);
  }

  // ----- Zig the mascot -----
  // The SVG is fetched once and inlined so individual elements can be
  // animated. On the way in we strip the editor background rect and
  // tag the animatable parts (eyes for blinking, tongue for flicking).

  async loadMascot(url) {
    if (this.zigLayer) return true;
    let svgText;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      svgText = await res.text();
    } catch {
      return false; // no mascot is better than a broken welcome
    }

    const layer = document.createElement('div');
    layer.id = 'zig-layer';
    layer.hidden = true;
    layer.innerHTML = `
      <div id="zig-wrap">${svgText}</div>
      <div id="zig-bubble" hidden>
        <p id="zig-text"></p>
        <div id="zig-form-slot"></div>
      </div>`;

    const svg = layer.querySelector('svg');
    if (!svg) return false;
    svg.setAttribute('aria-hidden', 'true');
    svg.querySelector('rect')?.remove(); // editor preview background

    // Eyes: the whites + pupils + glints. The pupil fill is shared with
    // the nostril dot, so require a decent radius for dark circles.
    svg.querySelectorAll('circle').forEach((c) => {
      const fill = (c.getAttribute('fill') || '').toLowerCase();
      const r = parseFloat(c.getAttribute('r') || '0');
      if (fill === '#ffffff' || (fill === '#14532d' && r > 5)) {
        c.classList.add('zig-eye');
      }
    });
    // Pupils + glints get their own class so the eyes can look around
    // (pupil = big dark circle, glint = small white circle)
    svg.querySelectorAll('circle').forEach((c) => {
      const fill = (c.getAttribute('fill') || '').toLowerCase();
      const r = parseFloat(c.getAttribute('r') || '0');
      if ((fill === '#14532d' && r > 5) || (fill === '#ffffff' && r < 6)) {
        c.classList.add('zig-pupil');
      }
    });
    // Tongue: the last pink-stroked path (the blush is an ellipse)
    const tongue = [...svg.querySelectorAll('path')]
      .reverse()
      .find((p) => (p.getAttribute('stroke') || '').toLowerCase() === '#fb7185');
    if (tongue) tongue.id = 'zig-tongue';
    // Wrap everything after the three neck strokes in a group so the
    // head can nod/tilt independently of the neck
    const NS = 'http://www.w3.org/2000/svg';
    const headG = document.createElementNS(NS, 'g');
    headG.id = 'zig-head';
    [...svg.children].slice(3).forEach((el) => headG.appendChild(el));
    svg.appendChild(headG);

    // buttons inside the bubble report through the same action channel;
    // clicking Zig himself is a "poke" (he reacts — see main.js)
    layer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn && this.actionHandler) this.actionHandler(btn.dataset.action);
      else if (e.target.closest('#zig-wrap') && this.actionHandler) {
        this.actionHandler('zig-poke');
      }
    });

    document.body.appendChild(layer);
    this.zigLayer = layer;
    this.zigWrap = layer.querySelector('#zig-wrap');
    this.zigSvg = svg;
    this.zigBubble = layer.querySelector('#zig-bubble');
    this.zigText = layer.querySelector('#zig-text');
    this.zigFormSlot = layer.querySelector('#zig-form-slot');
    return true;
  }

  // kind: 'slide' (bouncy from the left) or 'pop' (quick)
  showZig(kind, reducedMotion) {
    this.zigLayer.hidden = false;
    this.zigBubble.hidden = true;
    this.zigWrap.classList.remove('zig-slide', 'zig-pop', 'zig-bounce');
    if (!reducedMotion) {
      void this.zigWrap.offsetWidth; // restart entrance animation
      this.zigWrap.classList.add(kind === 'slide' ? 'zig-slide' : 'zig-pop');
      this.zigSvg.classList.add('zig-idle'); // gentle bob loop
      this.startZigIdle();
    }
  }

  hideZig() {
    if (!this.zigLayer) return;
    this.zigLayer.hidden = true;
    this.stopZigIdle();
    this.zigSvg.classList.remove('zig-idle', 'zig-blinking', 'zig-flick');
    this.zigWrap.classList.remove('zig-slide', 'zig-pop', 'zig-bounce', 'zig-hiss');
    this.clearBubbleForm();
    this.zigBubble.hidden = true;
  }

  // Random blinks and tongue flicks. Plain timeouts, all tracked in
  // zigTimers so hideZig() can guarantee nothing keeps running.
  startZigIdle() {
    this.stopZigIdle();
    const blinkOnce = () => {
      this.zigSvg.classList.add('zig-blinking');
      this.zigTimers.push(setTimeout(() => this.zigSvg.classList.remove('zig-blinking'), 140));
    };
    const blink = () => {
      blinkOnce();
      // snakes double-blink sometimes — it reads as personality
      if (Math.random() < 0.3) this.zigTimers.push(setTimeout(blinkOnce, 280));
      this.zigTimers.push(setTimeout(blink, 2200 + Math.random() * 1600));
    };
    const flick = () => {
      this.zigSvg.classList.add('zig-flick');
      this.zigTimers.push(setTimeout(() => this.zigSvg.classList.remove('zig-flick'), 520));
      this.zigTimers.push(setTimeout(flick, 2600 + Math.random() * 2800));
    };
    this.zigTimers.push(setTimeout(blink, 900 + Math.random() * 1200));
    this.zigTimers.push(setTimeout(flick, 1400 + Math.random() * 1800));
  }

  stopZigIdle() {
    this.zigTimers.forEach(clearTimeout);
    this.zigTimers = [];
  }

  zigBounce() {
    // drop the entrance class first — leaving it would restart the
    // whole entrance when this gesture's class is removed later
    this.zigWrap.classList.remove('zig-slide', 'zig-pop', 'zig-bounce');
    void this.zigWrap.offsetWidth;
    this.zigWrap.classList.add('zig-bounce');
  }

  // Hiss gesture: forced tongue flick + agitated head wiggle
  zigHiss() {
    this.zigSvg.classList.add('zig-flick');
    this.zigTimers.push(
      setTimeout(() => this.zigSvg.classList.remove('zig-flick'), 520)
    );
    this.zigWrap.classList.remove('zig-slide', 'zig-pop', 'zig-hiss');
    void this.zigWrap.offsetWidth;
    this.zigWrap.classList.add('zig-hiss');
    this.zigTimers.push(
      setTimeout(() => this.zigWrap.classList.remove('zig-hiss'), 600)
    );
  }

  setBubbleText(text) {
    this.zigBubble.hidden = false;
    this.zigText.textContent = text;
  }

  showBubbleNameForm(initialValue = '') {
    this.zigFormSlot.innerHTML = `
      <form id="zig-form" class="zig-form">
        <input id="zig-input" class="zig-input" maxlength="12"
               autocomplete="off" spellcheck="false" placeholder="your name">
        <button type="submit" class="btn zig-go">Go</button>
      </form>
      <button type="button" class="zig-skip" data-action="zig-skip">just play</button>`;
    const input = this.zigFormSlot.querySelector('#zig-input');
    input.value = initialValue;
    // letters/numbers/spaces only, max 12 — enforced live; each
    // keystroke reports back so main.js can play a typing tick
    input.addEventListener('input', () => {
      const clean = input.value.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 12);
      if (clean !== input.value) input.value = clean;
      if (this.actionHandler) this.actionHandler('zig-type');
    });
    // keep the input visible when the mobile keyboard opens
    input.addEventListener('focus', () =>
      input.scrollIntoView({ block: 'center', behavior: 'smooth' })
    );
    this.zigFormSlot
      .querySelector('#zig-form')
      .addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.actionHandler) this.actionHandler('zig-submit');
      });
    input.focus();
  }

  getZigName() {
    const input = document.getElementById('zig-input');
    return input
      ? input.value.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 12)
      : '';
  }

  clearBubbleForm() {
    if (this.zigFormSlot) this.zigFormSlot.innerHTML = '';
  }

  // ----- start gate -----

  showGate() {
    this.overlayEl.className = 'overlay overlay--gate';
    this.overlayEl.innerHTML = `
      <p class="gate-hint">&#9656; press any key / tap to start</p>`;
    this.overlayEl.hidden = false;
  }

  // ----- intro -----
  // The word itself is drawn on the canvas (render.js); this overlay
  // only holds the loading bar, rotating message and skip hint.

  showIntro() {
    this.overlayEl.className = 'overlay overlay--intro';
    this.overlayEl.innerHTML = `
      <div class="intro-loading" hidden>
        <div class="loading-track"><div class="loading-fill"></div></div>
        <p class="loading-msg">&nbsp;</p>
      </div>
      <p class="skip-hint" hidden>tap to skip</p>`;
    this.overlayEl.hidden = false;
  }

  setIntroLoadingVisible(visible) {
    const el = this.overlayEl.querySelector('.intro-loading');
    if (el) el.hidden = !visible;
  }

  setIntroProgress(fraction) {
    const el = this.overlayEl.querySelector('.loading-fill');
    if (el) el.style.width = `${fraction * 100}%`;
  }

  setIntroMessage(message) {
    const el = this.overlayEl.querySelector('.loading-msg');
    if (el) el.textContent = message;
  }

  setSkipHintVisible(visible) {
    const el = this.overlayEl.querySelector('.skip-hint');
    if (el) el.hidden = !visible;
  }

  // ----- overlay screens -----

  showMenu(items, selectedIndex) {
    this.overlayEl.className = 'overlay overlay--menu';
    this.overlayEl.innerHTML = `
      <div class="panel">
        <h1 class="title title--small">SNAKE<span>ARCADE</span></h1>
        <nav class="menu">
          ${items
            .map(
              (item, i) =>
                `<button class="menu-item" data-action="menu:${item.id}" data-index="${i}">${item.label}</button>`
            )
            .join('')}
        </nav>
      </div>`;
    this.overlayEl.hidden = false;
    this.setMenuSelection(selectedIndex);
  }

  setMenuSelection(index) {
    this.overlayEl.querySelectorAll('.menu-item').forEach((el, i) => {
      el.classList.toggle('selected', i === index);
    });
  }

  showAbout(playerName) {
    // playerName is restricted to [a-zA-Z0-9 ] at input time, but
    // escape anyway — it comes back from localStorage
    const safeName = String(playerName ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    this.overlayEl.className = 'overlay overlay--menu';
    this.overlayEl.innerHTML = `
      <div class="panel about">
        <h2>About</h2>
        <p>A polished little snake game built from scratch with vanilla
           JavaScript, canvas and WebAudio &mdash; no frameworks, no build
           tools, no assets.</p>
        <p>Made by <strong>Roman Akmal</strong></p>
        <a class="about-link" href="https://github.com/YOUR-GITHUB/snake-arcade"
           target="_blank" rel="noopener">View source on GitHub</a>
        <p class="hint">Playing as <strong>${safeName}</strong></p>
        <div class="btn-row">
          <button class="btn btn--ghost" data-action="change-name">Change name</button>
          <button class="btn" data-action="menu-back">Back</button>
        </div>
      </div>`;
    this.overlayEl.hidden = false;
  }

  showPause() {
    this.overlayEl.className = 'overlay';
    this.overlayEl.innerHTML = `
      <div class="panel">
        <h2>Paused</h2>
        <div class="btn-row">
          <button class="btn" data-action="toggle-pause">Resume</button>
          <button class="btn btn--ghost" data-action="goto-menu">Exit to Menu</button>
        </div>
        <p class="hint">P / Space resumes &middot; Esc exits</p>
      </div>`;
    this.overlayEl.hidden = false;
  }

  showGameOver({ score, best, newBest }) {
    this.overlayEl.className = 'overlay';
    this.overlayEl.innerHTML = `
      <div class="panel">
        <h2>Game Over</h2>
        <p class="final-score">${score}</p>
        ${newBest ? '<p class="new-best">New best!</p>' : `<p class="hint">Best: ${best}</p>`}
        <div class="btn-row">
          <button class="btn" data-action="play-again">Play Again</button>
          <button class="btn btn--ghost" data-action="goto-menu">Menu</button>
        </div>
        <p class="hint">Enter plays again &middot; Esc for menu</p>
      </div>`;
    this.overlayEl.hidden = false;
  }

  hideOverlay() {
    this.overlayEl.hidden = true;
    this.overlayEl.className = 'overlay';
    this.overlayEl.innerHTML = '';
  }

  // ----- toast -----

  toast(message) {
    // one toast at a time — a new one replaces the old
    if (this.toastEl) this.toastEl.remove();
    clearTimeout(this.toastTimer);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.stageEl.appendChild(el);
    this.toastEl = el;
    this.toastTimer = setTimeout(() => el.remove(), 1800);
  }
}
