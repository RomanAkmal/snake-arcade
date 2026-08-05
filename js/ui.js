// ui.js — the DOM layer: HUD numbers, toasts, and the overlay used for
// the menu, about panel, pause screen and game-over screen. Buttons
// report back through a single onAction callback (set by main.js)
// instead of the UI knowing anything about game state.

// Tiny inline icons for the About links and Zig's bubble. Inline so
// they cost no requests and take the current text colour.
const ICONS = {
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.26 6.6.7-4.95 4.5 1.4 6.54L12 16.77 6.05 20l1.4-6.54L2.5 8.96l6.6-.7z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="9" width="4" height="12"/><circle cx="5" cy="5" r="2"/><path d="M10 9h4v2c.6-1.2 2-2.3 4-2.3 3 0 4 1.8 4 5V21h-4v-6c0-1.6-.6-2.6-2-2.6s-2 1-2 2.6v6h-4z"/></svg>`,
};

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
    this.mascotLoad = null; // in-flight fetch, so it only ever runs once
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
    // The volume slider is rebuilt with the panel's innerHTML, so both
    // listeners are delegated rather than attached to the element.
    // 'input' fires continuously while dragging (live volume), 'change'
    // once on release (a blip to judge the new level by).
    this.overlayEl.addEventListener('input', (e) => {
      if (e.target.id === 'vol' && this.actionHandler) {
        this.setVolumeLabel(e.target.value);
        this.actionHandler('volume:' + e.target.value);
      }
    });
    this.overlayEl.addEventListener('change', (e) => {
      if (e.target.id === 'vol' && this.actionHandler) {
        this.actionHandler('volume-preview');
      }
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

  // Kicked off at boot and awaited later by the welcome screen, so the
  // fetch overlaps the gate/intro instead of stalling on a blank screen.
  // The promise is cached: calling this twice must not build two Zigs.
  loadMascot(url) {
    if (this.zigLayer) return Promise.resolve(true);
    this.mascotLoad ??= this.buildMascot(url);
    return this.mascotLoad;
  }

  async buildMascot(url) {
    let svgText;
    try {
      // A local SVG that hasn't answered in 5s is never going to.
      // Without this the welcome screen would wait on it forever.
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return false;
      svgText = await res.text();
    } catch {
      return false; // no mascot is better than a stuck welcome
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
    // Drawing tools re-add a full-bleed background rect on every export,
    // and it would turn his drop-shadow into a rectangle. Only a rect
    // that comes first counts as the background — Zig may legitimately
    // gain rects in the artwork later.
    if (svg.firstElementChild?.tagName === 'rect') svg.firstElementChild.remove();

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

  // Shown under the returning-player greeting: someone else picking up
  // the keyboard needs a way out of a name that isn't theirs.
  showBubbleNotYou() {
    this.zigFormSlot.innerHTML =
      `<button type="button" class="zig-skip" data-action="zig-rename">not you?</button>`;
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

  // The creator moment's calls to action, shown in Zig's bubble once
  // his message has finished typing. Real anchors (new tab, noopener);
  // the data-action lets main.js also dismiss back to the menu.
  showCreatorLinks({ github, portfolio }) {
    this.zigFormSlot.innerHTML = `
      <div class="bubble-links">
        <a class="btn bubble-btn" href="${github}"
           target="_blank" rel="noopener" data-action="creator-link">
          ${ICONS.star}<span>Star on GitHub</span></a>
        <a class="btn btn--ghost bubble-btn" href="${portfolio}"
           target="_blank" rel="noopener" data-action="creator-link">
          ${ICONS.globe}<span>Visit portfolio</span></a>
      </div>
      <button type="button" class="zig-skip" data-action="zig-skip">keep playing</button>`;
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

  // Theme swatches, skin/music/SFX pickers and the volume slider, over
  // a live preview snake. The preview canvas is created here and handed
  // to main.js, which owns the little Game that drives it.
  showCustomise({ themes, theme, skins, skin, tracks, track, sfxOn, volume }) {
    const seg = (action, items, current) =>
      items
        .map(
          (it) =>
            `<button class="seg-btn${it.id === current ? ' selected' : ''}"
                     data-action="${action}:${it.id}">${it.name}</button>`
        )
        .join('');

    // Swatch colours come from our own THEMES table, never from input
    this.overlayEl.className = 'overlay overlay--customise';
    this.overlayEl.innerHTML = `
      <div class="panel panel--scroll customise">
        ${this.backButton()}
        <h2>Customise</h2>
        <div class="preview"><canvas id="preview-canvas"></canvas></div>

        <div class="opt-row">
          <span class="opt-label">Theme</span>
          <div class="swatches">
            ${themes
              .map(
                (t) => `
              <button class="swatch${t.id === theme ? ' selected' : ''}"
                      data-action="theme:${t.id}" title="${t.name}"
                      aria-label="${t.name}"
                      style="background:${t.board};border-color:${t.accent}">
                <span class="sw-snake" style="background:${t.snake}"></span>
                <span class="sw-food" style="background:${t.food}"></span>
                <span class="sw-name">${t.name}</span>
              </button>`
              )
              .join('')}
          </div>
        </div>

        <div class="opt-row">
          <span class="opt-label">Skin</span>
          <div class="seg seg--wrap">${seg('skin', skins, skin)}</div>
        </div>

        <div class="opt-row">
          <span class="opt-label">Music</span>
          <div class="seg seg--wrap">${seg('track', tracks, track)}</div>
        </div>

        <div class="opt-row">
          <span class="opt-label">Sound effects</span>
          <div class="seg">
            <button class="seg-btn${sfxOn ? ' selected' : ''}" data-action="sfx:on">On</button>
            <button class="seg-btn${sfxOn ? '' : ' selected'}" data-action="sfx:off">Off</button>
          </div>
        </div>

        <div class="opt-row">
          <span class="opt-label">Volume <span id="vol-val">${volume}</span></span>
          <input type="range" id="vol" class="slider" min="0" max="100"
                 step="1" value="${volume}" aria-label="Master volume">
        </div>

        <button class="btn" data-action="menu-back">Back</button>
        <p class="hint">Esc returns to the menu</p>
      </div>`;
    this.overlayEl.hidden = false;
    return this.overlayEl.querySelector('#preview-canvas');
  }

  // Re-mark one group's selection without rebuilding the panel — a
  // rebuild would restart the preview and drop the slider mid-drag.
  setOptionSelection(action, id) {
    this.overlayEl
      .querySelectorAll(`[data-action^="${action}:"]`)
      .forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.action === `${action}:${id}`);
      });
  }

  // The About screen is a "cabinet card": Zig up top, the one-line
  // story, the three outbound links, then the housekeeping. Its job is
  // to point people at Roman without reading like an ad.
  showAbout({ name, links }) {
    const safeName = this.escape(name); // comes back from localStorage
    this.overlayEl.className = 'overlay overlay--customise';
    this.overlayEl.innerHTML = `
      <div class="panel panel--scroll about-card">
        ${this.backButton()}
        <div class="about-zig" id="about-zig" aria-hidden="true"></div>
        <h2 class="about-title">Snake Arcade</h2>
        <p class="about-story">Built from scratch in vanilla JavaScript by
           <strong>Roman Akmal</strong>. No frameworks, no dependencies,
           every sound synthesized in code.</p>
        <nav class="about-links">
          <a class="about-link-btn" href="${links.portfolio}"
             target="_blank" rel="noopener">${ICONS.globe}<span>Portfolio</span></a>
          <a class="about-link-btn" href="${links.github}"
             target="_blank" rel="noopener">${ICONS.star}<span>Star on GitHub</span></a>
          <a class="about-link-btn" href="${links.linkedin}"
             target="_blank" rel="noopener">${ICONS.linkedin}<span>LinkedIn</span></a>
        </nav>
        <div class="about-me">
          <p class="hint">Playing as <strong>${safeName}</strong> &middot; saved in this
             browser only</p>
          <div class="btn-row">
            <button class="btn btn--ghost" data-action="change-name">Change name</button>
            <button class="btn btn--ghost" data-action="replay-intro">Replay intro</button>
          </div>
        </div>
        <p class="spec-plate">Vanilla JS &middot; Canvas &middot; WebAudio &middot;
           Vercel serverless &middot; Redis</p>
      </div>`;
    this.overlayEl.hidden = false;
    this.mountMiniZig();
  }

  // A small idling Zig for the About card, cloned from the mascot SVG
  // already fetched at boot. The clone keeps its ids: they're
  // duplicates of the hidden welcome-screen Zig, which is invalid HTML
  // but exactly what we want here, because the id-based CSS
  // (#zig-tongue hidden at rest, #zig-head nodding under .zig-idle)
  // applies to both copies. Stripping the ids would leave the clone's
  // tongue permanently out.
  mountMiniZig() {
    const slot = document.getElementById('about-zig');
    if (!slot || !this.zigSvg) return; // mascot fetch may have failed
    const clone = this.zigSvg.cloneNode(true);
    clone.removeAttribute('class');
    clone.classList.add('zig-idle', 'zig-mini');
    slot.appendChild(clone);
  }

  // Live number beside the slider while dragging
  setVolumeLabel(v) {
    const el = document.getElementById('vol-val');
    if (el) el.textContent = v;
  }

  // ----- leaderboard -----
  // state: 'loading' | 'ready' | 'empty' | 'offline'. Kept as one
  // function so the tabs never disappear while a fetch is in flight —
  // the player can still switch tabs mid-load.
  showLeaderboard({ period, mode, state, scores = [], highlight = null }) {
    const tab = (action, id, label, current) =>
      `<button class="tab${id === current ? ' selected' : ''}"
               data-action="${action}:${id}">${label}</button>`;

    let bodyHtml;
    if (state === 'loading') {
      bodyHtml = `<p class="lb-note">Loading&hellip;</p>`;
    } else if (state === 'offline') {
      bodyHtml = `<p class="lb-note">Leaderboard unavailable.<br>
                  <span class="hint">Your scores are still saved on this device.</span></p>`;
    } else if (!scores.length) {
      bodyHtml = `<p class="lb-note">No scores yet.<br>
                  <span class="hint">Be the first! 🐍</span></p>`;
    } else {
      bodyHtml = `
        <ol class="lb-list">
          ${scores
            .map(
              (s, i) => `
            <li class="lb-row${highlight !== null && i === highlight ? ' is-you' : ''}">
              <span class="lb-rank">${String(i + 1).padStart(2, '0')}</span>
              <span class="lb-name" title="${this.escape(s.name)}">${this.escape(s.name)}</span>
              <span class="lb-score">${Number(s.score).toLocaleString()}</span>
            </li>`
            )
            .join('')}
        </ol>`;
    }

    this.overlayEl.className = 'overlay overlay--customise';
    this.overlayEl.innerHTML = `
      <div class="panel panel--scroll leaderboard">
        ${this.backButton()}
        <h2>Leaderboard</h2>
        <div class="tabs">
          ${tab('lb-period', 'all', 'All-time', period)}
          ${tab('lb-period', 'week', 'This Week', period)}
        </div>
        <div class="tabs tabs--sub">
          ${tab('lb-mode', 'classic', 'Classic', mode)}
          ${tab('lb-mode', 'rush', 'Rush', mode)}
        </div>
        <div class="lb-body">${bodyHtml}</div>
        <button class="btn" data-action="menu-back">Back</button>
        <p class="hint">Esc returns to the menu</p>
      </div>`;
    this.overlayEl.hidden = false;
  }

  // ----- name confirmation -----
  // Prefilled with the name the player already gave Zig, so the common
  // case is one keypress. Editable because the board is public and the
  // name they play under isn't always the one they want on it.
  showNameConfirm({ score, mode, name, min, max }) {
    this.overlayEl.className = 'overlay overlay--customise';
    this.overlayEl.innerHTML = `
      <div class="panel initials">
        <h2>New high score!</h2>
        <p class="final-score">${Number(score).toLocaleString()}</p>
        <p class="hint">${mode === 'rush' ? 'Rush' : 'Classic'} &middot; name for the leaderboard</p>
        <form class="name-form" id="name-form">
          <input id="lb-name" class="name-input" maxlength="${max}"
                 autocomplete="off" spellcheck="false" value="${this.escape(name)}"
                 aria-label="Leaderboard name">
          <p class="name-note" id="name-note">${min} to ${max} characters</p>
          <div class="btn-row">
            <button type="submit" class="btn">Submit</button>
            <button type="button" class="btn btn--ghost" data-action="name-skip">Skip</button>
          </div>
        </form>
      </div>`;
    this.overlayEl.hidden = false;

    const input = this.overlayEl.querySelector('#lb-name');
    // Sanitise as they type, matching the server's rule, so a rejected
    // character is never a surprise after a round trip.
    input.addEventListener('input', () => {
      const clean = input.value.replace(/[^A-Za-z0-9 ]/g, '').slice(0, max);
      if (clean !== input.value) input.value = clean;
      if (this.actionHandler) this.actionHandler('name-typed');
    });
    this.overlayEl.querySelector('#name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.actionHandler) this.actionHandler('name-submit');
    });
    input.focus();
    input.select();
  }

  getLeaderboardName() {
    return document.getElementById('lb-name')?.value ?? '';
  }

  // Shown when the typed name is too short to submit
  setNameNote(text, isError) {
    const el = document.getElementById('name-note');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  // Always-visible way out of a full-screen panel. Esc covers desktop,
  // but a phone has no Esc key and these panels cover the whole screen,
  // so without this there is genuinely no way back.
  backButton() {
    return `<button class="back-btn" data-action="menu-back">
              <span aria-hidden="true">&#8592;</span> Menu
            </button>`;
  }

  // Text from storage or the network is escaped before it reaches innerHTML
  escape(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

  showGameOver({ score, best, newBest, rank = null }) {
    this.overlayEl.className = 'overlay';
    this.overlayEl.innerHTML = `
      <div class="panel">
        <h2>Game Over</h2>
        <p class="final-score">${score}</p>
        ${newBest ? '<p class="new-best">New best!</p>' : `<p class="hint">Best: ${best}</p>`}
        ${rank ? `<p class="new-best">#${rank} on the leaderboard</p>` : ''}
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
