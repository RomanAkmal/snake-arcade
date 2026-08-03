# Snake Arcade — Project Context

## What this is

A polished browser snake game that lives on my developer portfolio
(romanakmal.dev, hosted on Vercel). It's a portfolio showpiece: every
visitor should be impressed by the feel and polish, and every player
should see my name. Built by Roman Akmal.

## End goal

Deploy on Vercel and link/embed it from romanakmal.dev (e.g.
snake.romanakmal.dev or romanakmal.dev/snake). Public GitHub repo with a
great README — recruiters and devs will read this code.

## Tech rules

- Vanilla JS with ES modules. NO frameworks, NO build tools, no npm
  dependencies (exception: Supabase client via CDN for the leaderboard).
- Structure: index.html, css/style.css, js/main.js, js/game.js,
  js/render.js, js/audio.js, js/themes.js, js/ui.js, js/storage.js,
  js/leaderboard.js
- All sounds synthesized with WebAudio — no audio files.
- Mobile-first: touch/swipe must work as well as keyboard and mouse.
- Respect prefers-reduced-motion (skip heavy animation, jump to menu).
- Secrets (Supabase keys) go in js/config.js which is gitignored;
  commit js/config.example.js with placeholder values instead.

## Features (v1 scope — do not add features beyond this list)

1. Intro: glowing snake slithers in and its body forms the word
   "SNAKE" letter by letter, then a playful 2-second loading bar with
   rotating messages, then the menu. Skippable with any key/tap.
2. Menu: Play Classic / Play Rush / Customise / Leaderboard / About.
   An idle AI snake moves in the canvas behind the menu, chasing food
   on its own.
3. Classic mode (already built): smooth interpolated movement,
   particle burst on eat, screen shake + red flash on death, combo
   scoring, speed ramps up, pause, localStorage best score.
4. Rush mode: 60-second countdown, walls wrap instead of killing,
   2 foods on the board at once, chain multiplier up to x5 (eating
   within 2.5s of the last food raises it), edge pulses red and music
   speeds up in the final 10 seconds.
5. Customise: 6 themes — midnight, retro, sunset, paper, OLED (pure
   black), CRT (green phosphor + scanlines + slight curvature) — and
   4 snake skins — solid, gradient, neon trail, pixel blocks. All
   unlocked from the start. Live animated preview snake. Selections
   persisted in localStorage and applied in game.
6. Leaderboard: Supabase. Top-10 only per mode. 3-letter arcade
   initials entered on a retro screen when a score makes the cut.
   All-time and This Week tabs. Small profanity blocklist on initials.
   Reject impossible scores (points-per-second sanity check) with a
   "nice try 👀" toast.
7. Portfolio touches: game-over share button generating a PNG score
   card (score, mode, "snake-arcade by Roman Akmal — romanakmal.dev")
   via canvas + Web Share API with clipboard fallback; "view source"
   GitHub link in About and footer; one-time toast after 3 completed
   games: "Enjoying this? I build things for a living →
   romanakmal.dev"; GoatCounter analytics snippet.

## Code style

- Readable and commented where non-obvious — I'm learning from this
  codebase, so explain tricky parts (interpolation, WebAudio, seeded
  logic) in short comments.
- Never break Classic mode when adding features. After every change,
  the game must run by serving index.html locally.
- Keep everything working on a ~380px wide mobile screen.

## Current status

<!-- Claude: update this section after completing each phase -->

Phase 1 done: Classic mode built directly in the module structure
(the Phase 0 single-file version was lost — never committed — so
Classic was rebuilt from the spec while modularising). index.html is a
thin shell loading js/main.js as a module; styles live in
css/style.css. Classic has interpolated movement, particle burst on
eat, screen shake + red flash on death, combo scoring (×5 cap, 3s
window), speed ramp, pause (button / P / Esc / Space, auto-pause on
tab switch), swipe controls, and localStorage best score.
js/leaderboard.js and js/config.example.js are stubs for later phases.
Run locally with `python serve.py` (plain `python -m http.server` can
serve .js as text/plain on Windows, which blocks ES modules).
Next: Phase 2 — intro animation + menu with idle AI snake
