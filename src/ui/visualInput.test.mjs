import assert from 'node:assert/strict';
import test from 'node:test';
// Generated parameter rows render through Vue: styleParameters.test.mjs.
import { bindApplicationShortcuts } from './visualInput.js';

class Element {
  constructor(tagName = 'DIV', ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
  }
  addEventListener(type, listener, capture) {
    assert.notEqual(
      capture,
      true,
      'these controls must not preempt capture-phase surfaces',
    );
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])])
      listener(event);
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  append(...children) {
    this.children.push(...children);
  }
  appendChild(child) {
    this.children.push(child);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  matches() {
    return ['INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName);
  }
}

function shortcuts() {
  const documentRef = new Element();
  const searchInput = new Element();
  const calls = [];
  const names = [
    'setStyle',
    'dismissSearch',
    'toggleHud',
    'toggleOrbit',
    'toggleCleanView',
    'toggleLayers',
    'cycleDetection',
    'toggleCctv',
  ];
  const actions = Object.fromEntries(
    names.map((name) => [name, (...args) => calls.push([name, ...args])]),
  );
  const controller = bindApplicationShortcuts({
    documentRef,
    searchInput,
    actions,
  });
  const press = (key, target = new Element(), rest = {}) =>
    documentRef.emit('keydown', { key, target, ...rest });
  return { documentRef, searchInput, calls, controller, press };
}

test('number keys retain the six style mappings', () => {
  const f = shortcuts();
  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', 'Space'])
    f.press(key);
  assert.deepEqual(
    f.calls,
    ['normal', 'retro', 'surveillance', 'thermal', 'anime', 'noir'].map(
      (style) => ['setStyle', style],
    ),
  );
});

test('letter shortcuts retain uppercase handling and existing actions', () => {
  const f = shortcuts();
  for (const key of ['H', 'o', 'V', 'f', 'D', 'c']) f.press(key);
  assert.deepEqual(
    f.calls,
    [
      'toggleHud',
      'toggleOrbit',
      'toggleCleanView',
      'toggleLayers',
      'cycleDetection',
      'toggleCctv',
    ].map((name) => [name]),
  );
});

for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) {
  test(`${tag} retains native editing, while Escape reaches search dismissal`, () => {
    const f = shortcuts();
    for (const key of ['1', 'h', 'o', 'v', 'f', 'd', 'c'])
      f.press(key, new Element(tag));
    assert.deepEqual(f.calls, []);
    f.press('Escape', new Element(tag));
    assert.deepEqual(f.calls, [['dismissSearch']]);
  });
}

test('the supplied search target retains editing even without form markup', () => {
  const f = shortcuts();
  f.press('1', f.searchInput);
  f.press('Escape', f.searchInput);
  assert.deepEqual(f.calls, [['dismissSearch']]);
});

test('a held key still repeats its shortcut, and Shift is not a chord', () => {
  const f = shortcuts();
  f.press('h', new Element(), { repeat: true });
  f.press('C', new Element(), { shiftKey: true });
  assert.deepEqual(f.calls, [['toggleHud'], ['toggleCctv']]);
});

test('browser and system chords on a shortcut key run no shortcut', () => {
  const f = shortcuts();
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey'])
    for (const key of ['1', '6', 'h', 'o', 'v', 'f', 'd', 'c', 'C'])
      f.press(key, new Element(), { [modifier]: true });
  // Copying (Cmd+C, Ctrl+C) used to turn CCTV on and open the nearest camera.
  assert.deepEqual(f.calls, []);
  f.press('c');
  f.press('Escape', new Element(), { ctrlKey: true });
  assert.deepEqual(f.calls, [['toggleCctv'], ['dismissSearch']]);
});

test('destroy synchronously removes shortcuts and a replacement binds once', () => {
  const f = shortcuts();
  f.controller.destroy();
  f.controller.destroy();
  f.press('h');
  assert.deepEqual(f.calls, []);
  assert.equal(f.documentRef.listeners.get('keydown').size, 0);
  const replacement = bindApplicationShortcuts({
    documentRef: f.documentRef,
    searchInput: f.searchInput,
    actions: { toggleHud: () => f.calls.push('new') },
  });
  f.press('h');
  assert.deepEqual(f.calls, ['new']);
  replacement.destroy();
});

test('slash focuses the location search from anywhere outside editable fields', () => {
  const f = shortcuts();
  let focused = 0;
  f.searchInput.focus = () => focused++;
  const prevented = [];
  f.press('/', new Element(), { preventDefault: () => prevented.push(true) });
  assert.equal(focused, 1);
  assert.equal(prevented.length, 1, 'the slash must not be typed into the field');
  assert.deepEqual(f.calls, []);
});

test('slash stays native while typing in another field or with a chord', () => {
  const f = shortcuts();
  let focused = 0;
  f.searchInput.focus = () => focused++;
  f.press('/', new Element('INPUT'));
  f.press('/', new Element(), { ctrlKey: true });
  assert.equal(focused, 0);
});

test('slash ignores contenteditable focus and already-handled events', () => {
  const f = shortcuts();
  let focused = 0;
  f.searchInput.focus = () => focused++;
  const editable = new Element();
  editable.isContentEditable = true;
  f.press('/', editable);
  f.press('/', new Element(), { defaultPrevented: true });
  assert.equal(focused, 0);
});

test('Escape does not blur the search when already handled', () => {
  const f = shortcuts();
  let blurred = 0;
  f.searchInput.blur = () => blurred++;
  f.press('Escape', f.searchInput, { defaultPrevented: true });
  assert.equal(blurred, 0);
});

test('Escape blurs the location search as well as dismissing it', () => {
  const f = shortcuts();
  let blurred = 0;
  f.searchInput.blur = () => blurred++;
  f.press('Escape', f.searchInput);
  assert.equal(blurred, 1);
  assert.deepEqual(f.calls, [['dismissSearch']]);
});
