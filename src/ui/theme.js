// The app is dark only. initTheme stamps that on the root element and the
// theme-color meta; there is no light theme to choose, store or detect.

export const THEME = 'dark';

// Mirrors --bg in foundation.css; used for <meta name="theme-color">.
const THEME_COLOR = '#141414';

/** Applies the dark theme to the root element and returns its name. */
export function initTheme({
  root = globalThis.document?.documentElement,
  document = globalThis.document,
} = {}) {
  if (root) {
    if (root.dataset) root.dataset.theme = THEME;
    else root.setAttribute?.('data-theme', THEME);
  }
  const doc = root?.ownerDocument ?? document;
  doc?.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR);
  return THEME;
}

export function getTheme() {
  return THEME;
}
