/**
 * Vercel Node function for the provider API.
 *
 * Every `/api/*` request lands here. The provider plugins are built once per
 * function instance (lazily, on the first request) and then reused. Vercel only
 * allows writes under /tmp, so the Nominatim cache is pointed there.
 *
 * Caveats (see docs/DEPLOYMENT.md): caches are per instance and ephemeral,
 * rate limits are per instance, and WebSocket upgrades are not served.
 */
import { createProviderHandler } from '../server/vercel/adapter.js';

const NOMINATIM_STORAGE_DIR = '/tmp/satellitespy/nominatim';

let handlerPromise = null;

/** Build the provider handler once per instance; a failed build is retried next request. */
function getProviderHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const { localProviderPlugins } =
        await import('../server/providers/local.js');
      return createProviderHandler({
        // Provider Settings writes .env on the host; on Vercel keys live in project
        // env vars, so the setup endpoint is left out.
        plugins: localProviderPlugins({
          nominatimStorageDir: NOMINATIM_STORAGE_DIR,
        }).filter((plugin) => plugin?.name !== 'gev-key-setup'),
        env: process.env,
        root: process.cwd(),
      });
    })().catch((error) => {
      handlerPromise = null;
      throw error;
    });
  }
  return handlerPromise;
}

/**
 * The adapter routes on req.url, which must be the original `/api/...` path.
 * Vercel normally keeps it intact; if it has been rewritten to the catch-all
 * route, rebuild it from the captured `path` segments.
 * @param {import('node:http').IncomingMessage & {query?: Record<string, unknown>}} req
 * @returns {string}
 */
function originalApiUrl(req) {
  const raw = String(req.url || '/');
  if (raw.startsWith('/api/')) return raw;
  const captured = req.query?.path;
  const segments = Array.isArray(captured)
    ? captured
    : captured
      ? [captured]
      : [];
  const search = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
  return `/api/${segments.map(String).join('/')}${search}`;
}

export default async function handler(req, res) {
  const url = originalApiUrl(req);
  let run;
  try {
    run = await getProviderHandler();
  } catch (error) {
    console.error('[api] provider build failed', error?.stack || error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'internal_error' }));
    return;
  }
  req.url = url;
  run(req, res);
}
