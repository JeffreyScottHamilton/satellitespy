import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { originalApiUrl } from './gateway.mjs';

const parse = (u) => new URL(u, 'http://x');

describe('originalApiUrl', () => {
  it('keeps direct /api/ urls', () => {
    assert.equal(originalApiUrl({ url: '/api/firms?x=1' }), '/api/firms?x=1');
  });
  it('rebuilds from __path', () => {
    assert.equal(
      originalApiUrl({ url: '/api/gateway?__path=tomtom%2Fstatus' }),
      '/api/tomtom/status',
    );
  });
  it('preserves other query params', () => {
    const out = originalApiUrl({
      url: '/api/gateway?__path=cctv/sources&bbox=1,2',
    });
    const u = parse(out);
    assert.equal(u.pathname, '/api/cctv/sources');
    assert.equal(u.searchParams.get('bbox'), '1,2');
    assert.equal(u.searchParams.has('__path'), false);
  });
  it('accepts req.query array form', () => {
    assert.equal(
      originalApiUrl({
        url: '/api/gateway',
        query: { __path: ['tomtom', 'status'] },
      }),
      '/api/tomtom/status',
    );
  });
  it('rejects unsafe or empty paths', () => {
    assert.equal(originalApiUrl({ url: '/api/gateway?__path=a/../b' }), null);
    assert.equal(originalApiUrl({ url: '/api/gateway?__path=..' }), null);
    assert.equal(originalApiUrl({ url: '/api/gateway' }), null);
    assert.equal(originalApiUrl({ url: '/api/gateway?__path=' }), null);
    assert.equal(originalApiUrl({ url: '/api/gateway?__path=a%00b' }), null);
  });
  it('strips __path from direct api urls', () => {
    assert.equal(
      originalApiUrl({ url: '/api/tomtom/status?__path=evil' }),
      '/api/tomtom/status',
    );
  });
});
