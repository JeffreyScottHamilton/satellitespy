<script setup>
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, shallowRef } from 'vue';
import { msg, t, tn } from '../../../i18n/index.js';
import { openFirstRunExperience } from '../../../firstRunExperience.js';
import { useCockpitStore } from '../../stores/cockpit.js';
import { useDisplayStore } from '../../stores/display.js';
import { useLocaleStore } from '../../stores/locale.js';
import { useProviderSettingsStore } from '../../stores/providerSettings.js';
import { useStoriesStore } from '../../stores/stories.js';
import { getTheme, setTheme, subscribeTheme } from '../../theme.js';
import LocalePicker from './LocalePicker.vue';

// Settings: appearance, the visual filter, display, data sources and keys,
// language, Stories and the guided start. Each control calls the owner the
// rest of the app uses; this only presents them.
const emit = defineEmits(['close', 'readout']);
const props = defineProps({
  showHud: { type: Boolean, default: false },
});

const theme = shallowRef(getTheme());
const offTheme = subscribeTheme((next) => {
  theme.value = next;
});
onBeforeUnmount(offTheme);
const THEMES = [
  { id: 'light', label: msg('Light') },
  { id: 'dark', label: msg('Dark') },
];

const PRESETS = [
  { id: 'normal', label: msg('Standard') },
  { id: 'retro', label: msg('Retro') },
  { id: 'surveillance', label: msg('Night vision') },
  { id: 'thermal', label: msg('Thermal') },
  { id: 'anime', label: msg('Illustrated') },
  { id: 'noir', label: msg('Monochrome') },
];
const display = useDisplayStore();
const { style } = storeToRefs(display);
const activePreset = computed(() => style.value?.name ?? null);
function choosePreset(id) {
  display.act('setStyle', id);
}

// Keys: the count is the rows the key setup owner publishes, reworded.
const { view: keySetup, controls: keyControls } = storeToRefs(useProviderSettingsStore());
const keysShown = computed(() => keySetup.value?.available !== false);
const missingKeys = computed(() => (keySetup.value?.rows ?? []).filter((row) => !row.set).length);
const keysLabel = computed(() =>
  missingKeys.value > 0
    ? tn(
        missingKeys.value,
        '{count} optional key not configured',
        '{count} optional keys not configured',
      )
    : t('All optional keys configured'),
);
function openKeys() {
  keyControls.value?.open();
  emit('close');
}

// Stories opens its explore screen through the controller the view connected.
const { controller: storiesController, available: storiesAvailable } = storeToRefs(
  useStoriesStore(),
);
const storiesOpenable = computed(
  () => storiesAvailable.value !== false && typeof storiesController.value?.open === 'function',
);
function openStories() {
  if (!storiesOpenable.value) return;
  storiesController.value.open();
  emit('close');
}

// Cockpit view: the readout's entry is answered by the Cockpit controller's
// delegated click, so this triggers that same action rather than a copy of it.
const { presence: cockpit } = storeToRefs(useCockpitStore());
const cockpitOpenable = computed(() => cockpit.value?.entryAvailable === true);
function openCockpit() {
  if (!cockpitOpenable.value) return;
  document.getElementById('cockpit-entry-readout')?.click();
  emit('close');
}

function showGuidedStart() {
  emit('close');
  void openFirstRunExperience();
}

// The language picker the shell publishes. Its own id keeps it apart from the
// corner picker on the page.
const { picker } = storeToRefs(useLocaleStore());
</script>

<template>
  <div id="top-actions-settings" class="top-actions-popover top-actions-settings" role="dialog" :aria-label="t('Settings')">
    <section class="top-actions-section" aria-labelledby="top-actions-appearance">
      <h2 id="top-actions-appearance" class="top-actions-heading">{{ t('Appearance') }}</h2>
      <div class="top-actions-row-label" id="top-actions-theme-label">{{ t('Theme') }}</div>
      <div class="top-actions-segmented" role="group" aria-labelledby="top-actions-theme-label">
        <button
          v-for="choice in THEMES"
          :key="choice.id"
          type="button"
          class="top-actions-segment"
          :data-theme-choice="choice.id"
          :aria-pressed="String(theme === choice.id)"
          @click="setTheme(choice.id)"
        >{{ t(choice.label) }}</button>
      </div>
    </section>

    <section class="top-actions-section" aria-labelledby="top-actions-filter">
      <h2 id="top-actions-filter" class="top-actions-heading">{{ t('Visual filter') }}</h2>
      <div class="top-actions-list" role="group" aria-labelledby="top-actions-filter">
        <button
          v-for="preset in PRESETS"
          :key="preset.id"
          type="button"
          class="top-actions-option"
          :data-style="preset.id"
          :aria-pressed="String(activePreset === preset.id)"
          @click="choosePreset(preset.id)"
        >
          <span class="top-actions-check" aria-hidden="true">
            <svg v-if="activePreset === preset.id" viewBox="0 0 24 24" focusable="false"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="top-actions-option-name">{{ t(preset.label) }}</span>
        </button>
      </div>
    </section>

    <section class="top-actions-section" aria-labelledby="top-actions-display">
      <h2 id="top-actions-display" class="top-actions-heading">{{ t('Display') }}</h2>
      <label class="top-actions-check-row">
        <input type="checkbox" data-show-hud :checked="props.showHud" @change="emit('readout', $event.target.checked)" />
        <span>{{ t('Show coordinate readout') }}</span>
      </label>
    </section>

    <section class="top-actions-section" aria-labelledby="top-actions-data">
      <h2 id="top-actions-data" class="top-actions-heading">{{ t('Data') }}</h2>
      <button v-if="keysShown" type="button" class="top-actions-action" data-key-setup-open aria-haspopup="dialog" aria-controls="key-setup" @click="openKeys">
        <span class="top-actions-action-name">{{ t('Data sources & API keys') }}</span>
        <span class="top-actions-action-note">{{ keysLabel }}</span>
      </button>
      <button type="button" class="top-actions-action" data-stories-open :disabled="!storiesOpenable" :aria-disabled="String(!storiesOpenable)" @click="openStories">
        <span class="top-actions-action-name">{{ t('Stories') }}</span>
        <span v-if="!storiesOpenable" class="top-actions-action-note">{{ t('Stories unavailable') }}</span>
      </button>
      <button type="button" class="top-actions-action" data-cockpit-open :disabled="!cockpitOpenable" :aria-disabled="String(!cockpitOpenable)" @click="openCockpit">
        <span class="top-actions-action-name">{{ t('Cockpit view') }}</span>
        <span v-if="!cockpitOpenable" class="top-actions-action-note">{{ t('Select a vehicle to enter') }}</span>
      </button>
    </section>

    <section v-if="picker" class="top-actions-section" aria-labelledby="top-actions-language">
      <h2 id="top-actions-language" class="top-actions-heading">{{ t('Language') }}</h2>
      <LocalePicker id-base="settings-locale-picker" :key="picker.current" :current="picker.current" :on-select="picker.onSelect" :focus="picker.focus" />
    </section>

    <section class="top-actions-section">
      <button type="button" class="top-actions-link" data-guided-start @click="showGuidedStart">{{ t('Show guided start') }}</button>
    </section>
  </div>
</template>
