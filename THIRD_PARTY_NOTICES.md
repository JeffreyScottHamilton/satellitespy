# Third-party software notices

The project depends on third-party npm packages whose own licenses apply. This
file records the packages added for the browser-local SDR feature, the
Street Level viewer, the Data Library's GeoParquet reader and the GNSS Integrity
layer's hexagon grid; the complete resolved dependency inventory remains in
`package-lock.json`.

## Satellitespy and its upstream

Satellitespy is a fork of [gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu (MIT). The original copyright and licence notice are preserved in `LICENSE`.

## Data providers and services

The app fetches data from the providers below at runtime. The MIT licence covers this project's source code only; each provider's data and service terms apply separately. Links point to terms the repo already records in [DATA_SOURCES.md](DATA_SOURCES.md), which lists many more providers (transit feeds, bikeshare, city cameras, bundled datasets) with their licences and attributions. Where the repo states no terms, the line says so. Terms change, so verify them yourself.

| Provider | Terms |
| --- | --- |
| Google Maps Platform (Map Tiles / Photorealistic 3D Tiles, Places, Geocoding, Street View) | [Google Maps Platform ToS](https://cloud.google.com/maps-platform/terms): your own key and billing. Required credits must stay visible |
| Cesium ion (Google 3D via ion, terrain, imagery) | [Cesium ion pricing and eligibility](https://cesium.com/platform/cesium-ion/pricing/): the free Community plan is for eligible personal/non-commercial use with quotas |
| OpenStreetMap (data, Nominatim, OpenFreeMap / OpenMapTiles vector tiles) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), (c) OpenStreetMap contributors |
| Esri World Imagery | [Esri Master Agreement](https://www.esri.com/en-us/legal/terms/full-master-agreement) (public use with attribution) |
| Mapillary | [Mapillary terms](https://www.mapillary.com/terms); imagery CC BY-SA 4.0 |
| KartaView, Panoramax | Imagery CC BY-SA 4.0 (KartaView); per-picture licences (Panoramax). See DATA_SOURCES.md |
| OpenSky Network | Non-commercial research/education licence, per DATA_SOURCES.md. See also [docs/opensky-auth.md](docs/opensky-auth.md) |
| adsb.lol | ODbL 1.0 |
| adsbdb, Planespotters.net, Open Vessel Photos | Terms per DATA_SOURCES.md; [Planespotters photo API terms](https://www.planespotters.net/photo/api) |
| AISStream.io | Free, beta, no formal ToS per DATA_SOURCES.md; AIS is a public broadcast |
| CelesTrak | US-government-origin data, no licence; citation requested |
| The Space Devs, Launch Library 2 | [Terms of use](https://github.com/TheSpaceDevs/Tutorials/blob/main/faqs/faq_TSD.md#terms-of-use) |
| NASA FIRMS, NASA GIBS / CMR | U.S. public domain (NASA); FIRMS acknowledgement in DATA_SOURCES.md |
| USGS | U.S. public domain |
| NOAA (GFS, nowCOAST, NHC/CPHC) | [NOAA disclaimer](https://oceanservice.noaa.gov/disclaimer.html), [NWS public-data terms](https://www.weather.gov/disclaimer) |
| ECMWF Open Data | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and [ECMWF Terms of Use](https://apps.ecmwf.int/datasets/licences/general/) |
| Open-Meteo | [Licence](https://open-meteo.com/en/licence) (CC BY 4.0, attribution link) |
| Environment and Climate Change Canada | [End-use Licence](https://eccc-msc.github.io/open-data/licence/readme_en/) |
| TomTom Traffic | [TomTom terms](https://docs.tomtom.com/legal/terms-and-conditions): your own key |
| GDELT | [GDELT terms of use](https://www.gdeltproject.org/about.html#termsofuse) |
| World News API | [Terms](https://worldnewsapi.com/terms/): caching needs its prior written permission |
| Radio Browser | Directory data PDDL 1.0; individual stream terms apply |
| Photon (komoot) | [Fair use](https://photon.komoot.io); data ODbL 1.0 |
| OpenAI (Realtime voice, chat) | terms not audited, check before production use |
| Google Gemini (voice, chat) | terms not audited, check before production use |
| Overpass API (optional, self-configured upstreams) | terms not audited, check before production use. The underlying data is OSM ODbL 1.0 |
| Liveuamap (optional, paid) | Operator's own subscription terms; not audited here, check before production use |
| Vercel (optional hosting) | terms not audited, check before production use |

## Fonts and icons

- Inter (the `@fontsource-variable/inter` package): SIL Open Font License 1.1, as shipped in the package's own licence file.
- Noto Sans Arabic and Noto Sans Hebrew: loaded from Google Fonts. Licence not recorded in this repo (Google publishes Noto under the SIL OFL): terms not audited, check before production use.
- Material Symbols Outlined: loaded from Google Fonts as a glyph subset. Licence not recorded in this repo (Google publishes it under Apache-2.0): terms not audited, check before production use.

Loading fonts from `fonts.googleapis.com` makes the browser contact Google. Self-host them if that matters for your deployment.

## CesiumJS

- Package: `cesium` (the 3D globe engine, with `vite-plugin-cesium`)
- Source: <https://github.com/CesiumGS/cesium>
- License: Apache License 2.0
- License text: <https://www.apache.org/licenses/LICENSE-2.0>
- Cesium's on-globe credits must stay visible.

## Web RTL-SDR

- Package: `@jtarrio/webrtlsdr` 3.0.6
- Author: Jacobo Tarrio Barreiro; portions copyright Google Inc.
- Source: <https://github.com/jtarrio/webrtlsdr>
- License: Apache License 2.0
- License text: <https://www.apache.org/licenses/LICENSE-2.0>

## Signals

- Package: `@jtarrio/signals` 0.10.1
- Author: Jacobo Tarrio Barreiro
- Source: <https://github.com/jtarrio/signals>
- License: Apache License 2.0
- License text: <https://www.apache.org/licenses/LICENSE-2.0>

## MapillaryJS

- Package: `mapillary-js` 4.1.2 (loaded on demand by the Street Level viewer,
  with its stylesheet `dist/mapillary.css`)
- Author: Copyright (c) Facebook, Inc. and its affiliates
- Source: <https://github.com/mapillary/mapillary-js>
- License: MIT
- License text: <https://github.com/mapillary/mapillary-js/blob/main/LICENSE>

## RxJS (MapillaryJS dependency)

- Package: `rxjs` 7.8.2
- Author: Google, Inc., Netflix, Inc., Microsoft Corp. and contributors
- Source: <https://github.com/ReactiveX/rxjs>
- License: Apache License 2.0
- License text: <https://www.apache.org/licenses/LICENSE-2.0>

## three.js (MapillaryJS dependency)

- Package: `three` 0.134.0
- Author: Copyright © 2010-2021 three.js authors
- Source: <https://github.com/mrdoob/three.js>
- License: MIT
- License text: <https://github.com/mrdoob/three.js/blob/dev/LICENSE>

## hyparquet

- Package: `hyparquet` 1.31.2 (loaded on demand when a Data Library
  GeoParquet entry is switched on)
- Author: Hyperparam
- Source: <https://github.com/hyparam/hyparquet>
- License: MIT

## fzstd (hyparquet ZSTD decompressor)

- Package: `fzstd` 0.1.1
- Author: Copyright (c) 2020 Arjun Barrett
- Source: <https://github.com/101arrowz/fzstd>
- License: MIT

## kdbush

- Package: `kdbush` 4.0.2 (the screen index that groups points drawn too
  close together into clusters)
- Author: Copyright (c) 2018, Vladimir Agafonkin
- Source: <https://github.com/mourner/kdbush>
- License: ISC

## H3 (h3-js)

- Package: `h3-js` 4.4.0 (the GNSS Integrity layer's H3 hexagon cells)
- Author: Copyright 2017-2021 Uber Technologies, Inc. (includes the H3 C
  library 4.4.1, compiled to JavaScript)
- Source: <https://github.com/uber/h3-js>
- License: Apache License 2.0
- License text: <https://www.apache.org/licenses/LICENSE-2.0>
