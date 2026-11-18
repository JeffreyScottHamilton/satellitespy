import assert from 'node:assert/strict';
import http from 'node:http';
import { after, describe, it } from 'node:test';
import { createProviderHandler } from './adapter.js';

const servers = [];

/** Serve a provider handler on an ephemeral loopback port; returns a fetch-like helper. */
async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const { port } = server.address();
  return (pathname) =>
    new Promise((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: pathname }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              type: res.headers['content-type'],
              body,
            }),
          );
        })
        .on('error', reject);
    });
}

/** A plugin whose configureServer registers one middleware via the given args. */
function plugin(name, ...args) {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(...args);
    },
  };
}

/** Responds with a JSON description of what the middleware saw. */
function echo(label) {
  return (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ label, url: req.url }));
  };
}

after(() => {
  for (const server of servers) server.close();
});

describe('createProviderHandler routing', () => {
  it('matches path prefixes on segment boundaries and strips the mount path', async () => {
    const handler = await createProviderHandler({
      plugins: [plugin('alpha', '/api/alpha', echo('alpha'))],
    });
    const get = await serve(handler);

    const exact = await get('/api/alpha');
    assert.equal(exact.status, 200);
    assert.deepEqual(JSON.parse(exact.body), { label: 'alpha', url: '/' });

    const nested = await get('/api/alpha/x?y=1');
    assert.deepEqual(JSON.parse(nested.body), {
      label: 'alpha',
      url: '/x?y=1',
    });

    const sibling = await get('/api/alphabet');
    assert.equal(sibling.status, 404);
  });

  it('runs matching middleware in registration order and stops at the first response', async () => {
    const calls = [];
    const first = {
      name: 'first',
      configureServer({ middlewares }) {
        middlewares.use('/api/x', (req, res) => {
          calls.push('first');
          res.end('first');
        });
      },
    };
    const second = {
      name: 'second',
      configureServer({ middlewares }) {
        middlewares.use('/api/x', (req, res) => {
          calls.push('second');
          res.end('second');
        });
      },
    };
    const get = await serve(
      await createProviderHandler({ plugins: [first, second] }),
    );
    const response = await get('/api/x');
    assert.equal(response.body, 'first');
    assert.deepEqual(calls, ['first']);
  });

  it('falls through to the next matching middleware when next() is called', async () => {
    const seen = [];
    const gate = plugin('gate', '/api/alpha', (req, res, next) => {
      seen.push(req.url);
      next();
    });
    const later = plugin('later', '/api', (req, res) => {
      seen.push(req.url);
      res.end('later');
    });
    const get = await serve(
      await createProviderHandler({ plugins: [gate, later] }),
    );
    const response = await get('/api/alpha/deep?q=2');
    assert.equal(response.body, 'later');
    // Each mount strips its own prefix; the url is restored between layers.
    assert.deepEqual(seen, ['/deep?q=2', '/alpha/deep?q=2']);
  });

  it('runs path-less middleware for every request', async () => {
    const handler = await createProviderHandler({
      plugins: [
        {
          name: 'catch-all',
          configureServer({ middlewares }) {
            middlewares.use((req, res) => res.end(`saw ${req.url}`));
          },
        },
      ],
    });
    const get = await serve(handler);
    assert.equal((await get('/anything/at/all')).body, 'saw /anything/at/all');
  });

  it('answers unmatched requests with a 404 JSON body', async () => {
    const get = await serve(await createProviderHandler({ plugins: [] }));
    const response = await get('/api/missing');
    assert.equal(response.status, 404);
    assert.match(response.type, /^application\/json/);
    assert.deepEqual(JSON.parse(response.body), { error: 'not_found' });
  });
});

describe('createProviderHandler errors', () => {
  it('turns next(err) into a 500 JSON body', async () => {
    const failing = plugin('failing', '/api/boom', (req, res, next) =>
      next(new Error('boom')),
    );
    const get = await serve(
      await createProviderHandler({ plugins: [failing] }),
    );
    const response = await get('/api/boom');
    assert.equal(response.status, 500);
    assert.match(response.type, /^application\/json/);
    assert.deepEqual(JSON.parse(response.body), { error: 'internal_error' });
    assert.ok(
      !response.body.includes('boom'),
      'internal message must not leak',
    );
  });

  it('turns a synchronous throw into a 500 JSON body', async () => {
    const throwing = plugin('throwing', '/api/throw', () => {
      throw new Error('sync');
    });
    const get = await serve(
      await createProviderHandler({ plugins: [throwing] }),
    );
    const response = await get('/api/throw');
    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(response.body), { error: 'internal_error' });
  });

  it('turns a rejected async handler into a 500 JSON body', async () => {
    const rejecting = plugin('rejecting', '/api/reject', async () => {
      throw new Error('async');
    });
    const get = await serve(
      await createProviderHandler({ plugins: [rejecting] }),
    );
    const response = await get('/api/reject');
    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(response.body), { error: 'internal_error' });
  });

  it('gives four-argument error middleware the error and lets it respond', async () => {
    const seen = [];
    const failing = plugin('failing', '/api/e', (req, res, next) =>
      next(new Error('kaput')),
    );
    const recover = plugin('recover', '/api', (err, req, res, next) => {
      seen.push(err.message);
      res.statusCode = 503;
      res.end('recovered');
    });
    const get = await serve(
      await createProviderHandler({ plugins: [failing, recover] }),
    );
    const response = await get('/api/e');
    assert.deepEqual(seen, ['kaput']);
    assert.equal(response.status, 503);
    assert.equal(response.body, 'recovered');
  });
});

describe('createProviderHandler plugin installation', () => {
  it('ignores entries without configureServer', async () => {
    const handler = await createProviderHandler({
      plugins: [
        null,
        undefined,
        { name: 'inert' },
        plugin('live', '/api/live', echo('live')),
      ],
    });
    const get = await serve(handler);
    assert.equal(JSON.parse((await get('/api/live')).body).label, 'live');
  });

  it('awaits asynchronous configureServer before routing', async () => {
    const late = {
      name: 'late',
      async configureServer({ middlewares }) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        middlewares.use('/api/late', echo('late'));
      },
    };
    const get = await serve(await createProviderHandler({ plugins: [late] }));
    assert.equal(JSON.parse((await get('/api/late')).body).label, 'late');
  });

  it('calls post hooks returned by configureServer after installation', async () => {
    const order = [];
    const hooked = {
      name: 'hooked',
      configureServer({ middlewares }) {
        middlewares.use('/api/hooked', echo('hooked'));
        order.push('install');
        return () => order.push('post');
      },
    };
    await createProviderHandler({ plugins: [hooked] });
    assert.deepEqual(order, ['install', 'post']);
  });

  it('does not throw for a plugin that touches httpServer, and keeps later plugins', async () => {
    const socketPlugin = {
      name: 'socket-like',
      configureServer(server) {
        // Vite's middleware mode has no httpServer; unguarded access must not
        // take the whole provider set down.
        server.httpServer.on('close', () => {});
      },
    };
    const guarded = {
      name: 'guarded',
      configureServer(server) {
        server.middlewares.use('/api/guarded', echo('guarded'));
        server.httpServer?.on('close', () => {});
      },
    };
    let handler;
    await assert.doesNotReject(async () => {
      handler = await createProviderHandler({
        plugins: [socketPlugin, guarded],
      });
    });
    const get = await serve(handler);
    assert.equal(JSON.parse((await get('/api/guarded')).body).label, 'guarded');
  });

  it('exposes env and root on the fake server config', async () => {
    let seen;
    const env = { EXAMPLE_KEY: 'value' };
    await createProviderHandler({
      env,
      root: '/srv/app',
      plugins: [
        {
          name: 'reader',
          configureServer(server) {
            seen = server.config;
          },
        },
      ],
    });
    assert.equal(seen.env, env);
    assert.equal(seen.root, '/srv/app');
  });
});
