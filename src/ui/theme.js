// Light/dark theme state. Pure apart from the injected storage, matchMedia,
// root and document, so it can run under node:test with fakes.

export const THEME_STORAGE_KEY = 'satellitespy.theme';
export const THEMES = Object.freeze(['light', 'dark']);

// Mirrors --bg in foundation.css; used for <meta name="theme-color">.
const THEME_COLORS = Object.freeze({ dark: '#141414', light: '#F7F7F5' });

const listeners = new Set();
let current = 'dark';
let deps = null;

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function defaultMatchMedia() {
  return globalThis.matchMedia;
}

function defaultRoot() {
  return globalThis.document?.documentElement;
}

function isTheme(value) {
  return THEMES.includes(value);
}

function readStored(storage) {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStored(storage, theme) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can throw (private mode, quota, disabled). The theme still applies.
  }
}

function prefersLight(matchMedia) {
  try {
    if (typeof matchMedia !== 'function') return false;
    return Boolean(matchMedia.call(globalThis, '(prefers-color-scheme: light)')?.matches);
  } catch {
    return false;
  }
}

function applyToDom(theme) {
  const root = deps?.root;
  if (root) {
    if (root.dataset) root.dataset.theme = theme;
    else root.setAttribute?.('data-theme', theme);
  }
  const doc = root?.ownerDocument ?? deps?.document;
  const meta = doc?.querySelector?.('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

function commit(theme, { persist }) {
  if (!isTheme(theme)) {
    throw new TypeError(`Unknown theme: ${String(theme)}`);
  }
  const changed = theme !== current;
  current = theme;
  applyToDom(theme);
  if (persist) writeStored(deps?.storage, theme);
  if (changed) {
    for (const listener of [...listeners]) listener(theme);
  }
  return theme;
}

/**
 * Resolves the theme (stored choice, else light preference, else dark),
 * applies it to the root element and the theme-color meta, and returns it.
 * Call before the application starts.
 */
export function initTheme({
  storage = defaultStorage(),
  matchMedia = defaultMatchMedia(),
  root = defaultRoot(),
  document = globalThis.document,
} = {}) {
  deps = { storage, matchMedia, root, document };
  const theme = readStored(storage) ?? (prefersLight(matchMedia) ? 'light' : 'dark');
  return commit(theme, { persist: false });
}

export function getTheme() {
  return current;
}

export function setTheme(theme) {
  return commit(theme, { persist: true });
}

export function toggleTheme() {
  return setTheme(current === 'dark' ? 'light' : 'dark');
}

/** Calls fn(theme) whenever the theme changes. Returns an unsubscribe function. */
export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
