/**
 * Vercel Node function for the provider API.
 *
 * Every `/api/*` request lands here: vercel.json rewrites `/api/:path*` to
 * `/api/gateway?__path=:path*`, because a catch-all file name only matched
 * single-segment paths in production. The provider plugins are built once per
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
 * vercel.json rewrites every `/api/:path*` request to `/api/gateway?__path=:path*`
 * (a catch-all file only matched single-segment paths in production), so rebuild
 * the original URL from `__path` and keep the remaining query params in order.
 * @param {import('node:http').IncomingMessage & {query?: Record<string, unknown>}} req
 * @returns {string|null} The rebuilt URL, or null when a segment is unsafe (answer 400).
 */
export function originalApiUrl(req) {
  const raw = String(req.url || '/');
  let parsed;
  try {
    parsed = new URL(raw, 'http://localhost');
  } catch {
    return null;
  }
  const pathname = parsed.pathname;
  const isGateway =
    pathname === '/api/gateway' ||
    pathname === '/api/gateway/' ||
    pathname === '/api/gateway.mjs';
  const params = parsed.searchParams;
  const rest = new URLSearchParams();
  for (const [key, value] of params) {
    if (key !== '__path') rest.append(key, value);
  }
  const query = rest.toString();
  const search = query ? `?${query}` : '';

  if (!isGateway && pathname.startsWith('/api/')) {
    if (!params.has('__path')) return raw;
    return `${pathname}${search}`;
  }

  let captured = params.has('__path') ? params.get('__path') : req.query?.__path;
  if (captured === undefined || captured === null) captured = [];
  const segments = (
    Array.isArray(captured)
      ? captured.map(String)
      : String(captured).split('/')
  ).filter((segment) => segment !== '');
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === '.' ||
        segment === '..' ||
        // eslint-disable-next-line no-control-regex
        /[/?#\\\u0000-\u001f\u007f]/.test(segment),
    )
  ) {
    return null;
  }
  return `/api/${segments.map(encodeURIComponent).join('/')}${search}`;
}

export default async function handler(req, res) {
  const url = originalApiUrl(req);
  if (url === null) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'bad_path' }));
    return;
  }
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
