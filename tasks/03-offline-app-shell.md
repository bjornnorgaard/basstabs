# 03 · Offline app shell (service worker)

- **Status:** Done
- **Area:** Offline / PWA
- **Size:** Medium
- **Depends on:** –
- **Blocks:** –

## Goal

Make the installed app usable offline by caching the app shell in a service
worker, so local tabs, the editor, playback and sound design work with no
connection.

## Why

[`src/routes/manifest.webmanifest/+server.ts`](../src/routes/manifest.webmanifest/+server.ts)
already advertises `display: standalone`, `start_url: /` and a scope, so browsers
offer to install the app. But nothing caches the shell, so an installed app opened
offline shows a blank page — even though the tabs themselves are already in
`localStorage` and the synth needs no network.

For a static SPA this is a small, self-contained change with a large perceived
benefit.

## Current state

- No `src/service-worker.ts` and no registration anywhere (`grep -rn "serviceWorker" src/` is empty).
- Build output is ~2.6 MB total, already precompressed (`precompress: true` in
  [`vite.config.ts`](../vite.config.ts)).
- [`docker/default.conf`](../docker/default.conf) serves `/_app/immutable/*` with
  a one-year cache and everything else `no-cache`, falling back to `200.html`.

## Scope

Add a SvelteKit service worker using the `$service-worker` module, which exposes
`build`, `files`, `prerendered` and `version`.

Caching strategy:

| Asset class                       | Strategy                                    |
| --------------------------------- | ------------------------------------------- |
| `build` (hashed immutable chunks) | Precache on install, cache-first            |
| `files` (static assets)           | Precache on install, cache-first            |
| Navigations (`200.html` shell)    | Network-first, fall back to cached shell    |
| Firestore / Google APIs           | **Never** intercept — pass straight through |

The last row matters: Firebase manages its own offline story (see
[02](./02-firestore-offline-persistence.md)) and a service worker caching auth or
Firestore traffic would cause stale or confusing results.

## Implementation outline

1. Create `src/service-worker.ts` using `$service-worker`'s `build`/`files`/`version`.
2. Precache on `install`, delete stale caches on `activate` keyed by `version`.
3. In `fetch`, ignore non-`GET` requests and any request whose origin is not the
   app's own. Serve precached assets from the cache; for navigations try the
   network first and fall back to the cached shell.
4. Register it. SvelteKit does not auto-register with `adapter-static`; add
   registration in [`src/routes/+layout.svelte`](../src/routes/+layout.svelte),
   guarded by `browser` and `import.meta.env.PROD` so `npm run dev` is unaffected.
5. Handle updates: when a new worker takes over, prompt the user or reload on the
   next navigation. A silently stale app is worse than no service worker.

## Acceptance criteria

- With devtools offline, a reload of `/` renders the app and local tabs open,
  render and play.
- `/sound` works offline (it is pure Web Audio).
- Opening a **cloud** tab offline fails with an honest message, not a blank page.
- Deploying a new version does not leave users stuck on an old shell — verify by
  building twice with a visible change and confirming the update path.
- `npm run dev` behaviour is unchanged; no service worker is registered.
- Signing out on a shared computer does not leave private tab content in the
  service-worker cache (the shell cache must contain only app assets, never API
  responses).

## Validation

```sh
npm run lint && npm run check && npm test && npm run build && npm run preview
```

Then: devtools → Application → Service Workers, plus an offline reload.

Also rebuild the container and confirm the worker is served correctly:

```sh
docker build -t basstabs . && docker run --rm -p 3000:3000 basstabs
```

The service worker file must be served with `no-cache` so updates are picked up —
check it does not accidentally fall under the `/_app/immutable/*` one-year rule in
[`docker/default.conf`](../docker/default.conf), and adjust nginx if needed.

## Risks

- A buggy service worker can pin users to a broken build with no easy recovery.
  Include a working update path and test it before considering this done.
- Do not cache `/shared?id=…` responses; live links must reflect real updates.

## Outcome

Implemented a SvelteKit service worker in `src/service-worker.ts` and a dedicated
production-only registration module in `src/lib/service-worker-registration.ts`.
SvelteKit's auto-registration is disabled deliberately so registration stays out
of `npm run dev` and the app owns the update prompt behavior.

Decisions:

- The worker caches only same-origin `GET` app assets and navigation shells. It
  never handles cross-origin Firebase, Google API, or avatar requests.
- Hashed build assets, static files and prerendered endpoint files are
  precached cache-first. `.br` and `.gz` outputs are filtered out so precompressed
  files are not redundantly precached.
- Navigations are network-first. On failure they fall back to the cached
  `200.html` shell; during `vite preview`, where `/200.html` is not directly
  served, the worker caches `/` under the shell key and normalizes it to the same
  base behavior as the adapter fallback.
- Successful queryless navigation shell responses may be cached by pathname, but
  query-string navigations such as `/shared?id=...` are not cached as their own
  entries.
- A newly installed worker calls `skipWaiting`/`clients.claim`; controlled pages
  show an "Update ready" toast asking the user to refresh.
- `docker/default.conf` now has an explicit `/service-worker.js` location with
  `Cache-Control: no-cache`, while immutable assets retain the one-year cache.

Validation:

- `npm run lint && npm run check && npm test && npm run build` passed.
  Vitest: 13 files passed, 1 skipped; 177 tests passed, 7 skipped.
- `npm run preview -- --port 4133 --host 127.0.0.1` plus a Playwright script
  passed offline checks for a created local tab reload, `/sound`, `/`, cache
  contents, no cross-origin cached entries, no `.br`/`.gz` cached entries, and no
  `/shared` query cached entries.
- Built twice with a temporary visible homepage text change and verified with
  Playwright that `registration.update()` installed the new worker, showed the
  "Update ready" toast, and loaded the visible changed text after refresh.
- Nginx config check passed using the CI-style `nginxinc/nginx-unprivileged`
  container as UID 1000.
- `docker build -t basstabs-t03 .` and
  `docker run --rm -d -p 3033:3000 basstabs-t03` passed. Header checks confirmed
  `/service-worker.js` returned `HTTP/1.1 200 OK` with `Cache-Control: no-cache`,
  and `/healthz` and `/readyz` returned `HTTP/1.1 200 OK`.

Left out:

- No Firebase rules/index changes were needed or deployed.
- Manual browser checks should still confirm real audio playback under DevTools
  offline mode, because the automated check verifies route rendering rather than
  listening to generated sound.
