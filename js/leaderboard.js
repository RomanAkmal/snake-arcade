// leaderboard.js — placeholder for the Leaderboard phase.
// Will use Supabase (client loaded via CDN, keys from js/config.js —
// see js/config.example.js) for top-10 scores per mode, all-time and
// weekly tabs, 3-letter initials, profanity blocklist and a
// points-per-second sanity check on submissions.

export async function fetchTopScores(/* mode, period */) {
  return [];
}

export async function submitScore(/* mode, initials, score */) {
  throw new Error('Leaderboard not implemented yet');
}
