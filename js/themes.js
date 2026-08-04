// themes.js — the six palettes. Each one covers both halves of the
// game: the `bg`/`panel`/`text`/`muted`/`accent`/`danger`/`glow` keys
// become CSS custom properties (HUD, menu, overlays, Zig's bubble), and
// the rest are read straight off the object by the canvas renderer.
//
// Adding a theme means adding an entry here — nothing else, unless it
// wants an effect CSS can't express as a colour (see CRT, which hangs
// its scanlines off the [data-theme] attribute applyTheme sets).

export const THEMES = {
  midnight: {
    id: 'midnight',
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

  // Arcade cabinet: amber on aubergine, cyan pickups.
  retro: {
    id: 'retro',
    name: 'Retro',
    bg: '#160f1f',
    panel: '#241733',
    text: '#ffe9c7',
    muted: '#9c7ab8',
    accent: '#ffb703',
    danger: '#ff4d6d',
    board: '#241733',
    boardAlt: '#1e1330',
    snake: '#ffb703',
    snakeHead: '#ffe08a',
    snakeGlow: 'rgba(255, 183, 3, 0.55)',
    food: '#00e5ff',
    foodGlow: 'rgba(0, 229, 255, 0.6)',
  },

  // Dusk: plum sky, orange snake, hot-pink food to stay legible on it.
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    bg: '#2a1230',
    panel: '#3d1b3a',
    text: '#ffe8e0',
    muted: '#c08a97',
    accent: '#ff8a3d',
    danger: '#ff3b5c',
    board: '#3d1b3a',
    boardAlt: '#361832',
    snake: '#ff8a3d',
    snakeHead: '#ffd6a5',
    snakeGlow: 'rgba(255, 138, 61, 0.55)',
    food: '#ff4d9d',
    foodGlow: 'rgba(255, 77, 157, 0.6)',
  },

  // The one light theme: ink on paper. Glow is switched off entirely —
  // neon text-shadows on a cream background look like a printing fault.
  paper: {
    id: 'paper',
    name: 'Paper',
    bg: '#f4efe4',
    panel: '#fbf7ee',
    text: '#2b2a26',
    muted: '#8a8172',
    accent: '#2f6f4e',
    danger: '#b3261e',
    glow: 'transparent',
    board: '#fbf7ee',
    boardAlt: '#efe8da',
    snake: '#2f6f4e',
    snakeHead: '#4f9a72',
    snakeGlow: 'rgba(47, 111, 78, 0.22)', // ink bleed, not neon
    food: '#c2410c',
    foodGlow: 'rgba(194, 65, 12, 0.22)',
  },

  // True black for OLED panels: unlit pixels stay unlit, so the board
  // gets a hairline neon edge in CSS instead of a lighter fill.
  oled: {
    id: 'oled',
    name: 'OLED',
    bg: '#000000',
    panel: '#000000',
    text: '#f8fafc',
    muted: '#6b7280',
    accent: '#00ff9d',
    danger: '#ff2d55',
    board: '#000000',
    boardAlt: '#0a0a0a', // just enough to read as a grid
    snake: '#00ff9d',
    snakeHead: '#ccffe9',
    snakeGlow: 'rgba(0, 255, 157, 0.6)',
    food: '#ff2bd6',
    foodGlow: 'rgba(255, 43, 214, 0.65)',
  },

  // Green phosphor terminal. Scanlines, bloom and vignette come from
  // the [data-theme="crt"] block in style.css. `danger` stays warm on
  // purpose: a green alarm on a green screen reads as no alarm at all.
  crt: {
    id: 'crt',
    name: 'CRT',
    bg: '#020c04',
    panel: '#05200c',
    text: '#b8ffc4',
    muted: '#4b9a5e',
    accent: '#39ff6a',
    danger: '#ff5a3c',
    board: '#05200c',
    boardAlt: '#04190a',
    snake: '#39ff6a',
    snakeHead: '#c8ffd6',
    snakeGlow: 'rgba(57, 255, 106, 0.55)',
    food: '#eaff5a',
    foodGlow: 'rgba(234, 255, 90, 0.6)',
  },
};

export const THEME_IDS = Object.keys(THEMES);

export function getTheme(id) {
  return THEMES[id] ?? THEMES.midnight;
}

// Push the theme's chrome colors into CSS variables so HUD, overlays,
// menu and Zig's bubble always match the canvas. The data-theme
// attribute is what lets a theme add effects that aren't colours.
export function applyTheme(theme) {
  const root = document.documentElement.style;
  root.setProperty('--bg', theme.bg);
  root.setProperty('--panel', theme.panel);
  root.setProperty('--text', theme.text);
  root.setProperty('--muted', theme.muted);
  root.setProperty('--accent', theme.accent);
  root.setProperty('--danger', theme.danger);
  // Every neon text-shadow in the CSS uses --glow, so a theme can opt
  // out of glowing without touching its accent colour.
  root.setProperty('--glow', theme.glow ?? theme.accent);
  document.documentElement.dataset.theme = theme.id;
}
