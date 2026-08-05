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
  dependencies — none at all, including the leaderboard (see below).
- Structure: index.html, css/style.css, js/main.js, js/game.js,
  js/render.js, js/audio.js, js/themes.js, js/ui.js, js/storage.js,
  js/leaderboard.js, api/scores.mjs
- All sounds synthesized with WebAudio — no audio files.
- Mobile-first: touch/swipe must work as well as keyboard and mouse.
- Respect prefers-reduced-motion (skip heavy animation, jump to menu).
- Secrets never reach the browser: the leaderboard's KV credentials
  live only in the serverless function. Locally they come from
  .env.development.local (gitignored, written by `vercel env pull`).

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
6. Leaderboard: Vercel KV (was Supabase — changed 2026-08-05; KV needs
   no client library, so the no-dependencies rule holds). Top-10 only
   per mode. Players are listed by their full name, 2 to 12 characters
   (letters, numbers and spaces), confirmed on a retro screen prefilled
   with the name Zig asked for when a score makes the cut. All-time and
   This Week tabs. Small profanity blocklist checked against the whole
   lowercased name. Reject impossible scores (points-per-second sanity
   check) with a "nice try 👀" toast.
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

Phase 6 done: leaderboard, on Vercel KV rather than Supabase. KV's
REST API is plain fetch, so the project still has zero npm
dependencies — that swap is why the tech rules above changed.

api/scores.mjs is the whole backend: GET /api/scores?mode&period and
POST. Storage is two Redis sorted sets per mode — scores:{mode}:all
and scores:{mode}:{year}-w{week} — where the member is
{i:initials,t:timestamp} and the score is the sort key. The timestamp
is what keeps two identical submissions from collapsing into one
member. After every write, ZREMRANGEBYRANK key 0 -11 trims to exactly
the top ten (rank 0 is the LOWEST score, so this drops from the
bottom); EXPIRE refreshes the weekly key's 60-day TTL on each write so
a live week can't vanish. It's .mjs because without a package.json
declaring "type": "module" that extension is what makes the Node
runtime treat it as an ES module.

TRAP: `vercel dev` does NOT load .env.development.local for a project
like this. That filename is a convention frameworks (Next.js) read
themselves; a static site plus one function has nothing that does, so
the function saw no credentials at all. api/scores.mjs parses the file
itself, but only when the platform hasn't already set the vars — the
branch never runs on Vercel. It caches after the first attempt, so
changing credentials means restarting `vercel dev`.

Validation lives entirely on the server and never touches KV when it
fails: 3 letters only, a small profanity blocklist, integer score, a
minimum run length, and MAX_POINTS_PER_SEC (120) as the
points-per-second sanity check — set generously so it rejects the
impossible, not the merely excellent. Errors return a flat message and
never echo the KV URL or token.

Client: js/leaderboard.js. Both calls resolve rather than throw, and
the return shape is what the UI branches on — fetchTopScores gives
{ok, scores} so "couldn't reach the board" and "board is empty" can
never render the same, and submitScore gives {ok, status, reason} so a
4xx (the server calling the score impossible -> "nice try 👀") is
distinguishable from a network failure (-> "score not sent"). Offline,
makesTopTen returns qualifies:false: there is no point interrupting
someone for initials with nowhere to send them.

UI: a leaderboard panel with All-time/This-Week tabs over
Classic/Rush sub-tabs, an arcade table with loading / "Be the first!"
/ offline states and a fixed-height body so the panel doesn't jump
between them. Initials from the network are escaped before they touch
innerHTML. At game over the score screen paints FIRST and the top-ten
check runs behind it, so a slow board never delays it; a runToken
discards a reply that lands after Play Again. The run's mode, score
and duration (game.clock, the unpaused run time the server's rate
check needs) are captured at game over, because `game` is replaced the
moment Play Again is pressed. Initials entry is three slots with a
cursor: arrows cycle and move, typing a letter jumps ahead (stopping
at the last slot rather than wrapping over what was just typed), every
slot is also a tap target, and the field is prefilled from the saved
player name (Roman -> ROM, short names padded with A).

Launch polish pass (2026-08-05), seven items:

1. Customise and Leaderboard now carry an always-visible back button
   (sticky, top-left, 44px minimum). They are fullscreen panels and a
   phone has no Esc key, so there was genuinely no way out of them on
   mobile.

2. The volume slider "did nothing" for two reasons, neither of them in
   the volume code, which was correct all along. First, the stage's
   touchmove handler called preventDefault BEFORE checking whether a
   game was in progress, so it swallowed every drag inside any overlay
   — the slider and the scrolling of the Customise panel alike — and
   .overlay had to re-enable touch-action, which it inherits from
   .stage. Second, see 3. There is now also a throttled blip while
   dragging, so the level is audible even with music off.

3. Music was mixed at peak ~0.017 after headroom: inaudible on laptop
   speakers, which is what made the slider look broken. Track volumes
   are up roughly 2.5x and the music bus has its own MUSIC_BALANCE
   (1.35). The ceiling is deliberate: the loudest music voice stays
   under the eat blip (0.25 x headroom) so music sits beneath the SFX
   rather than competing. A check enforces that relationship, counting
   the bass voice as well as the lead.

4. The Rush countdown was showing in Classic: .hud-item sets
   display:flex, which outranks the browser's [hidden] rule, so
   ui.setTimerVisible(false) had no effect. Fixed with an explicit
   #timer-box[hidden] { display: none }. The same trap already had a
   comment on .intro-loading[hidden] — worth checking any new
   .hud-item that needs hiding.

5. Favicon: Zig's head cropped out of assets/mascot.svg (viewBox
   '96 78 140 120') and inlined in index.html as a data URI, so it
   costs no request and adds no file. Every '#' in the colours must be
   percent-encoded or the data URI ends at the first one.

6. No em dashes in user-facing text. Title is now
   "Snake Arcade | Roman Akmal". Code comments still use them freely.

7. Leaderboard identity is the full name, not 3-letter initials. The
   arcade cycle screen is replaced by a confirm screen prefilled from
   the saved player name and editable (2-12 chars, letters/numbers/
   spaces, validated client-side before the round trip). Server
   validates the same rule after collapsing whitespace, and the
   profanity list is now matched as a substring of the lowercased name.
   The KV member field changed from {i} to {n}; parseBoard still reads
   {i} so rows written before the change don't vanish. The table's name
   column is minmax(0, 1fr) with ellipsis, so a 12-character name
   shrinks the gap instead of pushing the score off a 380px row.

Creator pass (2026-08-05): the About cabinet card, Zig's one-time
creator moment, and the footer star link. Every outbound URL lives in
ONE constant, main.js LINKS (portfolio, github, linkedin), so the
card, the bubble and the footer can't drift apart. linkedin is the
literal placeholder LINKEDIN-URL for Roman to fill before launch; the
GitHub link is now real (github.com/RomanAkmal/snake-arcade) and the
old YOUR-GITHUB placeholder is gone.

About is rebuilt as a cabinet card: small idling Zig, title, one-line
story, three arcade-styled link buttons (44px targets, new tab +
noopener), the name-change control and privacy line, and a spec plate
("Vanilla JS · Canvas · WebAudio · Vercel serverless · Redis"). The
mini Zig is a cloneNode of the mascot SVG with the zig-idle class —
the bob/nod/pupil animations are pure CSS so the clone idles with no
timers. DELIBERATE: the clone KEEPS its duplicate ids. Invalid HTML,
but the id-based CSS (#zig-tongue hidden at rest, #zig-head nod) has
to match both copies; stripping ids leaves the clone's tongue
permanently out. Nothing script-side uses getElementById on those ids
after load, so the duplication is safe.

Creator moment: once ever per device (storage latch 'creatorShown'),
after the 3rd completed game (counter 'gamesCompleted', incremented at
enterGameOver — quits from pause don't count). It fires ONLY on a
game-over dismissal that heads to the menu (leaveGameOver); Play Again
bypasses it by design, so if game 3 ends in a replay the moment waits
for the next trip to the menu — "never during play" outranks "exactly
on the 3rd". The latch is set BEFORE showing so no exit path re-fires
it. Presentation reuses the welcome machinery wholesale: whip + slide
entrance, typewriter with ticks, then two link buttons + a "keep
playing" dismiss in the bubble. Esc or tap-outside dismisses; keyboard
dismissal is Esc-ONLY because any-key would swallow Tab and the bubble
holds real links a keyboard user must be able to reach. TRAP fixed in
the same pass: zig-skip used to default the name to Chief for every
non-rename mode, which would have renamed the player when they clicked
"keep playing" — Chief is now set only in greet or an empty-prefill
rename.

Footer: a small star icon linking the repo, muted until hover.

remove \_\_snakeDebug before final deploy"

Next: Phase 7 — launch: README, fill LINKEDIN-URL, share card,
analytics (GoatCounter), deploy. Real KV credentials still need
`vercel env pull` (.env.development.local holds placeholders).
