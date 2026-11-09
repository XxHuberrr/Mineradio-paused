# Third-party ports

## Cuefield AutoMix transition planner/runtime

- Upstream: `SLYysl/cuefield-mineradio`
- Reference revision: `c16f05a0bc731a49da7d42c135337fcac58f6dba`
- License: GNU GPL v3 (`GPL-3.0`)
- Port refresh date: 2026-08-01

Mineradio integrates the upstream cache-only transition planner, structure and
boundary evidence, recipe routing, preparation de-duplication, bounded bridge
and source-loop helpers, and advanced B-deck timeline actions. The runtime is
adapted to Mineradio's modular script loader, provider-aware beat-map cache,
existing AudioContext ownership transfer, finite source fallback, and the
already approved album-gapless crossmix path.

AutoMix remains opt-in and stops while disabled, paused, manually seeking, or
when album-gapless owns the next deck. Unsupported WebAudio actions degrade to
the volume-only/equal-power path instead of blocking normal queue advance. The
upstream optional remote-feedback service, monolithic Mineradio UI, private
audio URLs, account credentials, and raw local beat-map data are not included
or transmitted; ratings remain in the current user's local data directory.

## Mineradio-LX-Music desktop/home reference

- Upstream: `ww085213/Mineradio-LX-Music`
- Initial reference revision: `82826df814c32853d99697c0ee60f749a2fcad79`
- Homepage refresh revision: `812e2dc2e18bbc263e61dbd0206cb765e003d6e9`
- License: GNU GPL v3 (`GPL-3.0-only`)
- Port dates: 2026-07-18 (initial), 2026-07-19 (homepage refresh)

Mineradio's full desktop mode adapts the upstream idea of moving the existing
Electron main-window HWND between the Windows WorkerW desktop layer and an
interactive top-level window. The native attach/detach code in this project was
rewritten around the optimized edition's fail-closed WorkerW discovery, DPI
conversion, structured acknowledgements, serialized lifecycle, and cleanup
requirements.

The home dashboard adapts the upstream information hierarchy (continue,
library, daily recommendations, recent playback, today's listening, next up,
discovery, and radio entry points). Its data adapters use this project's current
multi-provider discovery, playlist, search, playback queue, and listen-history
state. Upstream LX-only server routes and the legacy standalone wallpaper
overlay were not copied.

The 2026-07-19 refresh additionally adapts the three-song "For You" strip,
stable cover-image swaps, in-place quick-card updates, daily-review hover
feedback, and compact-height scrolling/settings behavior. These features remain
implemented against Mineradio's existing provider, weather-radio, local-library,
queue, and playback modules rather than the upstream LX/local-only data model.

The combined application remains distributed under the repository's GNU GPL v3
license. Preserve this notice and the corresponding source when redistributing
modified builds.

## Qishui Passport Web QR authentication

- Upstream: `Wx2yZx/Mineradio-Qishui-QR-Login`
- Reference revision: `aaadaab7d011714f94fbe45b382ba8dcc7cf17b9`
- Declared license: `GPL-3.0-only`
- Port date: 2026-07-30

Mineradio ports only the official Passport Web QR authentication boundary:
an isolated hidden Electron security host, the Qishui web signing bootstrap,
QR creation and polling, account-session cookie persistence, and the official
second-verification UI when the service requests it. The upstream whole-project
installer was not run, and no application files were wholesale replaced.

The QR bridge feeds the authenticated cookie into Mineradio's existing
`qishui-api.js` provider. Search, playlists, likes, comments, entitlement checks,
and audio playback remain Mineradio implementations. Legacy token/manual-cookie
login controls and local SodaMusic cookie discovery are not exposed by the
current login UI.

The web security runtime resources under `qishui-auth-v6/` are retained
byte-for-byte for protocol compatibility and remain the property of their
respective rights holders. They are loaded only inside the isolated authentication
partition for the user's own official login session.
