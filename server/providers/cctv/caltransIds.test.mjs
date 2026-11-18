import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCaltransSourcesFromOpenData } from './sources.js';

const row = (n, extra = {}) => ({
  cctv: {
    inService: 'true',
    location: {
      latitude: '38.5',
      longitude: '-121.4',
      locationName: `Hwy 51 at spot ${n}`,
      ...extra,
    },
    imageData: {
      static: {
        currentImageURL: `https://cwwp2.dot.ca.gov/data/d3/cctv/image/cam${n}/cam${n}.jpg`,
      },
    },
  },
});

async function load(rows) {
  const realFetch = globalThis.fetch;
  const prev = process.env.CCTV_CALTRANS_DISTRICTS;
  process.env.CCTV_CALTRANS_DISTRICTS = '3';
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: rows }),
  });
  try {
    return await loadCaltransSourcesFromOpenData();
  } finally {
    globalThis.fetch = realFetch;
    if (prev === undefined) delete process.env.CCTV_CALTRANS_DISTRICTS;
    else process.env.CCTV_CALTRANS_DISTRICTS = prev;
  }
}

test('codeless Caltrans ids are stable across order and filtering', async () => {
  const rows = [row(1), row(2), row(3)];
  const a = await load(rows);
  const b = await load([...rows].reverse());
  const bad = { cctv: { ...row(0).cctv, location: { latitude: 'x' } } };
  const c = await load([bad, rows[2], bad, rows[1]]);
  const idFor = (list, n) =>
    list.find((s) => s.name.includes(`spot ${n}`))?.id;
  assert.equal(a.length, 3);
  assert.match(idFor(a, 2), /^ca-d3-x[0-9a-f]{8}$/);
  for (const n of [2, 3]) {
    assert.equal(idFor(a, n), idFor(b, n));
    assert.equal(idFor(a, n), idFor(c, n));
  }
  assert.equal(new Set(a.map((s) => s.id)).size, 3);
});
