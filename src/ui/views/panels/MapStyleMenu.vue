<script setup>
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { t } from '../../../i18n/index.js';
import { useDisplayStore } from '../../stores/display.js';

// The basemap stacks as a radio list. The chips come from the map source
// controls through the display store, as the command dock reads them; a
// choice calls the same select(id).
const emit = defineEmits(['close']);
const { mapSource, mapSourceControls } = storeToRefs(useDisplayStore());
const chips = computed(() => mapSource.value?.chips ?? []);

function choose(chip) {
  if (!chip.available) return;
  if (!chip.active) void mapSourceControls.value?.select(chip.id).catch(() => {});
  emit('close', { restoreFocus: true });
}

// Arrow keys move between the stacks, as in any radio group.
function onKeyDown(event) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const items = [...event.currentTarget.parentElement.querySelectorAll('[role="radio"]')];
  const at = items.indexOf(event.currentTarget);
  const step = event.key === 'ArrowDown' ? 1 : items.length - 1;
  event.preventDefault();
  items[(at + step) % items.length]?.focus();
}
</script>

<template>
  <div id="top-actions-map-menu" class="top-actions-popover top-actions-map-menu" role="dialog" :aria-label="t('Map style')">
    <div class="top-actions-heading">{{ t('Map style') }}</div>
    <div class="top-actions-list" role="radiogroup" :aria-label="t('Map stacks')">
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        role="radio"
        class="top-actions-option"
        :data-stack-id="chip.id"
        :aria-checked="String(chip.active)"
        :aria-disabled="String(!chip.available)"
        :data-autofocus="chip.active || undefined"
        :title="chip.title"
        @click="choose(chip)"
        @keydown="onKeyDown"
      >
        <span class="top-actions-check" aria-hidden="true">
          <svg v-if="chip.active" viewBox="0 0 24 24" focusable="false"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <span class="top-actions-option-text">
          <span class="top-actions-option-name">{{ chip.label }}</span>
          <span v-if="!chip.available && chip.unavailableHint" class="top-actions-option-note">{{ chip.unavailableHint }}</span>
        </span>
      </button>
    </div>
    <p v-if="!chips.length" class="top-actions-note">{{ t('Map stacks appear once the globe is ready.') }}</p>
  </div>
</template>
