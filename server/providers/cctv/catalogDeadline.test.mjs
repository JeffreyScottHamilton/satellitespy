import test from 'node:test';
import assert from 'node:assert/strict';
import { createCctvCatalog } from './catalog.js';

const cam = (id) => ({ id, name: id, lat: 1, lon: 2, streamUrl: 'https://x/y.jpg' });

test('a pack that never resolves is cut off; others are served and it is reported failed', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    let hangCalls = 0;
    const livePacks = [
      { name: 'fast', enabled: () => true, load: async () => [cam('fast-1')] },
      {
        name: 'hung',
        enabled: () => true,
        load: () => {
          hangCalls += 1;
          return new Promise(() => {});
        },
      },
    ];
    const get = createCctvCatalog({
      sourceRoot: '/nonexistent',
      packDeadlineMs: 50,
      livePacks,
    });
    const started = Date.now();
    const sources = await get();
    assert.ok(Date.now() - started < 2000);
    assert.deepEqual(sources.map((s) => s.id), ['fast-1']);
    const failed = get.failedPacks(sources);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].pack, 'hung');
    assert.match(failed[0].reason, /deadline/);
    // Partial catalog is cached: no reload within the TTL.
    assert.equal(await get(), sources);
    assert.equal(hangCalls, 1);
  } finally {
    console.warn = warn;
  }
});

test('frame id miss on a partial catalog waits for one refresh and finds the camera', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    let slowCalls = 0;
    const livePacks = [
      { name: 'fast', enabled: () => true, load: async () => [cam('fast-1')] },
      {
        name: 'slow',
        enabled: () => true,
        // First build misses the deadline; the retry succeeds.
        load: () =>
          ++slowCalls === 1
            ? new Promise(() => {})
            : Promise.resolve([cam('slow-1')]),
      },
    ];
    const get = createCctvCatalog({
      sourceRoot: '/nonexistent',
      packDeadlineMs: 30,
      livePacks,
    });
    const partial = await get();
    assert.equal(partial.some((s) => s.id === 'slow-1'), false);
    const fresh = await get.refreshIfPartial(partial, 2000);
    assert.equal(fresh.some((s) => s.id === 'slow-1'), true);
    assert.equal(get.failedPacks(fresh).length, 0);
    // A complete catalog is returned unchanged (no further refresh).
    assert.equal(await get.refreshIfPartial(fresh), fresh);
    assert.equal(slowCalls, 2);
  } finally {
    console.warn = warn;
  }
});
