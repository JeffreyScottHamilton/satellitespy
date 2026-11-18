# Satellitespy

Satellitespy is a minimalist 3D globe for exploring public geospatial data: aircraft, vessels, satellites, weather, earthquakes, fires, transit and public cameras, drawn on a photorealistic or satellite basemap. It is built from open and publicly available sources, and it models events, assets, infrastructure and systems. It is not a surveillance tool, and it has no features for searching for, identifying or tracking individual people. It runs in a browser, with a small Node server that brokers provider requests.

> [!IMPORTANT]
> Satellitespy is an exploratory visualisation of public and third-party data. Data may be delayed, incomplete, modelled, inferred or wrong. Do not use it for flight or maritime navigation, emergency response, medical or health decisions, investment decisions, or other safety-critical or operational purposes. Verify important information with authoritative sources.

## Based on

Satellitespy is a redesigned fork of [gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu, released under the MIT licence. The original copyright and licence notice are preserved unchanged in [LICENSE](LICENSE). Third-party packages, data providers and fonts keep their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [DATA_SOURCES.md](DATA_SOURCES.md).

## Quick start

Requires Node `>=24.14.0 <25` or `>=26 <27` (see `engines` in `package.json`).

```bash
npm install
npm run dev
```

Open the address Vite prints (by default the server binds to localhost only). With no keys at all, the app starts on the keyless Esri World Imagery basemap, with OpenStreetMap available as an alternative, and every keyless layer works.

Useful scripts:

| Script                     | What it does                                                                 |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`              | Vite dev server with the provider plugins mounted under `/api`               |
| `npm run build`            | Production build of the static bundle into `dist/`                           |
| `npm test`                 | Unit tests (`scripts/run-unit-tests.mjs`)                                    |
| `npm run check:boundaries` | Checks module boundaries (see `docs/CODE-BOUNDARIES.md`)                     |
| `npm run doctor`           | Reports Node/npm readiness and which provider keys were found (never values) |

## Configuration

No key is required to start. Keys unlock specific features. Copy `.env.example` to `.env` (ignored by git) and fill in only what you need, or pass them as environment variables. The in-app Provider Settings panel can also write `.env` for you on a local dev server. It is disabled when the server is shared. Do not commit real keys.

| Variable                                          | Enables                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GOOGLE_MAPS_API_KEY`                             | Direct Google Photorealistic 3D Tiles, place search, Street View. Metered. Browser-exposed       |
| `GOOGLE_MAPS_SERVER_API_KEY`                      | Optional separate server-side key for Places and Street View Static. Falls back to the key above |
| `CESIUM_ION_TOKEN`                                | Ion-hosted Google 3D, world terrain, extra imagery. Browser-exposed                              |
| `OPENAI_API_KEY`                                  | Voice control and AI summaries. Metered                                                          |
| `GEMINI_API_KEY`                                  | Optional Gemini voice provider                                                                   |
| `AISSTREAM_API_KEY`                               | Live vessels (AIS). Needs a persistent process                                                   |
| `FIRMS_MAP_KEY`                                   | Live active fires (NASA FIRMS)                                                                   |
| `TOMTOM_API_KEY`                                  | Traffic flow colours                                                                             |
| `MAPILLARY_CLIENT_TOKEN`                          | Street Level coverage and photos. Browser-exposed by design                                      |
| `WORLDNEWSAPI_KEY`, `LIVEUAMAP_API_KEY`           | Optional News layer sections                                                                     |
| `OPENSKY_AUTH_MODE`, `OPENSKY_CLIENT_ID/SECRET`   | Higher OpenSky flight-polling allowance. Anonymous access works without them                     |
| `LL2_API_TOKEN`                                   | Optional higher Launch Library 2 limits                                                          |

`.env.example` is the authoritative list, including rate-limit and model settings. Check the variable names there before relying on this table.

Keys that reach the browser bundle (`GOOGLE_MAPS_API_KEY`, `CESIUM_ION_TOKEN`, `MAPILLARY_CLIENT_TOKEN`) are visible in devtools, so restrict them at the provider. Every other key stays on the server. See [SECURITY.md](SECURITY.md).

Metered keys can cost real money. App-level rate limits are per-IP and in-memory, and they are not billing caps, so set budgets and alerts with the provider. If you share your server on a LAN (`--host 0.0.0.0`), it brokers your configured keys to anyone who can reach it.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full detail. In summary:

- **Static and Vercel.** `npm run build` produces a static frontend. On Vercel, one serverless function (`api/gateway.mjs`) serves the stateless, request/response provider proxies. The Vercel setup has not been verified on a real deployment; the doc lists exactly what was and was not tested.
- **Keyed routes are off on Vercel by default.** Routes that spend a paid key (for example `/api/realtime/token`, `/api/openai/*`, `/api/google/nearby-places`) answer 403. Setting `SATELLITESPY_PUBLIC_KEYED_ROUTES=1` turns them on for everyone who can load the site. That lets anyone spend those keys, and only a per-instance in-memory rate limit applies. Enable it only with provider-side budgets and alerts, or behind authentication.
- **Persistent pieces need the Docker image.** The live AIS stream, realtime voice sessions, SSE and WebSocket routes, Provider Settings and persistent disk caches do not work on serverless. Run the Docker image (`Dockerfile`, `compose.yaml`) on a host that keeps a process alive, and set `GEV_ALLOWED_HOSTS` to the public hostname.

## Data honesty

Satellitespy labels what it shows. Data served from a cache, a stale copy, a bundled snapshot or a modelled estimate is marked as such in the interface and is never presented as live. Feeds that arrive minutes late are rendered as delayed. Where a live source fails, the fallback (a still image, a synthetic view, an earlier record set) is labelled as a fallback. Source credits appear in the on-globe "Data attribution" line, and each provider keeps its own licence.

## How it works

- **Stable icons.** Aircraft and ships point along their true heading at every camera angle.
- **Smooth motion from choppy data.** Live feeds arrive every 15 to 30 seconds, often late. The globe renders as far behind real time as the feed is late and interpolates between known fixes.
- **Satellites.** SGP4 propagation from CelesTrak TLEs.
- **Caching and request budgets.** An OpenSky credit governor, a TomTom daily tile budget and disk-cached TLEs reduce repeated requests. They do not replace provider quotas or billing controls.
- **Server-side credentials.** Every API that touches a private key is brokered through a server-side proxy with SSRF protection, response caps and sanitised errors.
- **Stack.** Vue 3 and Pinia for the interface, CesiumJS for the globe, Vite to build it.

```
src/
├── main.js        # Bootstrap: basemap, layer registration
├── ui/            # Vue views, Pinia stores, kit, controllers, styles
├── render/        # Cesium renderer and map stack
├── voice/         # Realtime voice session and tools
├── layers/        # Layer components
├── data/          # One module per layer, orchestration, bundled datasets
└── scenes/        # Scene director
server/providers/  # Provider plugins mounted under /api
```

See [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md) for the runtime reference.

## More documentation

[DATA_SOURCES.md](DATA_SOURCES.md) · [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) · [SECURITY.md](SECURITY.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [TESTING.md](TESTING.md) · [CHANGELOG.md](CHANGELOG.md)

## Licence

Code is MIT-licensed; see [LICENSE](LICENSE). The MIT grant covers source code only and does not extend to third-party data or visual assets.
