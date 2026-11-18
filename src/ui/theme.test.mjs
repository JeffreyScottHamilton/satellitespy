import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTheme,
  initTheme,
  setTheme,
  subscribeTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
} from './theme.js';

function fakeStorage(initial = {}, { throws = false } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key) {
      if (throws) throw new Error('storage unavailable');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (throws) throw new Error('storage unavailable');
      data.set(key, String(value));
    },
  };
}

function fakeRoot() {
  const dataset = {};
  return { dataset };
}

function fakeDocument(meta) {
  return {
    querySelector(selector) {
      return selector === 'meta[name="theme-color"]' ? meta : null;
    },
  };
}

function fakeMeta() {
  const attrs = {};
  return {
    attrs,
    setAttribute(name, value) {
      attrs[name] = value;
    },
  };
}

function matchMediaPrefers(light) {
  return (query) => ({
    matches: query === '(prefers-color-scheme: light)' ? light : false,
    media: query,
  });
}

test('defaults to dark when nothing is stored and no light preference', () => {
  const root = fakeRoot();
  const theme = initTheme({
    storage: fakeStorage(),
    matchMedia: matchMediaPrefers(false),
    root,
  });
  assert.equal(theme, 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(getTheme(), 'dark');
});

test('dark when matchMedia is unavailable (unknown preference)', () => {
  const root = fakeRoot();
  assert.equal(initTheme({ storage: fakeStorage(), matchMedia: undefined, root }), 'dark');
});

test('follows a light preference when nothing is stored', () => {
  const root = fakeRoot();
  const theme = initTheme({
    storage: fakeStorage(),
    matchMedia: matchMediaPrefers(true),
    root,
  });
  assert.equal(theme, 'light');
  assert.equal(root.dataset.theme, 'light');
});

test('a stored choice wins over the system preference', () => {
  const root = fakeRoot();
  const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dark' });
  assert.equal(
    initTheme({ storage, matchMedia: matchMediaPrefers(true), root }),
    'dark',
  );
  assert.equal(root.dataset.theme, 'dark');
});

test('an invalid stored value is ignored', () => {
  const root = fakeRoot();
  const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'neon' });
  assert.equal(
    initTheme({ storage, matchMedia: matchMediaPrefers(true), root }),
    'light',
  );
});

test('tolerates storage that throws on read and write', () => {
  const root = fakeRoot();
  const storage = fakeStorage({}, { throws: true });
  assert.equal(
    initTheme({ storage, matchMedia: matchMediaPrefers(false), root }),
    'dark',
  );
  assert.doesNotThrow(() => setTheme('light'));
  assert.equal(root.dataset.theme, 'light');
  assert.equal(toggleTheme(), 'dark');
});

test('setTheme persists the choice and applies it to the root', () => {
  const root = fakeRoot();
  const storage = fakeStorage();
  initTheme({ storage, matchMedia: matchMediaPrefers(false), root });
  assert.equal(setTheme('light'), 'light');
  assert.equal(storage.data.get(THEME_STORAGE_KEY), 'light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(getTheme(), 'light');
});

test('setTheme rejects unknown themes without changing state', () => {
  const root = fakeRoot();
  initTheme({ storage: fakeStorage(), matchMedia: matchMediaPrefers(false), root });
  assert.throws(() => setTheme('neon'), TypeError);
  assert.equal(getTheme(), 'dark');
  assert.equal(root.dataset.theme, 'dark');
});

test('toggleTheme flips between light and dark and returns the new theme', () => {
  const root = fakeRoot();
  const storage = fakeStorage();
  initTheme({ storage, matchMedia: matchMediaPrefers(false), root });
  assert.equal(toggleTheme(), 'light');
  assert.equal(storage.data.get(THEME_STORAGE_KEY), 'light');
  assert.equal(toggleTheme(), 'dark');
  assert.equal(storage.data.get(THEME_STORAGE_KEY), 'dark');
});

test('subscribeTheme is called on change only and unsubscribes cleanly', () => {
  const root = fakeRoot();
  initTheme({ storage: fakeStorage(), matchMedia: matchMediaPrefers(false), root });
  const seen = [];
  const unsubscribe = subscribeTheme((theme) => seen.push(theme));
  setTheme('dark');
  assert.deepEqual(seen, []);
  setTheme('light');
  toggleTheme();
  assert.deepEqual(seen, ['light', 'dark']);
  unsubscribe();
  setTheme('light');
  assert.deepEqual(seen, ['light', 'dark']);
});

test('updates theme-color meta to the --bg value for the theme', () => {
  const root = fakeRoot();
  const meta = fakeMeta();
  const document = fakeDocument(meta);
  initTheme({
    storage: fakeStorage(),
    matchMedia: matchMediaPrefers(true),
    root,
    document,
  });
  assert.equal(meta.attrs.content, '#F7F7F5');
  setTheme('dark');
  assert.equal(meta.attrs.content, '#141414');
});

test('no meta element present is not an error', () => {
  const root = fakeRoot();
  assert.doesNotThrow(() =>
    initTheme({
      storage: fakeStorage(),
      matchMedia: matchMediaPrefers(false),
      root,
      document: fakeDocument(null),
    }),
  );
});
