// src/ui/views/topActionsView.test.mjs — the top-right actions: the map style
// button and Settings, over happy-dom.
import '../../testSupport/registerDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { initTheme } from '../theme.js';
import TopActionsView from './TopActionsView.vue';

function mount(t) {
  document.body.replaceChildren();
  initTheme({ root: document.documentElement, document });
  const host = document.body.appendChild(document.createElement('div'));
  const app = createApp(TopActionsView).use(createPinia());
  app.mount(host);
  t.after(() => app.unmount());
  return host;
}

const action = (host, name) => host.querySelector(`[data-top-action="${name}"]`);

test('the map and Settings buttons render with accessible names', (t) => {
  const host = mount(t);
  const buttons = [...host.querySelectorAll('[data-top-action]')];
  assert.deepEqual(
    buttons.map((button) => button.getAttribute('data-top-action')),
    ['map', 'settings'],
  );
  assert.match(action(host, 'map').getAttribute('aria-label'), /^Map style/);
  assert.equal(action(host, 'settings').getAttribute('aria-label'), 'Settings');
  assert.equal(action(host, 'theme'), null);
});

test('the app is dark and offers no theme choice', (t) => {
  const host = mount(t);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(host.querySelector('[data-theme-choice]'), null);
});

test('Escape that closes a menu is marked handled; unmount drops the HUD class', async (t) => {
  const host = mount(t);
  action(host, 'settings').click();
  await nextTick();
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  const { setHudVisible } = await import('../hudVisibility.js');
  setHudVisible(true, { setItem() {} });
  assert.ok(document.body.classList.contains('atlas-show-hud'));
});

test('the HUD class is removed on unmount', async () => {
  document.body.replaceChildren();
  const host = document.body.appendChild(document.createElement('div'));
  const app = createApp(TopActionsView).use(createPinia());
  app.mount(host);
  const { setHudVisible } = await import('../hudVisibility.js');
  setHudVisible(true, { setItem() {} });
  assert.ok(document.body.classList.contains('atlas-show-hud'));
  app.unmount();
  assert.equal(document.body.classList.contains('atlas-show-hud'), false);
});

test('one popover is open at a time, and Escape closes it', async (t) => {
  const host = mount(t);
  action(host, 'settings').click();
  await nextTick();
  assert.ok(host.querySelector('.top-actions-settings'));
  assert.equal(action(host, 'settings').getAttribute('aria-expanded'), 'true');

  action(host, 'map').click();
  await nextTick();
  assert.equal(host.querySelector('.top-actions-settings'), null);
  assert.ok(host.querySelector('.top-actions-map-menu'));

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await nextTick();
  assert.equal(host.querySelector('.top-actions-map-menu'), null);
  assert.equal(action(host, 'map').getAttribute('aria-expanded'), 'false');
});
