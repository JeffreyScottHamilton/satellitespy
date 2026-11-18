/**
 * @module app/startupDeadline
 * @description Bounds on startup: a wait that stops blocking boot after a
 * deadline, and the failsafe that hides the loading screen if boot has not.
 */

/** The photoreal load may hold the scene phase this long. */
export const PHOTOREAL_DEADLINE_MS = 10_000;
/** The loading screen is hidden this long after start, finished or not. */
export const LOADER_FAILSAFE_MS = 25_000;

/**
 * Resolve `{ value }` when `pending` settles, or `{ timedOut: true }` once
 * `ms` pass. A settlement after the deadline goes to `onLate` (value or
 * error) so its owner can release it.
 */
export function raceDeadline(pending, ms, onLate) {
  let timer;
  let expired = false;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve({ timedOut: true });
    }, ms);
  });
  const settled = Promise.resolve(pending).then(
    (value) => {
      if (expired) onLate?.({ value });
      return { value };
    },
    (error) => {
      if (expired) onLate?.({ error });
      throw error;
    },
  );
  return Promise.race([settled, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Hide the loading screen `ms` after this call unless disarmed. Warns with
 * the phase still pending, when `pendingPhase()` knows it. Returns a disarm.
 */
export function armLoaderFailsafe({
  loadingScreen,
  pendingPhase = () => null,
  ms = LOADER_FAILSAFE_MS,
}) {
  const timer = setTimeout(() => {
    if (loadingScreen.classList.contains('hidden')) return;
    console.warn(
      `[Init] Startup still pending after ${ms} ms (phase: ${
        pendingPhase() ?? 'unknown'
      }); hiding the loading screen.`,
    );
    loadingScreen.classList.add('hidden');
  }, ms);
  return () => clearTimeout(timer);
}
