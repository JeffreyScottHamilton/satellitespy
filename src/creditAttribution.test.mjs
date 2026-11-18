import { readStylesheet } from './testSupport/readStylesheet.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readStylesheet(path.join(ROOT, 'style.css'));

/*
 * Required-attribution keep-out pin.
 *
 * Google Maps Platform and Cesium both require the credit line to stay visible
 * whenever their content is on screen, so this pin FAILS CLOSED: any cascade
 * construct it cannot resolve exactly is an explicit failure naming the
 * construct, never a silent skip. An earlier version modelled `bottom` only and
 * ignored specificity, importance, shorthands and media nesting — four
 * independent behaviour-breaking mutations passed it.
 */

const REM_PX = 16;

// Rendered credit height the stylesheet cannot supply (10px font, one line).
// Used by the legacy rail clearance pin below; the new keep-out contract reads
// its sizes from the CSS itself (credit line-height, search height).
const CREDIT_HEIGHT_PX = 28;

// Clear air the notice must keep above it. The stylesheet aims for 12px.
const MIN_CLEARANCE_PX = 8;

// ── CSS model ───────────────────────────────────────────────────────────────

/** Mask bracket/paren contents so combinator splitting cannot land inside them. */
function maskGroups(selector) {
  let out = '';
  let depth = 0;
  for (const char of selector) {
    if (char === '(' || char === '[') depth += 1;
    out += depth > 0 && char === ' ' ? '_' : char;
    if (char === ')' || char === ']') depth -= 1;
  }
  return out;
}

/** Split on a delimiter that is not inside brackets or parentheses. */
function splitTopLevel(text, delimiter) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === delimiter && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

/** The final compound of a complex selector — the element the rule positions. */
function lastCompound(part) {
  const masked = maskGroups(part);
  let cut = -1;
  for (let i = 0; i < masked.length; i += 1) {
    if (' >+~'.includes(masked[i])) cut = i;
  }
  return part.slice(cut + 1);
}

function compareSpecificity(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** CSS specificity as [ids, classes, types]. `:where()` contributes nothing. */
function specificity(selector) {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let rest = selector;
  for (;;) {
    const match = rest.match(/:(not|is|has|where|matches)\(/);
    if (!match) break;
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < rest.length; i += 1) {
      if (rest[i] === '(') depth += 1;
      else if (rest[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    assert.ok(end > 0, `unbalanced functional pseudo-class in "${selector}"`);
    if (match[1] !== 'where') {
      let best = [0, 0, 0];
      for (const argument of splitTopLevel(rest.slice(open + 1, end), ',')) {
        const inner = specificity(argument.trim());
        if (compareSpecificity(inner, best) > 0) best = inner;
      }
      ids += best[0];
      classes += best[1];
      types += best[2];
    }
    rest = rest.slice(0, match.index) + rest.slice(end + 1);
  }
  ids += (rest.match(/#[\w-]+/g) || []).length;
  classes += (rest.match(/\.[\w-]+/g) || []).length;
  classes += (rest.match(/\[[^\]]*\]/g) || []).length;
  types += (rest.match(/::[\w-]+/g) || []).length;
  classes += (rest.replace(/::[\w-]+/g, '').match(/:[\w-]+/g) || []).length;
  types += (
    rest.replace(/\[[^\]]*\]/g, '').match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []
  ).length;
  return [ids, classes, types];
}

/** Flatten style.css into rules carrying their raw media stack. */
function flattenRules(source) {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const mediaStack = [];
  let index = 0;
  let prelude = '';
  while (index < src.length) {
    const char = src[index];
    if (char === '{') {
      const head = prelude.replace(/\s+/g, ' ').trim();
      prelude = '';
      if (head.startsWith('@media')) {
        mediaStack.push(head.slice('@media'.length).trim());
        index += 1;
        continue;
      }
      if (head.startsWith('@')) {
        let level = 1;
        index += 1;
        while (index < src.length && level > 0) {
          if (src[index] === '{') level += 1;
          else if (src[index] === '}') level -= 1;
          index += 1;
        }
        continue;
      }
      const close = src.indexOf('}', index);
      assert.ok(close > index, `unterminated rule block for "${head}"`);
      const decls = [];
      for (const raw of src.slice(index + 1, close).split(';')) {
        const text = raw.trim();
        if (!text) continue;
        const colon = text.indexOf(':');
        if (colon < 0) continue;
        const value = text.slice(colon + 1).trim();
        decls.push({
          prop: text.slice(0, colon).trim().toLowerCase(),
          value: value.replace(/\s*!important$/i, '').trim(),
          important: /!important\s*$/i.test(value),
        });
      }
      rules.push({
        order: rules.length,
        media: [...mediaStack],
        parts: splitTopLevel(head, ',')
          .map((part) =>
            part.trim().replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'),
          )
          .filter(Boolean),
        decls,
      });
      index = close + 1;
      continue;
    }
    if (char === '}') {
      mediaStack.pop();
      prelude = '';
      index += 1;
      continue;
    }
    prelude += char;
    index += 1;
  }
  return rules;
}

const RULES = flattenRules(css);

// ── What the model understands ──────────────────────────────────────────────

const DOCKED_RAIL = 'body.context-docked #right-context-rail';
// Custom properties allowed inside a modelled offset. Each is a pinned-tray
// stack height, proven non-negative below, so evaluating them at 0 is a
// conservative floor rather than a guess. The world timeline's lift raises
// the dock, its trays and the credit together, so it moves no gap either.
const VETTED_VARS = new Set([
  '--dock-pinned-stack-height',
  '--dock-lower-pinned-height',
  '--dock-location-pinned-height',
  '--dock-presets-pinned-height',
  '--world-timeline-lift',
]);
// Custom properties CSS sets to a fixed length besides their 0 default. The
// clearance checks run at each length CSS gives them, not only at 0.
const FIXED_LENGTH_VARS = new Set(['--world-timeline-lift']);
const LIFTS_PX = [0, 66, 80];
let liftPx = 0;
function eachLift(check) {
  for (const lift of LIFTS_PX) {
    liftPx = lift;
    try {
      check(lift);
    } finally {
      liftPx = 0;
    }
  }
}

/** A media condition the model can resolve, or null. */
function parseMediaCondition(condition) {
  const match = /^\(max-width:\s*(\d+)px\)$/.exec(condition.trim());
  return match ? Number(match[1]) : null;
}

/** `{min, max}` for width-only conditions the model can resolve, else null. */
function parseMediaRange(condition) {
  const terms = condition.trim().split(/\s+and\s+/);
  const range = { min: 0, max: Infinity };
  for (const term of terms) {
    const match = /^\((min|max)-width:\s*(\d+)px\)$/.exec(term.trim());
    if (!match) return null;
    range[match[1]] = Number(match[2]);
  }
  return range;
}

/**
 * Whether a rule applies at `width`. Only ever asked of rules that already
 * match a candidate selector, so an unresolvable condition there is a genuine
 * hole in the model and fails rather than being skipped.
 */
function appliesAt(rule, width, label) {
  return rule.media.every((condition) => {
    const range = parseMediaRange(condition);
    assert.ok(
      range !== null,
      `unmodelled media condition "${condition}" gates ${label}`,
    );
    return width >= range.min && width <= range.max;
  });
}

/** Resolve `prop` by real cascade order: importance, then specificity, then source. */
function resolve(candidates, prop, width, label, { optional = false } = {}) {
  let winner = null;
  for (const rule of RULES) {
    if (!rule.parts.some((part) => candidates.includes(part))) continue;
    if (!appliesAt(rule, width, label)) continue;
    for (const part of rule.parts) {
      if (!candidates.includes(part)) continue;
      for (const decl of rule.decls) {
        if (decl.prop !== prop) continue;
        const contender = {
          decl,
          part,
          order: rule.order,
          spec: specificity(part),
        };
        if (!winner) {
          winner = contender;
          continue;
        }
        const byImportance =
          Number(contender.decl.important) - Number(winner.decl.important);
        const bySpecificity = compareSpecificity(contender.spec, winner.spec);
        if (
          byImportance > 0 ||
          (byImportance === 0 && bySpecificity > 0) ||
          (byImportance === 0 &&
            bySpecificity === 0 &&
            contender.order > winner.order)
        ) {
          winner = contender;
        }
      }
    }
  }
  if (!winner && optional) return null;
  assert.ok(winner, `no "${prop}" resolves for ${label} at ${width}px`);
  return winner;
}

/** Evaluate a length. Anything the model cannot resolve exactly fails loudly. */
function toPx(value, viewportHeight, where) {
  const trimmed = value.trim();
  const inner = /^calc\(/.test(trimmed) ? trimmed.slice(5, -1) : trimmed;
  assert.doesNotMatch(
    inner,
    /\bcalc\(/,
    `nested calc() in ${where}: "${value}"`,
  );
  assert.doesNotMatch(
    inner,
    /\b(min|max|clamp|env|attr|round|mod)\(/,
    `unmodelled function in ${where}: "${value}"`,
  );
  assert.doesNotMatch(
    inner,
    /[*/]/,
    `unmodelled operator in ${where}: "${value}"`,
  );
  assert.doesNotMatch(
    inner,
    /\s-\s/,
    `unmodelled subtraction in ${where}: "${value}"`,
  );
  let total = 0;
  for (const raw of splitTopLevel(inner, '+')) {
    const term = raw.trim();
    if (!term) continue;
    if (term === '100%') continue; // the tray's own panel height, added separately
    if (term.startsWith('var(')) {
      const name = term.slice(4, term.lastIndexOf(')')).split(',')[0].trim();
      assert.ok(
        VETTED_VARS.has(name),
        `unvetted custom property ${name} in ${where}: "${value}"`,
      );
      if (name === '--world-timeline-lift') total += liftPx;
      continue; // proven non-negative; 0 is the conservative floor
    }
    assert.match(
      term,
      /^-?[\d.]+(px|rem|vh)$/,
      `unmodelled length term "${term}" in ${where}: "${value}"`,
    );
    const number = Number.parseFloat(term);
    if (term.endsWith('rem')) total += number * REM_PX;
    else if (term.endsWith('vh')) total += (number * viewportHeight) / 100;
    else total += number;
  }
  return total;
}

const WIDTHS = [
  1440, 1024, 980, 900, 830, 800, 760, 721, 720, 700, 640, 600, 480, 375,
];
const HEIGHTS = [500, 560, 640, 700, 800, 900, 1000, 1080, 1200, 1440, 1600];

const CREDIT_SELECTORS = [
  '#cesium-credits',
  'body:not(.ui-clean-view):not(.recording-mode) #cesium-credits',
];
const MINIMAL_HUD_CREDIT =
  "body:not(.ui-clean-view):not(.recording-mode):has(#intel-hud[data-variant='minimal'].active) #cesium-credits";
const TRAY_ORDINARY = [
  '#command-dock .dock-popover-content',
  '#command-dock #location-bar .dock-popover-content',
];
const TRAY_SCENARIOS = [
  { name: 'ordinary tray', offset: TRAY_ORDINARY },
  {
    name: 'one pinned tray',
    offset: [
      ...TRAY_ORDINARY,
      '#command-dock.dock-has-pinned-tray #location-bar:not(.collapsed):not(.dock-pinned) .dock-popover-content',
    ],
    stackVar: '--dock-pinned-stack-height',
  },
  {
    name: 'two pinned trays (upper)',
    offset: [
      ...TRAY_ORDINARY,
      // The stock form still governs above 900px; the ID form is what keeps it
      // ahead of the ordinary narrow rule below it.
      '#command-dock.dock-has-two-pinned-trays .dock-pinned-top.dock-pinned:not(.collapsed) .dock-popover-content',
      '#command-dock.dock-has-two-pinned-trays #location-bar.dock-pinned-top.dock-pinned:not(.collapsed) .dock-popover-content',
    ],
    stackVar: '--dock-lower-pinned-height',
  },
];

function creditTopPx(width, height) {
  const bottom = resolve(CREDIT_SELECTORS, 'bottom', width, 'credit');
  return toPx(bottom.decl.value, height, 'credit bottom') + CREDIT_HEIGHT_PX;
}

// ── Keep-out model (Atlas layout) ───────────────────────────────────────────
//
// Contract: the credit sits bottom-left; the desktop command dock is anchored
// at the top so it cannot reach it; on phones the search sits above the tab bar
// and the credit above the search; the layer panel stops short of the credit.

const KEEP_OUT_ELEMENTS = ['#cesium-credits', '#gev-credits', '#command-dock'];

// Any of these on a keep-out element's own box can move it, so each is vetted.
const GUARDED_PROPS = new Set([
  'bottom',
  'top',
  'inset',
  'inset-block',
  'inset-block-start',
  'inset-block-end',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'all',
  'position',
  'transform',
  'translate',
  'scale',
  'zoom',
]);

// Atlas places the credit with two ids, so it outranks every legacy rule.
const ATLAS_CREDIT = 'body:not(.stories-mode) #cesium-credits#cesium-credits';
const ATLAS_CREDIT_PHONE = 'body.mobile-shell #cesium-credits#cesium-credits';
const ATLAS_SEARCH_PHONE = 'body.mobile-shell #command-dock';
const ATLAS_SEARCH_FIELD_PHONE = 'body.mobile-shell #command-dock > #location-bar';
const ATLAS_LAYER_PANEL =
  'body #left-panel-stack > #data-panel:not(.collapsed)';
const ATLAS_LAYER_STACK = 'body #left-panel-stack';

const DESKTOP_WIDTHS = [640, 700, 721, 800, 900, 1023, 1024, 1440, 1920];
const PHONE_WIDTHS = [320, 375, 480, 600, 639];
const KEEP_OUT_HEIGHTS = [500, 640, 800, 1080];
// Phone tab-bar space (--mobile-tab-space) varies with safe-area insets; the
// ordering must hold for any non-negative value.
const TAB_SPACES_PX = [0, 58, 90];

/** Evaluate an offset, substituting the phone tab-bar variable. */
function offsetPx(value, viewportHeight, tabSpacePx, where) {
  const substituted = value.replace(
    /var\(--mobile-tab-space(?:,\s*[^)]*)?\)/g,
    `${tabSpacePx}px`,
  );
  return toPx(substituted, viewportHeight, where);
}

/** Remove balanced `:not(...)` / `:has(...)` groups (conditions, not state classes). */
function stripConditions(text) {
  let out = text;
  for (;;) {
    const match = out.match(/:(not|has|is|where)\(/);
    if (!match) return out;
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < out.length; i += 1) {
      if (out[i] === '(') depth += 1;
      else if (out[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    assert.ok(end > 0, `unbalanced pseudo-class in "${text}"`);
    out = out.slice(0, match.index) + out.slice(end + 1);
  }
}

/**
 * Every selector part that positions `id`'s own box in the default state, so
 * the cascade winner is computed over ALL of them, not a hand-picked few. A
 * part that requires a non-default body state class (stories, clean view,
 * recording, cockpit, docked Context) is another layout, pinned elsewhere.
 * Parts that only add conditions (`:not`, `:has`) are kept: they may apply.
 */
function candidatesFor(id, { phone }) {
  const found = new Set();
  for (const rule of RULES) {
    for (const part of rule.parts) {
      const compound = lastCompound(part);
      if (!compound.startsWith(id) || compound.includes('::')) continue;
      if (/^[\w-]/.test(compound.slice(id.length))) continue; // #location-bar-popover
      const ancestors = stripConditions(part.slice(0, part.length - compound.length));
      const classes = ancestors.match(/\.[\w-]+/g) || [];
      const stateful = classes.some((c) => !(phone && c === '.mobile-shell'));
      if (stateful) continue;
      found.add(part);
    }
  }
  return [...found];
}

/** The cascade winner for `prop`, with its source selector. */
function winnerOf(id, prop, width, phone) {
  return resolve(candidatesFor(id, { phone }), prop, width, id);
}

/** A lone px length (`12px`, `0`), or a failure. */
function lengthPx(value, where) {
  assert.match(value.trim(), /^-?[\d.]+(px)?$/, `unmodelled length in ${where}: "${value}"`);
  return Number.parseFloat(value);
}

// ── Fail-closed guards ──────────────────────────────────────────────────────

test('the specificity calculator itself is pinned', () => {
  const cases = [
    ['#cesium-credits', [1, 0, 0]],
    [
      'body:not(.ui-clean-view):not(.recording-mode) #cesium-credits',
      [1, 2, 1],
    ],
    ['#command-dock #location-bar .dock-popover-content', [2, 1, 0]],
    [
      '#command-dock.dock-has-pinned-tray #location-bar:not(.collapsed):not(.dock-pinned) .dock-popover-content',
      [2, 4, 0],
    ],
    [
      '#command-dock.dock-has-two-pinned-trays #location-bar.dock-pinned-top.dock-pinned:not(.collapsed) .dock-popover-content',
      [2, 5, 0],
    ],
    [
      '#command-dock.dock-has-two-pinned-trays .dock-pinned-top.dock-pinned:not(.collapsed) .dock-popover-content',
      [1, 5, 0],
    ],
    ['#command-dock .dock-popover-content::after', [1, 1, 1]],
  ];
  for (const [selector, expected] of cases) {
    assert.deepEqual(
      specificity(selector),
      expected,
      `specificity of "${selector}"`,
    );
  }
});

test('the model refuses every cascade construct it cannot resolve', () => {
  // The keep-out reads top/bottom/left/position of the credit and the dock off
  // the cascade. It is only valid if the atlas rule is what wins, and nothing
  // it cannot evaluate (shorthands, vertical transforms, zoom) moves the box.
  const complaints = [];
  const expectations = [
    { id: '#cesium-credits', phone: false, source: ATLAS_CREDIT, widths: DESKTOP_WIDTHS },
    { id: '#cesium-credits', phone: true, source: ATLAS_CREDIT_PHONE, widths: PHONE_WIDTHS },
    { id: '#command-dock', phone: true, source: ATLAS_SEARCH_PHONE, widths: PHONE_WIDTHS, props: ['top', 'bottom', 'left', 'right'] },
  ];
  for (const { id, phone, source, widths, props = ['position', 'top', 'bottom', 'left'] } of expectations) {
    const candidates = candidatesFor(id, { phone });
    assert.ok(candidates.includes(source), `${source} is not a rule in the stylesheet`);
    for (const part of candidates) {
      for (const rule of RULES.filter((r) => r.parts.includes(part))) {
        for (const decl of rule.decls) {
          if (decl.prop === 'zoom')
            complaints.push(`zoom on "${part}" moves the box outside the model`);
          if (
            ['inset', 'all'].includes(decl.prop) ||
            decl.prop.startsWith('inset-block')
          )
            complaints.push(`shorthand ${decl.prop} on "${part}" — the model reads longhands only`);
        }
      }
    }
    for (const width of widths) {
      for (const prop of props) {
        const win = resolve(candidates, prop, width, id, { optional: true });
        // Phone rules only override offsets; position stays with the base rule.
        const allowed = [source, ATLAS_CREDIT, '#command-dock'];
        if (win && !allowed.includes(win.part))
          complaints.push(`${id} ${prop} at ${width}px resolves via "${win.part}", not the atlas rule`);
      }
      for (const prop of ['transform', 'translate', 'scale']) {
        const win = resolve(candidates, prop, width, id, { optional: true });
        if (win && /translateY|translate3d|matrix|rotate|scale\(|^[\d.]+$/.test(win.decl.value))
          complaints.push(`${id} ${prop}: ${win.decl.value} at ${width}px moves the box vertically via "${win.part}"`);
      }
      const margin = resolve(candidates, 'margin', width, id, { optional: true });
      if (margin && margin.decl.value.trim() !== '0')
        complaints.push(`${id} margin: ${margin.decl.value} at ${width}px via "${margin.part}" offsets the box`);
    }
  }
  assert.deepEqual(
    complaints,
    [],
    `the keep-out model cannot resolve:\n  ${complaints.join('\n  ')}\n`,
  );
});
test('custom properties inside modelled offsets are provably non-negative', () => {
  // The model evaluates them at 0, which is only a conservative floor if they
  // can never go negative. Both writers are checked: CSS and the JS.
  const declared = RULES.flatMap((rule) =>
    rule.decls.filter((decl) => VETTED_VARS.has(decl.prop)),
  );
  assert.ok(
    declared.length >= VETTED_VARS.size,
    'every vetted custom property needs a CSS default',
  );
  for (const decl of declared) {
    assert.doesNotMatch(
      decl.value,
      /-\s*\d/,
      `${decl.prop} has a negative CSS default: ${decl.value}`,
    );
    const shape = FIXED_LENGTH_VARS.has(decl.prop)
      ? /^(0|\d+px)$/
      : /^(0|0px)$/;
    assert.match(
      decl.value,
      shape,
      `${decl.prop} default is not a vetted shape: ${decl.value}`,
    );
  }
  const layout = fs.readFileSync(
    new URL('./ui/panelLayoutController.js', import.meta.url),
    'utf8',
  );
  const start = layout.indexOf('_updateCommandDockTrayStack() {');
  assert.ok(start > 0, '_updateCommandDockTrayStack is missing');
  const writer = layout.slice(
    start,
    layout.indexOf('  _scheduleAdaptivePanelLayout(', start),
  );
  // Every value traces back to a rect height, floored at 0 and rounded up.
  assert.match(
    writer,
    /const locationHeight =\s*[\s\S]{0,180}?getBoundingClientRect\(\)\.height\s*\|\| 0;/,
  );
  assert.match(
    writer,
    /const presetsHeight =\s*[\s\S]{0,180}?getBoundingClientRect\(\)\.height\s*\|\| 0;/,
  );
  assert.match(
    writer,
    /const lowerPinnedHeight =\s*[\s\S]{0,220}?getBoundingClientRect\(\)\.height\s*\|\| 0;/,
  );
  assert.match(
    writer,
    /const locationHeightPx = Math\.ceil\(locationHeight\);/,
  );
  assert.match(writer, /const presetsHeightPx = Math\.ceil\(presetsHeight\);/);
  assert.match(
    writer,
    /'--dock-location-pinned-height',\s*`\$\{locationHeightPx\}px`/,
  );
  assert.match(
    writer,
    /'--dock-presets-pinned-height',\s*`\$\{presetsHeightPx\}px`/,
  );
  assert.match(
    writer,
    /'--dock-lower-pinned-height',\s*`\$\{Math\.ceil\(lowerPinnedHeight\)\}px`/,
  );
  assert.match(writer, /'--dock-pinned-stack-height', stackHeight/);
  assert.match(
    writer,
    /const stackHeight =\s*pinnedCount > 1[\s\S]{0,160}?`calc\(\$\{locationHeightPx\}px \+ \$\{presetsHeightPx\}px \+ 1\.2rem\)`/,
  );
});

test('the inputs behind the phone search height are unchanged', () => {
  // The phone keep-out adds the search height to its bottom offset. The height
  // is read from the CSS, so pin the one rule that sets it and the 36px field.
  for (const width of PHONE_WIDTHS) {
    const height = winnerOf('#location-bar', 'height', width, true);
    assert.equal(
      height.part,
      ATLAS_SEARCH_FIELD_PHONE,
      `at ${width}px the search height resolves via "${height.part}"`,
    );
    assert.equal(height.decl.value, '36px');
    assert.equal(height.decl.important, true);
    for (const prop of ['max-height', 'min-height', 'padding', 'margin']) {
      const other = resolve(
        candidatesFor('#location-bar', { phone: true }),
        prop,
        width,
        'search field',
        { optional: true },
      );
      assert.ok(
        !other || other.decl.value.trim() === '0' || other.decl.value === 'none' || other.decl.value === 'auto',
        `at ${width}px the search field gained ${prop}: ${other?.decl.value}; its measured height no longer holds`,
      );
    }
  }
});
test('the full-width rail cannot inherit a height that overrides its floor', () => {
  // `#right-context-rail.layout-focus { height: … }` is a base rule with more
  // specificity than the <=720px floor, and height + top + bottom is
  // over-constrained. It is safe only because the rail's layout pass switches
  // to a mobile mode at the SAME breakpoint and removes both the class and the
  // custom property. Pin that, or the exemption above is unearned.
  const rail = fs.readFileSync(
    path.join(ROOT, 'src', 'ui', 'rightPanelRail.js'),
    'utf8',
  );
  const gate = rail.indexOf("windowRef.matchMedia('(max-width: 720px)')");
  assert.ok(
    gate > 0,
    'the rail layout pass no longer keys off (max-width: 720px)',
  );
  const mobileBranch = rail.slice(
    gate,
    rail.indexOf("layoutMode = 'mobile'", gate) + 40,
  );
  assert.match(mobileBranch, /stack\.classList\.remove\('layout-focus'\)/);
  assert.match(
    mobileBranch,
    /stack\.style\.removeProperty\('--right-stack-max-height'\)/,
  );
});

test('right rail measurement cannot persist into a painted attribution layout', () => {
  const rail = fs.readFileSync(
    path.join(ROOT, 'src', 'ui', 'rightPanelRail.js'),
    'utf8',
  );
  const start = rail.indexOf("stack.setAttribute('data-rail-measuring', '')");
  const end = rail.indexOf(
    "stack.removeAttribute('data-rail-measuring')",
    start,
  );
  assert.ok(start > rail.indexOf("layoutMode = 'mobile'"));
  assert.ok(end > start);
  const measurement = rail.slice(start, end);
  assert.match(measurement, /try \{[\s\S]*\} finally \{/);
  assert.doesNotMatch(
    measurement,
    /\b(?:await|return|yield)\b|requestAnimationFrame|setTimeout/,
  );
});

// ── Clearance ───────────────────────────────────────────────────────────────

test('the desktop command dock is top-anchored and cannot reach the bottom-left credit', () => {
  for (const width of DESKTOP_WIDTHS) {
    const dock = (prop) => winnerOf('#command-dock', prop, width, false);
    assert.equal(dock('position').decl.value, 'fixed', `dock position at ${width}px`);
    const top = dock('top');
    assert.ok(
      lengthPx(top.decl.value, `dock top at ${width}px`) >= 0,
      `dock top at ${width}px`,
    );
    assert.equal(
      dock('bottom').decl.value,
      'auto',
      `at ${width}px the dock is anchored at the bottom via "${dock('bottom').part}"`,
    );
    // A fixed or capped height cannot pull a top-anchored box down; it must be
    // content-sized (`auto`) so the dock stays a single search row.
    assert.equal(dock('height').decl.value, 'auto', `dock height at ${width}px`);
    const credit = (prop) => winnerOf('#cesium-credits', prop, width, false);
    assert.equal(credit('top').decl.value, 'auto');
    assert.notEqual(credit('bottom').decl.value, 'auto');
    // The dock's extent: top + content height. Its search field is 36px; the
    // credit sits within the bottom 12px + one 16px line. At the shortest
    // supported viewport the two bands stay apart.
    const creditBandPx = offsetPx(credit('bottom').decl.value, 0, 0, 'credit bottom') + 16;
    for (const height of KEEP_OUT_HEIGHTS) {
      const dockBottomEdge = lengthPx(top.decl.value, 'dock top') + 36;
      assert.ok(
        height - creditBandPx - dockBottomEdge >= MIN_CLEARANCE_PX,
        `at ${width}x${height} the dock's search row reaches the credit band`,
      );
    }
  }
});
test('a pinned tray still stacks above its sibling at narrow widths', () => {
  // The stock two-pinned selector carries one ID against five classes, so the
  // ordinary narrow rule (two IDs) outranks it and the upper tray silently
  // drops var(--dock-lower-pinned-height), landing on top of the lower one.
  for (const width of [1440, 900, 800, 720, 700, 600]) {
    for (const scenario of TRAY_SCENARIOS) {
      if (!scenario.stackVar) continue;
      const resolved = resolve(scenario.offset, 'bottom', width, scenario.name);
      assert.ok(
        resolved.decl.value.includes(`var(${scenario.stackVar})`),
        `at ${width}px the ${scenario.name} resolves to "${resolved.decl.value}" via "${resolved.part}" and loses its stack offset`,
      );
    }
  }
});

test('the full-width context rail clears the required credit at every modelled viewport', () => {
  const anchors = [];
  for (const rule of RULES) {
    if (!rule.parts.includes('#right-context-rail')) continue;
    for (const decl of rule.decls) {
      if (decl.prop === 'bottom') anchors.push({ rule, decl });
    }
  }
  assert.equal(
    anchors.length,
    1,
    'the rail has exactly one bottom anchor to reason about',
  );
  assert.equal(
    parseMediaCondition(anchors[0].rule.media[0]),
    720,
    'the rail only goes full-width below 720px',
  );

  const failures = [];
  for (const width of WIDTHS.filter((w) => w <= 720)) {
    // `bottom` only governs the floor while the box is not height-capped:
    // top + bottom + a resolved height is over-constrained and drops `bottom`.
    assert.equal(
      resolve(['#right-context-rail'], 'max-height', width, 'context rail').decl
        .value,
      'none',
      `at ${width}px the rail is height-capped, so its bottom anchor no longer decides its floor`,
    );
    eachLift((lift) => {
      for (const height of HEIGHTS) {
        const rail = resolve(
          ['#right-context-rail'],
          'bottom',
          width,
          'context rail',
        );
        const clearance =
          toPx(rail.decl.value, height, 'rail bottom') -
          creditTopPx(width, height);
        if (clearance < MIN_CLEARANCE_PX)
          failures.push(
            `${width}x${height} lift ${lift}: ${clearance.toFixed(1)}px`,
          );
      }
    });
  }
  assert.deepEqual(
    failures,
    [],
    `context rail re-enters the credit band at ${failures.join(', ')}`,
  );
});

test('expanded Context and the credit row never overlap', () => {
  const docked = RULES.filter((rule) => rule.parts.includes(DOCKED_RAIL));
  assert.equal(
    docked.length,
    1,
    'expanded Context has exactly one rule for its column',
  );
  assert.deepEqual(
    docked[0].media,
    [],
    'the expanded column applies at every width',
  );
  const decl = (prop) => docked[0].decls.find((d) => d.prop === prop)?.value;
  assert.equal(decl('right'), '0');
  assert.equal(decl('width'), 'var(--context-dock-width)');
  // The credit row starts under 3rem from the left and may run to its
  // max-width: with 3rem and the column's width taken off, it ends short of
  // the column.
  for (const base of [CREDIT_SELECTORS[1], MINIMAL_HUD_CREDIT]) {
    const selector = base.replace('body:not(', 'body.context-docked:not(');
    assert.ok(compareSpecificity(specificity(selector), specificity(base)) > 0);
    for (const width of WIDTHS) {
      const left = resolve([base], 'left', width, 'credit').decl.value;
      const rem = /^(\d*\.?\d+)rem$/.exec(left);
      assert.ok(
        rem && Number(rem[1]) < 3,
        `at ${width}px the credit starts at ${left}`,
      );
      assert.equal(
        resolve([base, selector], 'max-width', width, 'docked credit').decl
          .value,
        'calc(100vw - 3rem - var(--context-dock-width))',
        `at ${width}px the credit row can run under expanded Context`,
      );
    }
  }
});

test('on phones the credit sits above the search, which sits above the tab bar', () => {
  for (const width of PHONE_WIDTHS) {
    const search = (prop) => winnerOf('#command-dock', prop, width, true);
    const credit = (prop) => winnerOf('#cesium-credits', prop, width, true);
    assert.equal(search('top').decl.value, 'auto', `phone search is top-anchored at ${width}px`);
    assert.equal(credit('top').decl.value, 'auto', `phone credit is top-anchored at ${width}px`);
    const searchHeight = lengthPx(
      winnerOf('#location-bar', 'height', width, true).decl.value,
      'search height',
    );
    for (const tab of TAB_SPACES_PX) {
      for (const height of KEEP_OUT_HEIGHTS) {
        const searchBottom = offsetPx(search('bottom').decl.value, height, tab, 'search bottom');
        const creditBottom = offsetPx(credit('bottom').decl.value, height, tab, 'credit bottom');
        assert.ok(
          searchBottom >= tab,
          `at ${width}px the search (${searchBottom}px) is not above the tab bar (${tab}px)`,
        );
        assert.ok(
          creditBottom > searchBottom + searchHeight,
          `at ${width}x${height} tab ${tab} the credit bottom ${creditBottom}px does not clear the search top ${searchBottom + searchHeight}px`,
        );
        assert.ok(
          creditBottom - (searchBottom + searchHeight) >= MIN_CLEARANCE_PX,
          `at ${width}x${height} tab ${tab} the credit is closer than ${MIN_CLEARANCE_PX}px to the search`,
        );
      }
    }
  }
});

test('the credit is bottom-left anchored and never hidden or faded', () => {
  for (const [phone, widths] of [
    [false, DESKTOP_WIDTHS],
    [true, PHONE_WIDTHS],
  ]) {
    for (const width of widths) {
      const credit = (prop) => winnerOf('#cesium-credits', prop, width, phone);
      assert.equal(credit('position').decl.value, 'fixed');
      assert.equal(credit('top').decl.value, 'auto', `credit top at ${width}px`);
      assert.equal(credit('right').decl.value, 'auto', `credit right at ${width}px`);
      const bottom = credit('bottom').decl.value;
      assert.notEqual(bottom, 'auto');
      assert.ok(offsetPx(bottom, 800, 58, 'credit bottom') >= 0, `credit bottom at ${width}px`);
      assert.ok(lengthPx(credit('left').decl.value, `credit left at ${width}px`) >= 0);
      assert.equal(credit('transform').decl.value, 'none');
      const maybe = (prop) =>
        resolve(candidatesFor('#cesium-credits', { phone }), prop, width, 'credit', { optional: true });
      assert.notEqual(maybe('display')?.decl.value, 'none', `credit hidden at ${width}px`);
      assert.notEqual(maybe('visibility')?.decl.value, 'hidden', `credit hidden at ${width}px`);
      const opacity = maybe('opacity');
      assert.ok(
        !opacity || Number.parseFloat(opacity.decl.value) >= 0.5,
        `credit faded at ${width}px: ${opacity?.decl.value}`,
      );
    }
  }
});

test('the layer panel is capped so it clears the credit at tablet and desktop widths', () => {
  const creditBand = (width) =>
    offsetPx(winnerOf('#cesium-credits', 'bottom', width, false).decl.value, 800, 0, 'credit bottom') +
    16; // credit line-height (status.css)
  for (const width of DESKTOP_WIDTHS) {
    const panel = winnerOf('#data-panel', 'max-height', width, false);
    assert.equal(panel.part, ATLAS_LAYER_PANEL, `panel cap at ${width}px resolves via "${panel.part}"`);
    const cap = /^calc\(100vh - (\d+)px\)$/.exec(panel.decl.value);
    assert.ok(cap, `unmodelled panel max-height at ${width}px: "${panel.decl.value}"`);
    // Below 1024 the stack top is set by script (--left-stack-safe-top), so
    // the model uses the atlas top (64px, layers.css) as the reference.
    const top = 64;
    if (width >= 1024) {
      // Legacy stack rules carry height-based media the model does not
      // evaluate, so read the atlas rule that pins the top with !important.
      const pinned = RULES.find(
        (rule) =>
          rule.parts.includes(ATLAS_LAYER_STACK) &&
          rule.media.length === 1 &&
          parseMediaRange(rule.media[0])?.min === 1024 &&
          rule.decls.some((d) => d.prop === 'top'),
      );
      assert.ok(pinned, 'atlas desktop rule for the layer stack is missing');
      const decl = pinned.decls.find((d) => d.prop === 'top');
      assert.equal(decl.value, `${top}px`);
      assert.equal(decl.important, true, 'the atlas stack top must be !important');
    }
    const reserved = Number(cap[1]);
    assert.ok(
      reserved - top - creditBand(width) >= MIN_CLEARANCE_PX,
      `at ${width}px a panel starting ${top}px down and ending ${reserved}px above the bottom edge leaves < ${MIN_CLEARANCE_PX}px above the credit band (${creditBand(width)}px)`,
    );
  }
});
test('the minimal-HUD credit variant tracks the ordinary one', () => {
  // It is MORE specific, so if the two ever diverge the model reads the wrong
  // anchor while the browser paints the other.
  assert.ok(
    compareSpecificity(
      specificity(MINIMAL_HUD_CREDIT),
      specificity(CREDIT_SELECTORS[1]),
    ) > 0,
  );
  for (const width of WIDTHS) {
    assert.equal(
      resolve([MINIMAL_HUD_CREDIT], 'bottom', width, 'minimal-HUD credit').decl
        .value,
      resolve(CREDIT_SELECTORS, 'bottom', width, 'credit').decl.value,
      `the minimal-HUD credit anchor diverges at ${width}px`,
    );
  }
});

test('the tray only spans the credit corner at the widths the model covers', () => {
  const widened = RULES.filter(
    (rule) =>
      rule.parts.includes('#command-dock .dock-popover-content') &&
      rule.decls.some(
        (decl) =>
          decl.prop === 'width' &&
          decl.value.includes('--dock-popover-mobile-width'),
      ),
  );
  assert.equal(widened.length, 1);
  assert.equal(parseMediaCondition(widened[0].media[0]), 900);
});

test('the credit line is never suppressed to make room', () => {
  const creditBlocks = [
    ...css.matchAll(/#cesium-credits[^{]*\{([^}]*)\}/g),
  ].map((m) => m[1]);
  assert.ok(creditBlocks.length > 0);
  for (const block of creditBlocks) {
    assert.doesNotMatch(
      block,
      /display\s*:\s*none/,
      'the credit must never be display:none',
    );
    assert.doesNotMatch(
      block,
      /visibility\s*:\s*hidden/,
      'the credit must never be hidden',
    );
    assert.doesNotMatch(
      block,
      /opacity\s*:\s*0(?![\d.])/,
      'the credit must never be faded out',
    );
  }
  assert.match(
    css,
    /body\.ui-clean-view #cesium-credits,\s*\n\s*body\.recording-mode #cesium-credits \{[^}]*bottom: 36px;/,
  );
});

test('OSM-derived layers never force the desktop credit row into a stack', () => {
  assert.doesNotMatch(css, /body:has\([^)]*alpr-cameras[^}]*#cesium-credits/);
  assert.doesNotMatch(
    css,
    /#cesium-credits\s+\.cesium-credit-expand-link\s*\{[^}]*display:\s*block/,
  );
});

test('expanded Context keeps the credits beside it right to left and with the minimal HUD', () => {
  const css = fs
    .readFileSync(
      path.join(ROOT, 'src', 'ui', 'styles', 'context-dock.css'),
      'utf8',
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ');
  const rule = (selectorPart, decl) =>
    new RegExp(
      `${selectorPart}[^{}]*:is\\(#cesium-credits, #gev-credits\\) \\{[^}]*${decl}`,
    ).test(css);
  // Right to left the column docks to the left edge, where the credits start.
  assert.ok(
    rule(
      "html\\[dir='rtl'\\] body\\.context-docked",
      'left: calc\\(36px \\+ var\\(--context-dock-width\\)\\)',
    ),
    'right to left, the credits start past the expanded column',
  );
  // The minimal HUD puts the credits bottom right, where the column docks.
  assert.ok(
    rule(
      "^.*body\\.context-docked:not\\(\\.ui-clean-view\\):not\\(\\.recording-mode\\):has\\( #intel-hud\\[data-variant='minimal'\\]\\.active \\)",
      'right: calc\\(36px \\+ var\\(--context-dock-width\\)\\)',
    ),
    'with the minimal HUD, the credits end before the expanded column',
  );
});
