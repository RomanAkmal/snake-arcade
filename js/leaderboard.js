// leaderboard.js — client half of the leaderboard. Talks to
// /api/scores (see api/scores.mjs), which owns the Vercel KV
// credentials; nothing secret is ever shipped to the browser.
//
// Both calls fail soft: a leaderboard that's down must never stop
// anyone playing, so callers get an empty board or a reason string
// instead of an exception.

const ENDPOINT = '/api/scores';
const TIMEOUT_MS = 6000;

export const NAME_MIN = 2;
export const NAME_MAX = 12;

// Same rules the server enforces. Checking here too means the player
// gets told immediately instead of after a round trip — the server
// still re-checks, because a client can't be trusted with either.
export function cleanName(raw) {
  return String(raw ?? '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, NAME_MAX);
}

export function isValidName(raw) {
  const name = cleanName(raw).trim();
  return name.length >= NAME_MIN && name.length <= NAME_MAX;
}

async function call(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// period: 'all' | 'week'. Always resolves — `ok: false` means we
// couldn't reach the board at all, which the UI shows differently from
// a board that's genuinely empty. Those two must never look the same.
export async function fetchTopScores(mode, period = 'all') {
  try {
    const { ok, data } = await call(
      `${ENDPOINT}?mode=${encodeURIComponent(mode)}&period=${encodeURIComponent(period)}`
    );
    if (!ok || !Array.isArray(data.scores)) return { ok: false, scores: [] };
    return { ok: true, scores: data.scores };
  } catch {
    // offline, or served from serve.py where /api doesn't exist at all
    return { ok: false, scores: [] };
  }
}

// { ok: true, rank, scores } on success. On failure `status` separates
// the two cases the UI has to tell apart: a 4xx is the server calling
// the score impossible ("nice try"), anything else is the network.
export async function submitScore({ mode, name, score, durationMs }) {
  try {
    const { ok, status, data } = await call(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        name: cleanName(name).trim(),
        score,
        durationMs,
      }),
    });
    if (!ok) return { ok: false, status, reason: data.error ?? 'rejected' };
    return { ok: true, rank: data.rank, scores: data.scores ?? [] };
  } catch {
    return { ok: false, status: 0, reason: 'offline' };
  }
}

// Does this score belong on the board? Asked before showing the
// initials screen, so a player is only interrupted when it matters.
// `ok: false` (offline) means don't interrupt at all — there'd be
// nowhere to send the initials.
export async function makesTopTen(mode, score) {
  const { ok, scores } = await fetchTopScores(mode, 'all');
  if (!ok) return { ok: false, qualifies: false };
  if (scores.length < 10) return { ok: true, qualifies: true };
  return { ok: true, qualifies: score > scores[scores.length - 1].score };
}

// Seed the confirm screen with the name Zig already asked for, so most
// players just press Enter. Falls back to something valid if the stored
// name is missing or too short to submit.
export function defaultName(saved) {
  const name = cleanName(saved).trim();
  return name.length >= NAME_MIN ? name : 'Player';
}
