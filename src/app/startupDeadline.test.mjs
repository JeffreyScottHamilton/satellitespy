import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armLoaderFailsafe,
  LOADER_FAILSAFE_MS,
  raceDeadline,
} from './startupDeadline.js';

const screen = () => {
  const classes = new Set();
  return {
    classList: {
      add: (c) => classes.add(c),
      contains: (c) => classes.has(c),
    },
  };
};

test('the loader failsafe hides the screen and names the pending phase', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const warn = t.mock.method(console, 'warn', () => {});
  const loadingScreen = screen();
  armLoaderFailsafe({ loadingScreen, pendingPhase: () => 'scene' });
  t.mock.timers.tick(LOADER_FAILSAFE_MS - 1);
  assert.equal(loadingScreen.classList.contains('hidden'), false);
  t.mock.timers.tick(1);
  assert.equal(loadingScreen.classList.contains('hidden'), true);
  assert.match(String(warn.mock.calls[0].arguments[0]), /phase: scene/);
});

test('a disarmed or already revealed failsafe stays quiet', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const warn = t.mock.method(console, 'warn', () => {});
  const shown = screen();
  armLoaderFailsafe({ loadingScreen: shown })();
  const revealed = screen();
  revealed.classList.add('hidden');
  armLoaderFailsafe({ loadingScreen: revealed });
  t.mock.timers.tick(LOADER_FAILSAFE_MS);
  assert.equal(shown.classList.contains('hidden'), false);
  assert.equal(warn.mock.calls.length, 0);
});

test('a load past its deadline times out and its late result is handed back', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  const late = [];
  const raced = raceDeadline(
    new Promise((resolve) => {
      finish = resolve;
    }),
    10_000,
    (result) => late.push(result),
  );
  t.mock.timers.tick(10_000);
  assert.deepEqual(await raced, { timedOut: true });
  finish('tiles');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(late, [{ value: 'tiles' }]);
});

test('a load inside its deadline returns its value', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.deepEqual(await raceDeadline(Promise.resolve(1), 10_000), {
    value: 1,
  });
});
