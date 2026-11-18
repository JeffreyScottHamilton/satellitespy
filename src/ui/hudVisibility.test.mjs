import '../testSupport/registerDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOW_HUD_KEY,
  initHudVisibility,
  isHudShown,
  readShowHud,
  setHudVisible,
  subscribeHudVisible,
  toggleHudVisible,
} from './hudVisibility.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('toggling writes the key, the body class, and notifies subscribers', () => {
  document.body.className = '';
  const storage = memoryStorage();
  const seen = [];
  const off = subscribeHudVisible((on) => seen.push(on));
  assert.equal(toggleHudVisible(storage), true);
  assert.equal(storage.getItem(SHOW_HUD_KEY), '1');
  assert.ok(document.body.classList.contains('atlas-show-hud'));
  assert.equal(toggleHudVisible(storage), false);
  assert.equal(isHudShown(), false);
  off();
  setHudVisible(true, storage);
  assert.deepEqual(seen, [true, false]);
});

test('init applies the stored flag, and a throwing storage reads as off', () => {
  document.body.className = '';
  assert.equal(initHudVisibility(memoryStorage({ [SHOW_HUD_KEY]: '1' })), true);
  assert.ok(isHudShown());
  const broken = {
    getItem() {
      throw new Error('off');
    },
    setItem() {
      throw new Error('off');
    },
  };
  assert.equal(readShowHud(broken), false);
  assert.equal(setHudVisible(true, broken), true);
  assert.ok(isHudShown());
});
