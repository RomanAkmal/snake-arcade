// api/scores.mjs — the leaderboard's only endpoint.
//
//   GET  /api/scores?mode=classic&period=all   -> { scores: [...] }
//   POST /api/scores  { mode, initials, score, durationMs }
//
// Storage is Vercel KV over its REST API — plain fetch, no SDK, so the
// project keeps its "no npm dependencies" rule. Credentials come from
// KV_REST_API_URL / KV_REST_API_TOKEN, which `vercel env pull` writes
// into .env.development.local (gitignored) and Vercel injects in prod.
//
// .mjs, not .js: without a package.json declaring `"type": "module"`,
// that extension is what tells the Node runtime this is an ES module.

const MODES = ['classic', 'rush'];
const PERIODS = ['all', 'week'];
const TOP_N = 10;

// Anything above this is not a human playing: a food is worth 10 x the
// combo (max x5), and even chaining one every half-second only reaches
// ~100/s. Deliberately generous — this rejects the impossible, not the
// merely excellent.
const MAX_POINTS_PER_SEC = 120;
const MIN_DURATION_MS = 3000; // no run that short can score anything real

// Names are 2-12 characters, so the blocklist is matched as a
// substring of the lowercased name rather than as an exact word. Not a
// moderation system — just enough that the top of the board stays
// presentable.
const NAME_MIN = 2;
const NAME_MAX = 12;
const BLOCKED = [
  'ass', 'fuk', 'fuc', 'fck', 'fuck', 'shit', 'cunt', 'cum', 'tits',
  'fag', 'nig', 'sex', 'poo', 'piss', 'dick', 'cock', 'vag', 'nazi',
  'kkk', 'rape', 'slut', 'whore',
];

// Weekly boards live under their own key and expire; ISO-ish week
// numbering is fine here since it only has to be stable, not calendrical.
const WEEK_TTL_SEC = 60 * 60 * 24 * 60; // 60 days

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-w${String(week).padStart(2, '0')}`;
}

const allKey = (mode) => `scores:${mode}:all`;
const thisWeekKey = (mode) => `scores:${mode}:${weekKey()}`;

// `vercel env pull` writes .env.development.local, but nothing here
// reads it: that file is a convention frameworks (Next.js and friends)
// load themselves, and this project is a bare static site plus one
// function, so `vercel dev` leaves it on disk untouched. Parse it once,
// only when the platform hasn't already supplied the credentials — on
// Vercel this branch never runs.
let localEnvLoaded = false;

async function loadLocalEnv() {
  if (localEnvLoaded || process.env.KV_REST_API_URL) return;
  localEnvLoaded = true;
  try {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(
      new URL('../.env.development.local', import.meta.url),
      'utf8'
    );
    for (const line of text.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (!match) continue; // comments and blanks
      const [, key, raw] = match;
      // strip the quotes vercel writes; never clobber a real env var
      if (!process.env[key]) process.env[key] = raw.replace(/^"([\s\S]*)"$/, '$1');
    }
  } catch {
    /* absent in production, or nothing pulled yet — kv() reports it */
  }
}

// One round trip for however many Redis commands we need.
async function kv(commands) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set');
  }
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    throw new Error(`KV responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const out = await res.json();
  const failed = out.find((r) => r && r.error);
  if (failed) throw new Error(`KV command failed: ${failed.error}`);
  return out.map((r) => r.result);
}

// ZRANGE ... REV WITHSCORES comes back as a flat [member, score, ...]
// list; the member carries the initials and timestamp, the score is
// the sort key, so the two halves have to be zipped back together.
function parseBoard(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    let entry;
    try {
      entry = JSON.parse(flat[i]);
    } catch {
      continue; // ignore anything hand-written into the set
    }
    out.push({
      // `n` is the full name; `i` is the old 3-letter field, still read
      // so rows written before the change don't vanish from the board
      name: entry.n ?? entry.i ?? '???',
      score: Number(flat[i + 1]),
      at: entry.t,
    });
  }
  return out;
}

async function readBoard(mode, period) {
  const key = period === 'week' ? thisWeekKey(mode) : allKey(mode);
  const [flat] = await kv([['ZRANGE', key, '0', String(TOP_N - 1), 'REV', 'WITHSCORES']]);
  return parseBoard(flat ?? []);
}

// Returns an error string, or null when the submission looks real.
function validate({ mode, name, score, durationMs }) {
  if (!MODES.includes(mode)) return 'unknown mode';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return `name must be ${NAME_MIN}-${NAME_MAX} characters`;
  }
  if (!/^[A-Za-z0-9 ]+$/.test(name)) return 'letters, numbers and spaces only';
  const lower = name.toLowerCase();
  if (BLOCKED.some((word) => lower.includes(word))) return 'name not allowed';
  if (!Number.isInteger(score) || score <= 0 || score > 1_000_000) {
    return 'bad score';
  }
  if (!Number.isFinite(durationMs) || durationMs < MIN_DURATION_MS) {
    return 'run too short';
  }
  if (score / (durationMs / 1000) > MAX_POINTS_PER_SEC) return 'impossible score';
  return null;
}

async function submit({ mode, name, score }) {
  // The member has to be unique or a repeat of the same name+score
  // would overwrite rather than sit alongside; the timestamp does that
  // and doubles as the "when" the client shows.
  const member = JSON.stringify({ n: name, t: Date.now() });
  const week = thisWeekKey(mode);

  await kv([
    ['ZADD', allKey(mode), String(score), member],
    // keep only the top 10: rank 0 is the lowest, so this drops
    // everything below the last ten
    ['ZREMRANGEBYRANK', allKey(mode), '0', String(-TOP_N - 1)],
    ['ZADD', week, String(score), member],
    ['ZREMRANGEBYRANK', week, '0', String(-TOP_N - 1)],
    // refresh the expiry on every write so a live week never vanishes
    ['EXPIRE', week, String(WEEK_TTL_SEC)],
  ]);

  const board = await readBoard(mode, 'all');
  const rank = board.findIndex((e) => e.name === name && e.score === score);
  return { board, rank: rank === -1 ? null : rank + 1 };
}

export default async function handler(req, res) {
  try {
    await loadLocalEnv(); // no-op on Vercel
    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
      const mode = searchParams.get('mode') ?? 'classic';
      const period = searchParams.get('period') ?? 'all';
      if (!MODES.includes(mode)) return res.status(400).json({ error: 'unknown mode' });
      if (!PERIODS.includes(period)) return res.status(400).json({ error: 'unknown period' });
      const scores = await readBoard(mode, period);
      // top-10 boards change rarely; a few seconds of edge cache keeps
      // a busy menu from hammering KV
      res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
      return res.status(200).json({ mode, period, scores });
    }

    if (req.method === 'POST') {
      // vercel dev parses JSON bodies for us; guard anyway
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
      const entry = {
        mode: body.mode,
        // collapse runs of spaces too, or " a          b " passes the
        // length check while rendering as something much wider
        name: String(body.name ?? '').replace(/\s+/g, ' ').trim(),
        score: Number(body.score),
        durationMs: Number(body.durationMs),
      };
      const problem = validate(entry);
      if (problem) return res.status(400).json({ error: problem });
      const { board, rank } = await submit(entry);
      return res.status(200).json({ ok: true, rank, scores: board });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    // Never leak the KV URL or token in an error body
    console.error('[scores]', err);
    return res.status(500).json({ error: 'leaderboard unavailable' });
  }
}
