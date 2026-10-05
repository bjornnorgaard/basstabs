# 04 · Firebase App Check

- **Status:** Blocked — client code shipped (inert until a site key is configured); waiting on the owner to do the console setup, monitor metrics and decide on enforcement. See Outcome.
- **Area:** Security / cost control
- **Size:** Medium
- **Depends on:** [01](./01-lazy-load-firebase.md) _(soft — same file)_
- **Blocks:** –

## Goal

Attest that Firestore traffic comes from the real app, to limit anonymous abuse of
the world-readable public library.

## Why

`publishedTabs` is deliberately readable without authentication so that public
tabs and unlisted live links work for guests. That is correct for the product, but
it means anyone with the (public, by design) Firebase web config can script reads
and burn through the project's quota. The README already names this as an
unmitigated risk:

> Monitor Firestore usage: public reads and live listeners consume quota. App Check
> can reduce abuse once configured, but it does not replace Security Rules.

App Check is the supported mitigation and requires **no relaxation of
[`firestore.rules`](../firestore.rules)**.

## Current state

- [`src/lib/firebase.ts`](../src/lib/firebase.ts) initializes App, Auth and
  Firestore only. No App Check.
- Test and production share the Firebase project `basstabs-by-bear`.

## Scope

1. **Console setup** (requires the project owner — likely the repo owner, not the
   agent): register the app with reCAPTCHA Enterprise, obtain the site key, and
   keep enforcement **off** initially.
2. **Client**: initialize App Check with `ReCaptchaEnterpriseProvider` before any
   Firestore or Auth call.
3. **Debug tokens**: local development and the Firestore emulator need
   `self.FIREBASE_APPCHECK_DEBUG_TOKEN`. Wire this up behind a dev-only guard so
   `npm run dev` and `npm run test:rules` keep working. Never commit a debug token.
4. **Monitor, then enforce**: App Check has a metrics phase showing the share of
   verified requests. Only after the deployed clients report near-100% verified
   should enforcement be switched on.

## Staged rollout — required

Both the test and production sites use the same Firebase project, so enabling
enforcement affects live users immediately. Follow this order and do not skip the
monitoring window:

1. Ship the client that _sends_ App Check tokens. Enforcement stays off; nothing
   breaks for anyone.
2. Watch the App Check metrics until the deployed clients are overwhelmingly
   verified.
3. Only then enable enforcement for Firestore.

Enabling enforcement before step 2 will break every client that has not yet
updated, including the public library for guests.

## Acceptance criteria

- The app initializes App Check in production and attaches tokens to Firestore
  requests.
- Signed-out guests can still read `/public` and `/shared?id=…`.
- `npm run dev` works without a reCAPTCHA round trip, via a debug token.
- `npm run test:rules` still passes against the emulator.
- No secret, debug token, or reCAPTCHA secret key is committed. The reCAPTCHA
  _site_ key is public by design, like the rest of the web config.
- Documentation records the enforcement state, so a later agent knows whether
  step 3 has happened.

## Validation

```sh
npm run lint && npm run check && npm test && npm run test:rules
```

`npm run test:rules` requires Java 21 or newer.

No rules or index changes are expected. If this task does end up touching
[`firestore.rules`](../firestore.rules), follow the mandatory deployment
procedure in [AGENTS.md](../AGENTS.md) **before** pushing the client.

## Risks

- **Do not enable enforcement in the same change that ships the client.** That is
  the single way this task can take the site down.
- App Check is not authorization. Keep the rules exactly as strict as they are.
- Requires console access the agent may not have. If so, implement the client and
  the documentation, and hand the console steps back to the repo owner explicitly
  rather than marking the task complete.

## Coordination

Touches [`src/lib/firebase.ts`](../src/lib/firebase.ts), shared with
[01](./01-lazy-load-firebase.md) and [02](./02-firestore-offline-persistence.md).
Do not run those in parallel — see [ROADMAP.md](./ROADMAP.md).

## Outcome

- Client implementation is ready in [`src/lib/firebase.ts`](../src/lib/firebase.ts).
  App Check is initialized inside the existing lazy Firebase path, after the app
  is available and before Auth or Firestore are used. The `firebase/app-check`
  module is dynamically imported only when a site key is configured, so the root
  bundle does not gain a static Firebase import and unset builds behave as before.
- The optional build-time public env var is
  `PUBLIC_FIREBASE_APPCHECK_SITE_KEY`. The app reads it through
  a namespace import of `$env/static/public`, so the key can be absent without a
  missing named export or build failure. (PM integration fix: the agent first used
  `$env/dynamic/public`, but that makes every page load fetch `/_app/env.js`,
  which the task 03 service worker does not precache, and offline reloads broke.
  Static env inlines the key at build time, which is when CI and the Dockerfile
  provide it anyway.)
- Dev-only debug token support uses
  `PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` when set. If the site key is configured
  in dev and no explicit debug token is provided, `self.FIREBASE_APPCHECK_DEBUG_TOKEN`
  is set to `true` so the SDK generates and logs a token. Production builds never
  set the debug token. [`/.env.example`](../.env.example) documents empty values;
  [`.gitignore`](../.gitignore) already keeps real `.env` files ignored.
- CI and image builds accept the optional site key through the GitHub Actions
  repository variable `PUBLIC_FIREBASE_APPCHECK_SITE_KEY`. The
  [`Dockerfile`](../Dockerfile) receives it as `ARG`/`ENV` for the static build.
  Leaving it unset keeps App Check disabled.
- If App Check initialization fails, including when reCAPTCHA is blocked, the app
  logs a warning and continues without App Check. Enforcement is still off, so
  Firestore/Auth behavior is unchanged in that failure mode.
- **Enforcement state: OFF.** Test and production share Firebase project
  `basstabs-by-bear`; enabling enforcement would affect both immediately.

Owner console steps still pending:

1. In the Firebase console for project `basstabs-by-bear`, open **App Check**.
2. Register the web app with the reCAPTCHA Enterprise provider for the test and
   production site domains.
3. Copy the reCAPTCHA Enterprise site key. It is public by design; do not create
   or commit a secret key.
4. Add the key as `PUBLIC_FIREBASE_APPCHECK_SITE_KEY` locally and as the GitHub
   Actions repository variable `PUBLIC_FIREBASE_APPCHECK_SITE_KEY` if CI builds
   should include App Check.
5. Keep Firestore enforcement off. Ship the client first, then monitor Firebase
   App Check metrics until deployed clients are near-100% verified.
6. Only after that metrics window should the owner enable Firestore enforcement.

Validation performed:

- `npm run test:unit -- --run --project server src/lib/firebase.spec.ts`: 8
  passed.
- `npm run lint`: passed.
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 20 test files passed, 1 skipped; 205 tests passed, 7 skipped.
- `npm run build`: passed.
- `PUBLIC_FIREBASE_APPCHECK_SITE_KEY=dummy npm run build`: passed.
  App Check compiled when configured.
- Manifest inspection after the dummy-key build: 10 entry chunks, 0 entry App
  Check matches; App Check appears only as one dynamic entry
  (`node_modules/firebase/app-check/dist/esm/index.esm.js`).
- `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color`:
  passed.
- `bash /home/bjorn/.copilot/session-state/fda041df-3d4b-48f0-86a8-5b05eefa76bf/files/test-rules.sh /home/bjorn/Code/basstabs.worktrees/04-firebase-app-check 8240`:
  passed: 16 node rules tests passed and 7 Vitest integration tests passed.
