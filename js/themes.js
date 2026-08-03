// themes.js — color palettes for the game and page chrome.
// v1 ships the default "midnight" theme; the remaining five (retro,
// sunset, paper, OLED, CRT) land with the Customise phase — each is
// just another entry in THEMES.

export const THEMES = {
  midnight: {
    name: 'Midnight',
    // page chrome (written into CSS custom properties)
    bg: '#0b1020',
    panel: '#131a33',
    text: '#e2e8f0',
    muted: '#64748b',
    accent: '#4ade80',
    danger: '#ef4444',
    // canvas
    board: '#131a33',
    boardAlt: '#111730',
    snake: '#4ade80',
    snakeHead: '#a7f3d0',
    snakeGlow: 'rgba(74, 222, 128, 0.55)',
    food: '#f472b6',
    foodGlow: 'rgba(244, 114, 182, 0.6)',
  },
};

export function getTheme(id) {
  return THEMES[id] ?? THEMES.midnight;
}

// Push the theme's chrome colors into CSS variables so HUD, overlays
// and background always match the canvas palette.
export function applyTheme(theme) {
  const root = document.documentElement.style;
  root.setProperty('--bg', theme.bg);
  root.setProperty('--panel', theme.panel);
  root.setProperty('--text', theme.text);
  root.setProperty('--muted', theme.muted);
  root.setProperty('--accent', theme.accent);
  root.setProperty('--danger', theme.danger);
}
