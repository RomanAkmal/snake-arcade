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

Phase 5a done: all six themes. themes.js holds midnight, retro,
sunset, paper, OLED and CRT (only midnight existed before — retro/
sunset/paper had never been written, despite the spec listing them).
applyTheme writes the chrome vars, plus --glow and a data-theme
attribute on `<html>`. --glow is the colour of every neon text-shadow,
so paper sets it to transparent and opts out of glowing without
touching its accent. Anything a palette can't express hangs off
[data-theme] in style.css: OLED gets a hairline accent edge on the
canvas (pure-black board on a pure-black page has no visible
boundary), CRT gets scanlines + flicker + vignette + phosphor bloom.
TRAP: the CRT bloom filter is on #game-canvas, NOT .app — a filter
makes an element the containing block for position:fixed children,
and .app holds the fullscreen gate and intro overlays, which would
suddenly be clipped to the board. The scanline layers are fixed body
pseudo-elements so they escape body's grid instead of becoming grid
items. CRT's `danger` stays warm red on purpose: a green alarm on a
green screen reads as no alarm.

Phase 5b done: all four snake skins, in render.js (a render-layer
option, independent of theme — every skin paints with the active
theme's snake colours, so all 4 work with all 6). solid = the
original rounded segments; gradient = head colour blending into body
then toward the board at the tail; neon = tapering, fading links
between segment centres; pixel = hard fillRect blocks, no rounding,
no glow, snapped to whole pixels, with square eyes. All four draw
from one snakePoints() helper, so they share the interpolation and
the wrap-snap. TRAP: neon joins consecutive segments, so it skips any
link longer than 1.5 cells — without that, every wrap draws a bright
stripe across the board, which the idle menu snake (wrap:true) would
trigger constantly. One Renderer draws both the game snake and the
idle menu snake, so setTheme/setSkin cover both at once.

Theme + skin persist via storage.js (theme / skin keys) and apply
live, mid-game included — the renderer reads this.theme every frame
and caches nothing. There is NO Customise UI yet: main.setTheme(id)
and main.setSkin(id) are currently reachable only through
__snakeDebug, so the Customise screen must call them (and removing
the debug hook before deploy must not orphan them).

Zig is transparent now: the background rect is gone from
assets/mascot.svg, because drop-shadow follows the alpha silhouette
and would otherwise render a rectangle. ui.js still strips a rect,
but only a FIRST-CHILD one (editors re-add a full-bleed background on
export; a later rect could be real artwork). The three neck strokes
must stay the first three elements — ui.js groups children.slice(3)
into #zig-head. Paper alone gives him a contact + ambient drop-shadow
so he reads on cream; his own colours are never themed — he's a
character, not chrome.

Serve/loading fixes: serve.py was rewritten. The "it loads forever"
bug was the stdlib's single-threaded HTTPServer — Chrome opens
speculative connections it never sends a request on, the server
accepts one and blocks reading a request line that never comes, and
the whole site stalls. Now ThreadingHTTPServer + HTTP/1.1 keep-alive,
no-store headers (stale style.css was costing debugging sessions),
dual-stack bind so `localhost` resolving to ::1 doesn't wait out a
failure, port fallback 8000-8009, errors-only logging (every console
write can stall the server if the Windows terminal is in QuickEdit
selection mode), SO_REUSEADDR off on Windows (there it lets a second
server bind a port that's already in use — two servers, half the
requests going to the stale one), and ASCII-only output because the
console is cp1252 and an arrow character crashed it on startup. The
mascot fetch now starts at boot with a 5s timeout instead of blocking
the welcome screen.

Intro no longer skips for returning players — everyone gets the full
show on every load (it's what people are shown first). A saved name
only decides what Zig says afterwards: 'greet' asks for one,
'return' welcomes them back. The returning greeting carries a
"not you?" button (the name is per browser, not per person) that
opens the name form empty; About gained "Replay intro" and now says
the name is saved in this browser only.

Phase 5c done: music. Three synthesized loops in audio.js (Chill —
slow triangle pentatonic; Arcade — 115ms square-wave chiptune, Am-C-
Dm-C; Focus — 520ms sine pulse at 110Hz with rests in the pattern)
plus Off. Each track is DATA: a step sequence of semitone offsets
from a root, with a voice, tempo and bass rule — one shared
look-ahead scheduler plays whichever is selected, so a fourth track
is a new entry in MUSIC and nothing else. The scheduler is a 25ms
setInterval with a 120ms lookahead, NOT the rAF loop: rAF is
throttled hard in background tabs and the beat would stall. It obeys
the same rule as ready() — while the context is suspended it
schedules NOTHING and rebases its clock, because a backlog would
dump out as a burst. Music starts at enterMenu(), not at the gate:
the intro and Zig's welcome are scored beat by beat and a loop
underneath muddies them (still after the gate's gesture, so the
autoplay guarantee holds). Rush multiplies the step rate by
RUSH_MUSIC_RATE (1.3) for the final 10s and resets it on
startGame/enterMenu. Music also stops while the tab is hidden and
resumes on return — only if we were the ones who stopped it, or a
player still on the gate would get music early.

Audio buses: master -> {musicGain, sfxGain}. Volume (0-100, default
70, scaled by MASTER_HEADROOM 0.4) rides on master so it governs
both; the SFX toggle mutes sfxGain only, so music keeps playing.
Both are ramped with setTargetAtTime rather than assigned — a slider
sets gain dozens of times a second and abrupt changes click. note()
defaults to the SFX bus; the music scheduler passes musicGain
explicitly.

Phase 5d done: the Customise screen, reached from the menu. Sections:
6 theme swatches (each painted in its own board/snake/food colours),
4 skins, Music (Chill/Arcade/Focus/Off), SFX on/off, volume slider.
Everything applies instantly, persists, and re-marks its selection
IN PLACE via ui.setOptionSelection — rebuilding the panel would
restart the preview and drop the slider mid-drag. Back button and
Esc both call closePanel(). The track selector and volume slider
MOVED here out of About; About is back to blurb, name-change, links
(and Replay intro).

The preview snake is a real Game plus a real Renderer, just small —
so it cannot drift from what the game actually looks like. That
needed a `grid` option on both (default GRID, so Classic is
untouched): a 21x21 board shrunk to 200px gives ~9px cells, far too
small to judge a skin by, while 9x9 gives ~22px. GRID is no longer
read inside Game or Renderer — they use this.grid — and
chooseAiDirection takes it from game.grid. The preview runs the same
autopilot with wrap + maxLength 6, verified alive for 1500 ticks. It
is created when the screen opens and destroyed when it closes;
Renderer.destroy() disconnects the ResizeObserver, which would
otherwise pin a detached canvas once per visit.

Menu panels are now one `panel` variable (null | 'about' |
'customise') instead of the old aboutOpen boolean; an open panel owns
the keyboard, since the volume slider needs arrow keys.

Sound previews on change: theme plays letterPop pitched by the
theme's index (each sounds different), skin plays pop, track plays
click and then the track itself, SFX-on plays click (turning them
off is its own preview), volume plays click on release.

Layout: .overlay--customise is fullscreen (fixed, z 65) like the gate
and intro, not inside the square stage — at 380px the stage is only
~360px tall, which can't hold a preview plus five rows. The panel
caps at max-height 100% of its grid area BEFORE scrolling, because a
centred grid item taller than its area has its top clipped with no
way to scroll back. Skin and Music segments wrap to two rows at
narrow widths rather than squeezing their labels.

remove \_\_snakeDebug before final deploy"

Next: Phase 6 — leaderboard (Supabase). Then Phase 7 — launch:
README, GitHub link, share card, analytics, deploy.
