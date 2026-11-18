# Deployment

This app has two halves. The browser bundle is static (`npm run build` writes `dist/`).
The API is a set of about 45 provider plugins (`server/providers/local.js`, `localProviderPlugins`).
Those plugins were written for the Vite dev server, which is the only production-like server
the repo ships (`Dockerfile` runs `scripts/docker-start.mjs`, which starts Vite).

Vercel can host the static bundle and run the stateless REST providers as one serverless
function. Anything that holds a socket open, writes local state, or relies on a persistent
process does not work there. For full functionality, run the Docker image on a host that
keeps a process alive.

## How the Vercel setup is wired

- `vercel.json`: framework `vite`, build `npm run build`, output `dist/`. The function's
  `includeFiles` ships `server/**`, `config/**`, `public/quebec-cameras.json`, the two
  `src/data/local_data` folders that the providers read at runtime (`natural_earth`,
  `cctv_ground_heights`), and `node_modules/ws/**` (loaded through `createRequire`, which
  Vercel's file tracing may not see). `maxDuration` is 30 seconds.
- `vercel.json` `headers`: `/assets/*` (content-hashed) is `immutable` for a year; `/cesium/*` (unhashed runtime) is cached one day with seven days of stale-while-revalidate.
- `api/gateway.mjs`: one Node function for every `/api/*` path. It builds the provider
  handler once per instance, from `localProviderPlugins({ nominatimStorageDir: '/tmp/satellitespy/nominatim' })`.
  It leaves out the `gev-key-setup` plugin, which writes `.env` on disk and has no use on Vercel.
- `server/vercel/adapter.js`: `createProviderHandler` runs each plugin's `configureServer`
  against a fake Vite server object (`httpServer: null`) and dispatches requests through the
  collected middleware in connect style. Unmatched requests get `404 {"error":"not_found"}`,
  and errors get `500 {"error":"internal_error"}`. A plugin that throws during install is
  logged and skipped, and the others still load.
- A catch-all file (`api/[...path].mjs`) only matched single-segment paths in production
  (`/api/tomtom/status` got the platform 404), so `vercel.json` rewrites every `/api/*` path
  to `api/gateway.mjs` with the path in the `__path` query param. The app has no client-side
  router that needs an SPA fallback.

## What was verified, and how

Verified locally on Node 22 with no Vercel CLI and no Vercel deployment. The function
was served through `node:http` and called with `curl`-equivalent requests:

| Request                                                                                         | Result                      | Notes                                                                                             |
| ----------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/celestrak/stations`                                                                   | 200, TLE text               | Upstream reached through the sandbox proxy. With no upstream and no cache, the proxy returns 502. |
| `GET /api/geocode?q=Paris&format=json` with `NOMINATIM_URL=https://nominatim.openstreetmap.org` | 200                         | Without `NOMINATIM_URL` it returns 503 `NOMINATIM_DISABLED`.                                      |
| `GET /api/geocode/status`                                                                       | 200 `{"configured":...}`    | Reflects whether `NOMINATIM_URL` is set.                                                          |
| `GET /api/celestrak/bogus`                                                                      | 400 `invalid group`         | Group validation runs before any upstream call.                                                   |
| `GET /api/vessels` without `AISSTREAM_API_KEY`                                                  | 503 `missing-key` JSON      | Shows the AIS HTTP route is registered. No stream runs.                                           |
| `GET /api/realtime/token` without `OPENAI_API_KEY`                                              | 503 `API_KEY_MISSING`       | Route is registered. A valid key was not tested.                                                  |
| `GET /api/openai/chat`                                                                          | 405                         | Method check.                                                                                     |
| `GET /api/nope`                                                                                 | 404 `{"error":"not_found"}` | Adapter fallback.                                                                                 |

Not verified: an actual Vercel deployment, `vercel build` output, the `includeFiles` glob,
cold-start time, and whether Vercel's Node runtime leaves the request body unread for POST
routes (the providers read request streams themselves). The `maxDuration` value is subject to
the plan's limit.

## Feature matrix on Vercel

Works (stateless, keyless request/response proxies; only the routes in the table above were exercised):

- Static frontend from `dist/`.
- Stateless REST proxies: CelesTrak (`/api/celestrak/<group>`), Nominatim geocoding
  (`/api/geocode`, needs `NOMINATIM_URL`), and the other keyless providers, which were not
  individually tested.

### Keyed routes are off by default

Routes that spend a paid API key (for example `/api/realtime/token`, `/api/openai/*`,
`/api/google/nearby-places`) sit behind the same-site gate. Vercel adds `x-forwarded-for`,
`x-forwarded-proto` and `x-forwarded-host` to every request, and the gate refuses any request
carrying proxy headers. **On Vercel these routes answer 403 by default.** That is intended.

Setting `SATELLITESPY_PUBLIC_KEYED_ROUTES=1` in the function's environment turns them on. The
adapter then derives the client IP (`x-vercel-forwarded-for`, else the first `x-forwarded-for`
entry) and protocol (`x-forwarded-proto`), strips the proxy headers, and lets the gate run its
Origin, Host and Sec-Fetch-Site checks. **This lets anyone who can load the site spend those
keys.** The Origin checks only stop other websites in a browser; `curl` or any script can omit
or forge `Origin`. The only limit is the per-IP rate limit, which is in memory per instance.
Enable it only with provider-side budgets and alerts, or put the site behind authentication.

Still local-only (not available on Vercel with or without the opt-in): Provider Settings and
key setup (`/api/setup/*`), the AIS live stream, realtime voice sessions, SSE streams and any
WebSocket upgrade, and persistent disk caches.

Does not work, or is not supported:

- **AIS live stream** (`/api/vessels` streaming from AISStream). The stream is an outbound
  WebSocket held open by a long-running process (`server/providers/vessels/ais-live.js`).
  A serverless invocation cannot keep it alive, and `httpServer` is `null` in this adapter.
  `/api/vessels` answers from in-memory state, so it stays empty.
- **OpenAI / Gemini realtime voice.** Only the token routes are served. The standalone
  dev config passes voice tool definitions into the providers (`realtime: { tools }`,
  `gemini: { tools }`). The Vercel function does not pass them, so voice tool calls are not
  wired. End-to-end voice was not tested.
- **SSE streams.** `server/providers/ghostMaps.js` returns `text/event-stream`. Vercel
  serverless functions do not hold long-lived streams for this app. Not tested.
- **WebSocket upgrades of any kind** (the adapter has no `httpServer`).
- **Provider Settings / key-setup UI** (`/api/setup/*`). It writes `.env` into the checkout,
  which a serverless filesystem does not persist. The function leaves this plugin out.
  On Vercel, keys belong in project environment variables.
- **Disk caches.** Caches are written under `process.cwd()/.gev-cache` (for example CelesTrak,
  FIRMS, TomTom, Nominatim under `/tmp`). The function's working directory is expected to be
  read-only on Vercel (not verified), so those writes may fail. CelesTrak wraps its write in a
  try/catch, so its failure is non-fatal. The others were not checked. Caches are per instance and disappear
  when the instance is recycled.
- **Rate limits and budgets** are in-memory per instance. Vercel can run many instances, so
  they do not cap aggregate use. Use provider-side budgets (see `.env.example`).
- **Cold starts.** The first request on an instance pays the cost of loading all providers.

## Recommended path for full functionality

Run the existing container image (`Dockerfile`, `compose.yaml`) on a host that keeps a process
alive: Fly.io, Render, or Railway. The container runs `scripts/docker-start.mjs`, which
starts Vite on port 4173 bound to `0.0.0.0`. Set the same env vars in that host's settings.
Set `GEV_ALLOWED_HOSTS` to the public hostname, since Vite's Host check rejects other names.

Optionally, host the frontend on Vercel and point the browser at the container. This requires
a code change that is not in this slice (the browser currently calls relative `/api/*` paths).

## Environment variables

Names are taken from `.env.example`. Each one was checked against `process.env` reads in
`server/`, `src/`, `build/`, and `pinokio/`. "Layer" says where the value has to be set:

- **Build** = baked into the browser bundle at `npm run build` (Vite `define` in
  `server/standalone/vite.config.js`). Set it in the Vercel project's build environment.
  These values are visible to anyone with devtools. Restrict them in the provider console.
- **Function** = read at runtime by the serverless function. Set in the Vercel project
  settings (Production and Preview environments). Never prefix with `VITE_`.
- **Local only** = meaningful only for the dev server, the Docker/Pinokio launcher, or a
  local file on disk. Not useful on Vercel.

Build-layer (browser-visible, restrict them):

- `GOOGLE_MAPS_API_KEY`, `CESIUM_ION_TOKEN`, `MAPILLARY_CLIENT_TOKEN`, `PHOTON_URL` (build).
- `VITE_AIS_LIVE_API_URL`, `VITE_AIS_LIVE_MAX_ROWS`, `VITE_AIS_LIVE_LABEL_MAX_ROWS` (build, not secret).

Function, secret (server-only):

- `GOOGLE_MAPS_SERVER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `AISSTREAM_API_KEY`,
  `FIRMS_MAP_KEY`, `LIVEUAMAP_API_KEY`, `LL2_API_TOKEN`, `ONTARIO_511_API_KEY`,
  `TOMTOM_API_KEY`, `TFL_APP_KEY`, `WORLDNEWSAPI_KEY`, `OPENSKY_CLIENT_ID`,
  `OPENSKY_CLIENT_SECRET`, `OPENSKY_AUTH_MODE`.

Function, tuning and endpoints (non-secret):

- Rate limits: `GEV_RATELIMIT_GOOGLE_PER_MIN`, `GEV_RATELIMIT_OPENAI_PER_MIN`,
  `GEV_RATELIMIT_OPENAI_CHAT_PER_MIN`, `GEV_RATELIMIT_GEMINI_PER_MIN`. The `*_CHAT_PER_MIN`
  and `GEV_RATELIMIT_GEMINI_CHAT_PER_MIN` names are passed only by `pinokio/start.js`; no
  server code in `server/` reads them.
- Quotas: `NOMINATIM_URL`, `NOMINATIM_DAILY_CAP`, `TOMTOM_DAILY_TILE_BUDGET`,
  `WORLDNEWSAPI_DAILY_READS`, `INATURALIST_DAILY_BUDGET`.
- Models: `OPENAI_CHAT_MODEL`, `OPENAI_HUD_SUMMARY_MODEL`, `OPENAI_REALTIME_MODEL`,
  `OPENAI_REALTIME_MODEL_MINI`, `OPENAI_REALTIME_TRANSCRIBE_MODEL`, `OPENAI_REALTIME_VOICE`,
  `OPENAI_REALTIME_REASONING_EFFORT`, `OPENAI_REALTIME_CONTEXT_TOKENS`,
  `OPENAI_REALTIME_CONTEXT_RETENTION`, `GEMINI_CHAT_MODEL`, `GEMINI_LIVE_MODEL`.
- Feeds and upstreams: `AISSTREAM_URL`, `AISSTREAM_SILENCE_TIMEOUT_MS`,
  `AISSTREAM_MESSAGE_TYPES`, `AISSTREAM_BOUNDING_BOXES`, `OVERPASS_UPSTREAMS`,
  `RADIO_PRIORITY_COUNTRIES`, `GHOSTMAPS_POLL_SECONDS`, `GEV_NEWS_ORIGIN`,
  `GEV_LIBRARY_ENABLE`, `GEV_LIBRARY_DISABLE`, `GEV_VOICE_LOG_CONTENT`, `LOCAL_RECEIVER_FEEDS`.
- CCTV toggles and limits (function): `CCTV_MAX_SOURCES`, `CCTV_PREFER_AUSTIN`,
  `CCTV_FORCE_AUSTIN`, `CCTV_QUEBEC_VIDEO_ENABLED`, `CCTV_WORLD_CAMERAS_ENABLED`, and the
  per-source variables for each source (`CCTV_<SOURCE>_ENABLED`, `..._MAX_SOURCES`, and the
  URL, district, height, or video variants), using the exact names in `.env.example`.
  Sources covered: A22, Austin, Calgary, Caltrans, Catalonia, DriveBC, Fintraffic, Florida,
  Hong Kong, Houston, Iceland, King County, Lithuania, NSW, NYC, Ontario, Ottawa, Taiwan,
  Tallinn, Tarktee, TfL, Toronto, TxDOT, Vegvesen, WSDOT, Warendorf.
- Server-only flags: `GEV_PREFER_CODEX_OAUTH` (uses a local ChatGPT OAuth session on disk;
  local only).

Function, file paths (point into the bundled tree or absent on Vercel; likely unusable):

- `CCTV_SOURCES_FILE`, `CCTV_SOURCES_JSON`, `CCTV_TALLINN_SOURCES_FILE`,
  `CCTV_WARENDORF_SOURCES_FILE`, `CCTV_GROUND_HEIGHTS_FILE`, `RAIL_PATHS_DIR`,
  `OPENSKY_CREDENTIALS_FILE`, `OTTAWA_CAMERA_CERTIFICATE`, `CODEX_HOME`.

Local only (dev server, launcher, Docker, or Provider Settings):

- `HOST`, `PORT`, `GEV_ALLOWED_HOSTS`, `GEV_LAUNCHER`, `GEV_KEY_SETUP_EXTERNAL_KEYS`,
  `GEV_KEY_SETUP_TRUSTED_PEERS`, `GEV_EMBED_FRAME_ANCESTORS` (build-time framing header from
  `build/embed-framing.js`; set it if the frontend is embedded elsewhere).

## Security notes

- Never set a `VITE_`-prefixed variable to a secret. Vite exposes those to the browser.
  The build-layer names above are exposed by design; restrict them.
- Function-layer secrets must stay in the Vercel project's encrypted environment variables.
- `GEV_RATELIMIT_*` limits are per instance on Vercel. Set provider-side budgets and alerts.
