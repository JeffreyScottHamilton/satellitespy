// The coordinate HUD's visibility: one stored flag and one body class
// (`atlas-show-hud`, which atlas/topbar.css reads). The H shortcut and the
// Settings checkbox both go through here, and subscribers hear every change.

export const SHOW_HUD_KEY = 'satellitespy.showHud';
export const SHOW_HUD_CLASS = 'atlas-show-hud';

const listeners = new Set();

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function applyClass(on) {
  globalThis.document?.body?.classList?.toggle(SHOW_HUD_CLASS, on);
}

export function readShowHud(storage = defaultStorage()) {
  try {
    return storage?.getItem(SHOW_HUD_KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether the HUD shows right now: what the body class says. */
export function isHudShown() {
  return Boolean(
    globalThis.document?.body?.classList?.contains(SHOW_HUD_CLASS),
  );
}

/** Applies the stored flag to the body without writing it back. */
export function initHudVisibility(storage = defaultStorage()) {
  const on = readShowHud(storage);
  applyClass(on);
  for (const listener of [...listeners]) listener(on);
  return on;
}

export function setHudVisible(on, storage = defaultStorage()) {
  const next = Boolean(on);
  try {
    storage?.setItem(SHOW_HUD_KEY, next ? '1' : '0');
  } catch {
    // Storage can be off; the HUD still shows for this session.
  }
  applyClass(next);
  for (const listener of [...listeners]) listener(next);
  return next;
}

export function toggleHudVisible(storage = defaultStorage()) {
  return setHudVisible(!isHudShown(), storage);
}

/** Removes the body class without touching the stored choice. */
export function clearHudClass() {
  applyClass(false);
}

/** Calls fn(on) on every change. Returns an unsubscribe function. */
export function subscribeHudVisible(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
