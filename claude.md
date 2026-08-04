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
(the Phase 0 single-file version was lost, so Classic was rebuilt from
the spec while modularising). Run locally with `python serve.py`
(plain `python -m http.server` can serve .js as text/plain on Windows,
which blocks ES modules).

Phase 2 done: screen manager in main.js (INTRO → MENU → GAME →
GAMEOVER; INTRO is an instant stub until Phase 3). Menu with the five
items behind a dimmed idle AI snake (greedy autopilot in game.js,
wrap-enabled + length-capped so it never dies; verified 500 ticks).
Navigable by arrows+Enter, mouse hover/click, and tap, with move/select
sounds. Rush/Customise/Leaderboard show a "coming soon" toast; About
panel has blurb + placeholder GitHub link (update before launch).
Game over offers Play Again / Menu; in-game Esc pauses first, second
Esc exits to menu. Game gained wrap/maxLength/speedRamp options
(Rush will reuse wrap); Classic behaviour verified unchanged.

Phase 3 done: real intro replaces the stub. A snake head walks a
100-cell route (letters defined as polylines in render.js, joined by
unlit travel hops) drawing "SNAKE" letter by letter with gameplay-style
interpolation — traced letter cells stay lit, ~4s. Then 600ms glow
pulse, 2s fake loading bar with rotating messages, and a 400ms
crossfade into the menu. Any key/click/tap skips ("tap to skip" hint
after 1s); prefers-reduced-motion (checked live) goes straight to
menu; runs once per session. Intro sting + ready chime in audio.js
no-op gracefully before the first user gesture. Entire sequence is
driven by the frame loop (no timers), so skipping leaves nothing
running. All verified: full timing, skip from every stage,
reduced-motion, replay guard, Classic regression.

Phase 3.5 done: Zig the mascot (assets/mascot.svg, inlined at runtime
by ui.loadMascot so eyes/tongue are animatable; editor background rect
stripped on load). New WELCOME screen between intro and menu. First
visit: logo intro → Zig slides in (bouncy overshoot) → typewriter
"Oh! A new challenger! 🐍" with per-char tick → name form (max 12,
letters/numbers/spaces, sanitized live) → "Let's play, {name}!" +
bounce → menu; "just play" stores "Chief". Returning visit (saved
name): logo skipped, Zig pops in with a random greeting, 1.6s hold,
any key/tap skips. Name stored via storage.js (playerName); About
panel shows "Playing as X" + Change name (reopens the form prefilled;
its skip keeps the old name). Idle: 2s bob loop, random blinks
(3–5s), tongue flicks — CSS transforms on the inline SVG, timers
owned/cleared by ui.hideZig(). Reduced motion: static Zig, no
typewriter/bounce/idle, name flow intact. All flows + persistence +
skip paths verified; cold load is console-clean.

Intro polish pass: the intro now runs fullscreen on a fixed fx canvas
(#fx-canvas, managed by the Fx class in render.js — also a general
particle layer). Sequence: 1.7s serpentine fly-by across the whole
viewport (glowing trail + spark shower) → the SNAKE word draws at up
to 88% viewport width → on completion: radial glow flash, screen
shake, spark bursts off the letters. Name submit fires confetti
around Zig + the bubble and an audio fanfare; the returning greeting
gets a smaller sparkle burst. Fx layer sits above everything
(z 60, pointer-events none); intro loading bar/skip hint promoted to
fullscreen (z 65). fx.clear() runs on every intro exit so nothing
lingers. Reduced motion: unchanged (no intro, no bursts).

Zig entrance pass: welcome now opens with a body whip — a thick
glowing snake body (Fx.startWhip, canvas ribbon with tapered tail)
rushes in from the right edge and dives into the corner; Zig's head
lands mid-whip, then he hisses ("Hsssssss!" bubble, forced tongue
flick, head-wiggle animation, bandpass-noise hiss in audio.js) before
asking the name. Returning visits get whip → greeting (skippable at
any point; enterMenu stops a mid-flight whip via fx.stopWhip without
killing confetti). Zig is much bigger (--zig-size up to 52vh/560px).
Board scaled up: .app width is min(94vw, 76vh, 840px); HUD/menu type
scales with vh. Gesture classes (bounce/hiss) strip entrance classes
first or the CSS animation restarts the slide-in from off-screen.
Reduced motion: no whip/hiss, static Zig, flow intact.

Zig entrance (settled after iteration): body-whip ribbon + slide-in
from the left ('slide' for first visit, 'pop' for returning), then
hiss → name question. The crawl-across/vanish/rise entrance and the
procedural long-body tail were built, reviewed and REMOVED — the
owner decided they didn't look right; don't reintroduce them. Idle
set stays: neck-base sway, independent head nod (#zig-head group),
wandering pupils (.zig-pupil), double-blinks, puffed-up hiss. Any
gesture class must strip entrance classes first or the entrance
restarts. NOTE: stale cached style.css can hide CSS changes — hard
reload when animations "don't appear".

Sound pass — the intro/welcome is now fully scored (all synthesized
in audio.js, all no-op before the first user gesture): pop+whoosh at
the fly-by's collide moment (intro 'sweepEnd' event), whoosh on the
body whip, pop when Zig lands, rising letterPop per finished intro
letter, boom + readyChime on word completion, hiss, per-char
typeTick (Zig's typewriter AND the player's own keystrokes via the
'zig-type' action), click when the name form appears, fanfare +
confetti on submit. Zig is pokeable: clicking him ('zig-poke')
randomly bounces (pop) or hisses; poking never skips the returning
greeting — tapping elsewhere does. IMPORTANT audio rule: every sound
method guards with ready() which SKIPS (never queues) while the
AudioContext is 'suspended' — scheduling against a suspended context
plays everything in a late burst once it resumes. Keep the guard on
any new sound.

Start gate: boot now lands on a "press any key / tap to start"
screen (SCREEN.GATE, ui.showGate, .overlay--gate). Rationale: audio
needs a user gesture, but any gesture during the intro skips it —
so without the gate nobody could ever hear the intro. The gate press
unlocks audio and starts the show; gestures after that skip as
before. Returning players go gate → key → Zig hello (also scored
now). Do not remove the gate without solving the autoplay catch-22
some other way.

Phase 4 done: Rush mode, wired to Play Rush. Game gained generic
options (foodCount, chainWindowMs, chainDecays, timeLimitMs) —
Classic uses the defaults and is verified byte-identical in behavior.
Rush = wrap walls (self-collision still kills), 2 foods (spawn never
overlaps snake or each other; only the eaten slot respawns), chain
×1→×5 within 2.5s that DECAYS to ×1 on lapse ('chain-reset' event;
Classic keeps its no-decay combo), 60s countdown ('timeout' event →
softer game over with timeUp gong, no death flash). game.foods is the
array; game.food stays as a slot-0 getter/setter for the AI + old
code. Final 10s: timer enlarges red (#timer-box.urgent), board edges
pulse red (renderer edgePulse option), per-second timeTick rises in
pitch. Bests per mode via existing best:{mode} keys; HUD best +
Play Again/Enter follow the current mode (main's `game` is now
re-created per run — debug hook exposes it via a live getter).
Verified: wrap at all 4 edges, chain cap/decay windows, dual-food
invariants over 200 eats, timeout end state, per-mode best isolation,
full menu→rush→timeout→replay→classic flow, Classic regression.

remove \_\_snakeDebug before final deploy"

Next: Phase 5 — Customise (6 themes + 4 skins, live preview,
persisted via storage.js)
