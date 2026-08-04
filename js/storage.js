// storage.js — thin wrapper around localStorage. Every access is
// try/catched because localStorage can throw (private browsing,
// storage disabled) and the game must still run without it.

const PREFIX = 'snake-arcade:';

export function getItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — play on without persistence */
  }
}

export function getBestScore(mode) {
  return Number(getItem(`best:${mode}`, 0)) || 0;
}

export function setBestScore(mode, score) {
  setItem(`best:${mode}`, score);
}

// Player name (asked for by Zig on first visit). null = never set,
// which is what makes a visit count as "first".
export function getPlayerName() {
  const name = getItem('playerName', null);
  return typeof name === 'string' && name.trim() ? name : null;
}

export function setPlayerName(name) {
  setItem('playerName', name);
}

// Chosen theme id. Unknown/missing ids fall back to midnight in
// getTheme(), so a renamed theme can never leave the game unstyled.
export function getThemeId() {
  return getItem('theme', 'midnight');
}

export function setThemeId(id) {
  setItem('theme', id);
}

// Chosen snake skin. Independent of the theme — any skin, any theme.
export function getSkinId() {
  return getItem('skin', 'solid');
}

export function setSkinId(id) {
  setItem('skin', id);
}
