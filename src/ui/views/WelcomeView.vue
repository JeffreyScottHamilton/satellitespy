<script setup>
import { storeToRefs } from 'pinia';
import { msg, t } from '../../i18n/index.js';
import {
  FIRST_RUN_TIP,
  environmentalLabel,
} from '../../firstRunCopy.js';
import { useFirstRunStore } from '../stores/firstRun.js';

// The launcher initFirstRunExperience presents, and the controls it connects.
const { launcher, controls } = storeToRefs(useFirstRunStore());
// The card stays hidden until it is initialized; these show in the markup.
const DESCRIPTION = msg(
  'Pick a starting point. Every feed comes from a public source.',
);
const ENVIRONMENTAL_SUB = msg(
  'Live earthquakes and active fires, from USGS and NASA',
);

// A refused save puts the box back where the stored preference is.
function onSuppress(event) {
  const box = event.currentTarget;
  if (controls.value?.suppress(box.checked) === false) box.checked = !box.checked;
}
</script>

<template>
  <!-- Explicit mission choice on a fresh session. Live feeds are not auto-enabled
       until the visitor asks; shared links skip this surface entirely. It returns
       every session until "Don't show this again" is ticked — see
       src/firstRunExperience.js for the full show policy. -->
  <aside v-if="!launcher?.removed" id="first-run-launcher" role="dialog" aria-labelledby="first-run-title" aria-describedby="first-run-description" :class="{ visible: launcher?.visible }" :hidden="!launcher?.shown" :aria-hidden="launcher?.closing ? 'true' : undefined" :aria-busy="launcher?.busy ?? undefined" :data-state="launcher?.state ?? undefined">
    <div class="first-run-scanline" aria-hidden="true"></div>
    <header class="first-run-header">
    </header>
    <h2 id="first-run-title">{{ t('Choose your first view') }}</h2>
    <!-- One plain line on what the choices are; the sources are public. -->
    <p id="first-run-description">{{ launcher?.description ?? DESCRIPTION }}</p>
    <div class="first-run-choices ui-scroll" :data-scrollable="launcher?.scrollable ?? undefined">
      <button type="button" data-first-run-choice="contacts" :aria-disabled="launcher?.busy ?? undefined" @click="controls?.choose('contacts')">
        <span class="material-symbols-outlined" aria-hidden="true">radar</span>
        <span><strong>{{ t('Live contacts') }}</strong><small>{{ t('Aircraft, vessels and nearby intelligence') }}</small></span>
        <span class="material-symbols-outlined first-run-arrow" aria-hidden="true">arrow_forward</span>
      </button>
      <button type="button" data-first-run-choice="space-missions" :aria-disabled="launcher?.busy ?? undefined" @click="controls?.choose('space-missions')">
        <span class="material-symbols-outlined" aria-hidden="true">rocket_launch</span>
        <span><strong>{{ t('Space missions') }}</strong><small>{{ t('Launches, spacecraft and orbital context') }}</small></span>
        <span class="material-symbols-outlined first-run-arrow" aria-hidden="true">arrow_forward</span>
      </button>
      <button type="button" data-first-run-choice="environmental" :aria-disabled="launcher?.busy ?? undefined" @click="controls?.choose('environmental')">
        <span class="material-symbols-outlined" aria-hidden="true">local_fire_department</span>
        <!-- The title is ENVIRONMENTAL_LABEL_CHOICE's label once initialized. -->
        <!-- Subcopy names BOTH feeds this tile turns on, because the launcher
             optimizes for the fully configured experience (owner ruling,
             2026-08-23) — see the mission table in src/firstRunExperience.js. -->
        <span><strong data-first-run-environmental-title>{{ launcher?.environmentalTitle ?? environmentalLabel().title }}</strong><small>{{ launcher?.environmentalSub ?? ENVIRONMENTAL_SUB }}</small></span>
        <span class="material-symbols-outlined first-run-arrow" aria-hidden="true">arrow_forward</span>
      </button>
      <button type="button" class="first-run-explore" data-first-run-choice="explore" :aria-disabled="launcher?.busy ?? undefined" @click="controls?.choose('explore')">
        <span class="material-symbols-outlined" aria-hidden="true">public</span>
        <span><strong>{{ t('Explore manually') }}</strong><small>{{ t('Begin with a clean globe') }}</small></span>
        <span class="material-symbols-outlined first-run-arrow" aria-hidden="true">arrow_forward</span>
      </button>
    </div>
    <div class="first-run-footer">
      <label class="first-run-suppress">
        <input type="checkbox" data-first-run-suppress @change="onSuppress" />
        <span>{{ t('Don\'t show this again') }}</span>
      </label>
      <!-- A button, not just a hint: phones and tablets have no ESC key. It
           closes exactly as ESC does, for this session only. Touch screens
           see DISMISS; a keyboard keeps the ESC hint (first-run.css). -->
      <button type="button" class="first-run-dismiss" data-first-run-dismiss @click="controls?.dismiss()">
        <span class="first-run-dismiss-key">{{ t('ESC to dismiss') }}</span>
        <span class="first-run-dismiss-touch">{{ t('Dismiss') }}</span>
      </button>
    </div>
    <!-- Kept out of the footer row: it swaps to mission progress and errors, and
         a live region that also holds layout makes the row jump as it speaks. -->
    <p class="first-run-note" data-first-run-status role="status" aria-live="polite">{{ launcher?.status ?? FIRST_RUN_TIP }}</p>
  </aside>
</template>

<style scoped>
/* Minimal card on the atlas tokens. Geometry and visibility stay with the
   legacy launcher rules; these only replace the surfaces, type and glow. */
#first-run-launcher {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  font-family: var(--font-sans);
  text-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  padding: 16px;
}
#first-run-launcher * {
  text-shadow: none;
  text-transform: none;
  letter-spacing: 0;
}
#first-run-launcher .first-run-scanline,
#first-run-launcher .first-run-header {
  display: none;
}
#first-run-launcher h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 4px;
}
#first-run-launcher #first-run-description {
  font-size: 13px;
  color: var(--text-2);
  margin: 0 0 12px;
}
#first-run-launcher .first-run-choices {
  display: grid;
  gap: 8px;
}
#first-run-launcher .first-run-choices button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
#first-run-launcher .first-run-choices button:hover {
  border-color: var(--text-2);
}
#first-run-launcher .first-run-choices strong {
  display: block;
  font-size: 13px;
  font-weight: 600;
}
#first-run-launcher .first-run-choices small {
  display: block;
  font-size: 12px;
  color: var(--text-2);
}
#first-run-launcher .first-run-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-2);
}
#first-run-launcher .first-run-note {
  font-size: 12px;
  color: var(--text-2);
  margin: 8px 0 0;
}
#first-run-launcher button:focus-visible,
#first-run-launcher input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
