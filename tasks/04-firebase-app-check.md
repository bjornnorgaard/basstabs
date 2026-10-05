# 04 · Firebase App Check

- **Status:** In progress
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
