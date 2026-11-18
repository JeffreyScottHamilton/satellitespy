<script setup>
import { storeToRefs } from 'pinia';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { t } from '../../i18n/index.js';
import UiIcon from '../kit/UiIcon.vue';
import { useDisplayStore } from '../stores/display.js';
import {
  clearHudClass,
  initHudVisibility,
  setHudVisible,
  subscribeHudVisible,
} from '../hudVisibility.js';
import MapStyleMenu from './panels/MapStyleMenu.vue';
import SettingsMenu from './panels/SettingsMenu.vue';

// The top-right cluster: the map style button, and Settings.
// One popover is open at a time; Escape and a pointer press outside close it.
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]';

// The coordinate readout is shared with the H shortcut through hudVisibility.js.
const showHud = shallowRef(false);
const offHud = subscribeHudVisible((on) => {
  showHud.value = on;
});
function setShowHud(on) {
  setHudVisible(on);
}

// The basemap name on the map button is the active stack's chip label.
const { mapSource } = storeToRefs(useDisplayStore());
const basemap = computed(
  () => mapSource.value?.chips?.find((chip) => chip.active)?.label || t('Map'),
);

const menu = shallowRef(null);
const root = useTemplateRef('root');
const mapButton = useTemplateRef('mapButton');
const settingsButton = useTemplateRef('settingsButton');
const triggerFor = (name) => (name === 'map' ? mapButton.value : settingsButton.value);

function close({ restoreFocus = false } = {}) {
  const was = menu.value;
  if (!was) return;
  menu.value = null;
  if (restoreFocus) triggerFor(was)?.focus({ preventScroll: true });
}

function onTrigger(name) {
  if (menu.value === name) close({ restoreFocus: true });
  else menu.value = name;
}

// The first item takes focus on open: the marked one, else the first control.
watch(menu, async (name) => {
  if (!name) return;
  await nextTick();
  const popover = root.value?.querySelector('.top-actions-popover');
  const first =
    popover?.querySelector('[data-autofocus]') ?? popover?.querySelector(FOCUSABLE);
  first?.focus({ preventScroll: true });
});

function onDocumentKeyDown(event) {
  if (!menu.value || event.defaultPrevented || event.key !== 'Escape') return;
  // Handled here: EntityCard and the shortcuts must not also act on it.
  event.preventDefault();
  close({ restoreFocus: true });
}
function onDocumentPointerDown(event) {
  if (!menu.value || root.value?.contains(event.target)) return;
  close();
}
onMounted(() => {
  initHudVisibility();
  document.addEventListener('keydown', onDocumentKeyDown);
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
});
onBeforeUnmount(() => {
  offHud();
  clearHudClass();
  document.removeEventListener('keydown', onDocumentKeyDown);
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
});
</script>

<template>
  <div ref="root" class="top-actions" data-top-actions>
    <div class="top-actions-anchor">
      <button
        ref="mapButton"
        type="button"
        class="top-actions-button top-actions-map"
        data-top-action="map"
        aria-haspopup="dialog"
        :aria-expanded="String(menu === 'map')"
        :aria-controls="menu === 'map' ? 'top-actions-map-menu' : undefined"
        :aria-label="t('Map style: {name}', { name: basemap })"
        :title="t('Map style')"
        @click="onTrigger('map')"
      >
        <UiIcon name="layers" :size="18" />
        <span class="top-actions-map-name">{{ basemap }}</span>
      </button>
      <MapStyleMenu v-if="menu === 'map'" @close="close" />
    </div>
    <div class="top-actions-anchor">
      <button
        ref="settingsButton"
        type="button"
        class="top-actions-button top-actions-icon"
        data-top-action="settings"
        aria-haspopup="dialog"
        :aria-expanded="String(menu === 'settings')"
        :aria-controls="menu === 'settings' ? 'top-actions-settings' : undefined"
        :aria-label="t('Settings')"
        :title="t('Settings')"
        @click="onTrigger('settings')"
      >
        <UiIcon name="settings" :size="18" />
      </button>
      <SettingsMenu
        v-if="menu === 'settings'"
        :show-hud="showHud"
        @close="close"
        @readout="setShowHud"
      />
    </div>
  </div>
</template>
