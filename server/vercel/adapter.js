/**
 * Serverless adapter for the local provider plugins.
 *
 * The providers are Vite plugins that register connect-style middleware in
 * `configureServer(server)`. Vite is not a production server, so on Vercel
 * this module stands in for `server.middlewares`: it collects the middleware in
 * registration order and dispatches each request through them the way connect
 * does (mount-path prefix match, req.url rewritten while a mounted layer runs,
 * next(err) skipping to four-argument error handlers).
 *
 * Not supported here: anything that needs a real `httpServer` or `ws` (WebSocket
 * upgrades such as the AIS live stream and realtime voice). Those plugins get
 * `httpServer: null`, so their lifecycle hooks are skipped and their upgrade
 * paths never attach.
 */
import { isIP } from 'node:net';
import { PROXY_SIGNALS } from '../../src/localRequestGate.mjs';

/**
 * Whether an address is loopback, private, link-local or unspecified. A public
 * Vercel request is never local, so such a value must not become the peer.
 * @param {string} ip A value already validated by `isIP`.
 * @returns {boolean}
 */
function isLocalOrPrivateAddress(ip) {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  const addr = (mapped ? mapped[1] : ip).toLowerCase();
  if (isIP(addr) === 4) {
    const [a, b] = addr.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return (
    addr === '::' ||
    addr === '::1' ||
    /^f[cd]/.test(addr) ||
    /^fe[89ab]/.test(addr) ||
    /^::ffff:/.test(addr)
  );
}

/**
 * Opt-in request normalisation for keyed routes (SATELLITESPY_PUBLIC_KEYED_ROUTES=1).
 * Vercel adds x-forwarded-* headers to every request and terminates TLS, so the
 * same-site gate would refuse every keyed route. When enabled, derive the client
 * IP and protocol from Vercel's headers, strip every proxy signal header, and
 * present a socket shim so the gate still enforces Origin/Host/Sec-Fetch-Site.
 * Anyone who can load the site can then spend the keys (see docs/DEPLOYMENT.md).
 * @param {import('node:http').IncomingMessage} req
 */
function normaliseVercelRequest(req) {
  const headers = req.headers || {};
  const first = (value) =>
    String(Array.isArray(value) ? value[0] : value || '')
      .split(',')[0]
      .trim();
  const candidate =
    first(headers['x-vercel-forwarded-for']) ||
    first(headers['x-forwarded-for']);
  const clientIp =
    isIP(candidate) && !isLocalOrPrivateAddress(candidate)
      ? candidate
      : 'unknown';
  const proto = first(headers['x-forwarded-proto']).toLowerCase();
  const encrypted = proto === 'https';
  for (const name of PROXY_SIGNALS) delete headers[name];
  delete headers['x-vercel-forwarded-for'];
  Object.defineProperty(req, 'socket', {
    value: Object.freeze({ encrypted, remoteAddress: clientIp }),
    configurable: true,
    writable: true,
  });
}

/**
 * Normalise a mount path: drop a trailing slash, and treat '/' as "match all".
 * @param {string} route
 * @returns {string}
 */
function normaliseRoute(route) {
  const text = String(route ?? '');
  if (text === '/' || text === '') return '';
  return text.endsWith('/') ? text.slice(0, -1) : text;
}

/**
 * Connect's mount rule: the pathname must start with the route, case-insensitively,
 * and the character after it must be a segment boundary.
 * @param {string} route Normalised route ('' matches everything).
 * @param {string} pathname Request pathname without query.
 * @returns {boolean}
 */
function matchesRoute(route, pathname) {
  if (!route) return true;
  if (pathname.length < route.length) return false;
  if (pathname.slice(0, route.length).toLowerCase() !== route.toLowerCase())
    return false;
  const boundary = pathname[route.length];
  return boundary === undefined || boundary === '/' || boundary === '.';
}

/** @param {string|undefined} url */
function pathnameOf(url) {
  return String(url || '/').split(/[?#]/, 1)[0];
}

/**
 * Write a JSON error response unless the handler already started one.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} error Stable machine-readable code; never an internal message.
 */
function sendJsonError(res, status, error) {
  if (res.writableEnded) return;
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error }));
}

/**
 * Run the collected middleware for one request, connect-style.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Array<{route: string, handler: Function}>} stack
 */
function dispatch(req, res, stack) {
  let index = 0;
  let restoreUrl = null;

  const next = (err) => {
    if (restoreUrl) {
      restoreUrl();
      restoreUrl = null;
    }
    while (index < stack.length) {
      const layer = stack[index++];
      if (!matchesRoute(layer.route, pathnameOf(req.url))) continue;
      const isErrorHandler = layer.handler.length === 4;
      if (Boolean(err) !== isErrorHandler) continue;

      const originalUrl = req.url;
      if (layer.route) {
        const rest = (req.url || '/').slice(layer.route.length);
        req.url = rest.startsWith('/') ? rest : `/${rest}`;
      }
      restoreUrl = () => {
        req.url = originalUrl;
      };

      try {
        const result = err
          ? layer.handler(err, req, res, next)
          : layer.handler(req, res, next);
        if (result && typeof result.then === 'function') {
          result.catch((rejection) => next(rejection));
        }
      } catch (thrown) {
        next(thrown);
      }
      return;
    }

    if (err) {
      console.error('[provider-adapter] request failed', err?.stack || err);
      sendJsonError(res, 500, 'internal_error');
      return;
    }
    sendJsonError(res, 404, 'not_found');
  };

  next();
}

/**
 * Build the request handler for a set of provider plugins.
 *
 * Each plugin's `configureServer` runs once, in array order, against a fake
 * ViteDevServer. A returned function is a post hook and runs after every
 * plugin has installed. A plugin that throws is logged and skipped so one
 * failing provider does not take the others down.
 *
 * @param {{plugins?: Array<object>, env?: Record<string, string|undefined>, root?: string}} [options]
 * @returns {Promise<(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void>}
 */
export async function createProviderHandler({
  plugins = [],
  env = process.env,
  root = process.cwd(),
} = {}) {
  const stack = [];
  const middlewares = {
    use(routeOrHandler, maybeHandler) {
      if (typeof routeOrHandler === 'function') {
        stack.push({ route: '', handler: routeOrHandler });
      } else {
        if (typeof maybeHandler !== 'function')
          throw new TypeError(
            'middlewares.use(route, handler) needs a handler',
          );
        stack.push({
          route: normaliseRoute(routeOrHandler),
          handler: maybeHandler,
        });
      }
      return middlewares;
    },
  };
  const server = {
    middlewares,
    httpServer: null,
    config: { env, root, command: 'serve', mode: 'production' },
    // WebSocket upgrades are unsupported on serverless; this keeps `server.ws`
    // callable so plugins that only broadcast do not crash.
    ws: { clients: new Set(), send() {}, on() {}, off() {}, close() {} },
  };

  const postHooks = [];
  for (const plugin of plugins) {
    if (!plugin || typeof plugin.configureServer !== 'function') continue;
    try {
      const post = await plugin.configureServer(server);
      if (typeof post === 'function')
        postHooks.push({ name: plugin.name, post });
    } catch (error) {
      console.error(
        `[provider-adapter] ${plugin.name || 'unnamed plugin'} failed to install`,
        error?.message || error,
      );
    }
  }
  for (const { name, post } of postHooks) {
    try {
      await post();
    } catch (error) {
      console.error(
        `[provider-adapter] ${name || 'unnamed plugin'} post hook failed`,
        error?.message || error,
      );
    }
  }

  const publicKeyed = env?.SATELLITESPY_PUBLIC_KEYED_ROUTES === '1';
  return (req, res) => {
    if (publicKeyed) normaliseVercelRequest(req);
    dispatch(req, res, stack);
  };
}
