import assert from 'node:assert/strict';
import test from 'node:test';
import { getTheme, initTheme } from './theme.js';

function fakeRoot() {
  const attrs = new Map();
  const meta = {
    setAttribute: (name, value) => attrs.set(name, value),
  };
  return {
    attrs,
    dataset: {},
    ownerDocument: { querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null) },
  };
}

test('the app is dark only: init applies dark to the root and theme-color', () => {
  const root = fakeRoot();
  assert.equal(initTheme({ root }), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.attrs.get('content'), '#141414');
  assert.equal(getTheme(), 'dark');
});

test('a stored light choice or light preference is ignored', () => {
  const root = fakeRoot();
  const storage = { getItem: () => 'light', setItem() {} };
  const matchMedia = () => ({ matches: true });
  assert.equal(initTheme({ root, storage, matchMedia }), 'dark');
  assert.equal(root.dataset.theme, 'dark');
});

test('there is no setter or toggle', async () => {
  const mod = await import('./theme.js');
  assert.equal(mod.setTheme, undefined);
  assert.equal(mod.toggleTheme, undefined);
});
