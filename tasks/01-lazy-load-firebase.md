# 01 · Lazy-load Firebase

- **Status:** Done
- **Area:** Performance
- **Size:** Medium
- **Depends on:** –
- **Blocks:** [02](./02-firestore-offline-persistence.md), [04](./04-firebase-app-check.md), [07](./07-split-cloud-store.md)

## Goal

Stop shipping the Firebase SDK to visitors who never use an account, by loading
`firebase/app`, `firebase/auth` and `firebase/firestore` on demand.

## Why

[`src/routes/+layout.svelte`](../src/routes/+layout.svelte) statically imports
[`$lib/stores/cloud.svelte`](../src/lib/stores/cloud.svelte.ts), which statically
imports [`$lib/firebase`](../src/lib/firebase.ts). Because the layout wraps every
route, Firebase lands in the shared entry chunk.

Measured on `main` (`npm run build`):

| Artifact                         | Raw    | Gzipped |
| -------------------------------- | ------ | ------- |
| Largest chunk (Firestore + Auth) | 540 KB | 160 KB  |
| All app JS                       | –      | ~348 KB |

So roughly **45% of the app's JavaScript** is Firebase, downloaded on first paint
even for a signed-out visitor who only writes local tabs. Local tabs, the parser,
the renderer, playback and sound design need none of it.

## Current state

- `src/lib/firebase.ts` calls `initializeApp` at module scope and exports `auth`
  and `db` as eagerly-created singletons.
- `src/lib/stores/cloud.svelte.ts` imports `auth`/`db` at module scope and
  `cloudStore` is a module-level `new CloudStore()` instance (line ~543).
- `src/routes/+layout.svelte` imports `cloudStore` to render
  [`AccountControls.svelte`](../src/lib/components/AccountControls.svelte),
  which renders a "Checking sign-in..." state from `cloudStore.ready`.
- `src/routes/public/+page.svelte` imports `db` and Firestore functions directly.

## Scope

Routes that legitimately need Firebase immediately:

- `/public` — reads `publishedTabs`.
- `/shared?id=<token>` — reads a live link. Note the **snapshot** form
  (`/shared#<payload>`) must stay Firebase-free; it decodes the tab from the URL.
- `/profile` — account page.

Everywhere else Firebase should load only when one of these happens:

1. The user clicks **Sign in with Google**.
2. A previous session is known to have been signed in (see persistence hint below).
3. A cloud-backed tab is opened.

### Persistence hint

Auth state lives in IndexedDB, so the app cannot know synchronously whether a user
is signed in without loading Auth. Write a small `localStorage` flag (e.g.
`basstabs:had-session`) when sign-in succeeds and clear it on sign-out. On boot,
only when the flag is present should the layout eagerly load the cloud module.
Without the flag, render the signed-out state immediately and skip the
"Checking sign-in..." placeholder — a visible improvement in its own right.

Treat the flag as a hint, never as authorization. Firestore rules remain the only
access control, and a stale flag must degrade to the signed-out state cleanly.

## Implementation outline

1. Convert `src/lib/firebase.ts` to an async accessor, e.g.
   `export async function getFirebase(): Promise<{ auth; db }>` that performs
   `await import('firebase/app')` etc. and memoizes the result in a module-level
   promise so concurrent callers share one initialization.
2. Give `CloudStore` an async internal `ensure()` that resolves the SDK before any
   Firestore/Auth call. Keep the module-level `cloudStore` export and its reactive
   surface (`ready`, `user`, `busy`, `tabs`, `uploadErrors`, …) synchronous so no
   component API changes — only the internals become lazy.
3. Make `cloudStore` start inert: `ready` should reflect "we have decided", which
   for a visitor without the flag is immediate and signed-out.
4. Convert `/public`, `/shared` and `/profile` to obtain Firestore through the
   async accessor.
5. Confirm with `npm run build` that the Firebase chunk is no longer reachable
   from the layout's entry graph.

## Acceptance criteria

- A signed-out visitor loading `/` downloads no Firebase chunk (verify in the
  Network panel, or by inspecting which chunks the root entry imports).
- Clicking **Sign in with Google** still works, and the popup is not blocked —
  **important:** `signInWithPopup` must be called within the user-gesture task.
  If the dynamic import is awaited first, Safari and Firefox may treat the popup
  as unsolicited. Pre-warm the import on `pointerdown`/hover, or open the popup
  from the click handler synchronously after a pre-resolved module.
- A returning signed-in user still lands on their cloud library without having to
  click anything, and sees no flash of the signed-out state beyond the existing
  "Checking sign-in..." indicator.
- `/public`, `/shared?id=…` and `/profile` work unchanged.
- `/shared#<payload>` snapshot links still render with no Firebase request at all.
- Sign-out clears the session hint, so the next visit is Firebase-free again.

## Validation

```sh
npm run lint && npm run check && npm test && npm run build
```

Then `npm run preview` and check the Network panel for `/` signed out, `/` with a
prior session, `/public`, `/shared#<payload>` and `/shared?id=<token>`.

No Firestore rules or indexes change, so no Firebase deployment is required.

## Risks

- **Popup blocking** is the main one — see acceptance criteria.
- The existing cloud test suite ([`src/lib/cloud/store.spec.ts`](../src/lib/cloud/store.spec.ts),
  687 lines) mocks the Firestore functions. Lazy loading changes where those
  mocks must be applied; expect to adjust the mock setup, not the assertions.
- Do not regress the pending-upload/retry behaviour while making the store async.

## Outcome

Implemented lazy Firebase loading without changing the synchronous `cloudStore`
surface used by components. `src/lib/firebase.ts` now exposes a memoized async
accessor and a cached/prewarm path; the cloud store remains a module-level export
but starts inert unless an account route, a live/public read, a sign-in action, a
cloud-backed operation, or the previous-session hint asks for Firebase.

Decisions:

- Used `localStorage` key `basstabs:had-session` as a hint only. Auth state and
  Firestore rules remain authoritative. The hint is written after successful
  sign-in/auth detection and cleared on sign-out or signed-out auth state.
- The root layout starts the auth check only when the hint exists. Snapshot share
  links (`/shared#<payload>`) explicitly skip that initial check so they make no
  Firebase request, even if the hint is stale.
- `/public`, `/shared?id=<token>`, and `/profile` load Firebase on demand.
- Sign-in buttons pre-warm Firebase on `pointerenter`, `focus`, and
  `pointerdown`. If the SDK is already cached, `cloudStore.login()` calls
  `signInWithPopup` synchronously in the click handler before any `await`; if the
  import is still unresolved, it falls back to awaiting the prewarm promise.
- `writeCloudTab` kept its public signature for integration tests and direct
  callers, but imports Firestore helpers lazily internally. The cloud store passes
  the already-loaded Firestore module when available.
- No Firestore rules or indexes changed, so no deployment was run.

Bundle proof (`npm run build`, inspecting
`.svelte-kit/output/client/.vite/manifest.json` static imports for `/`):

| Measurement                                | Before                     | After                                                  |
| ------------------------------------------ | -------------------------- | ------------------------------------------------------ |
| Root route initial JS static graph         | 726,675 raw / 227,442 gzip | 182,449 raw / 69,876 gzip                              |
| Layout node static graph                   | 708,233 raw / 219,105 gzip | 165,305 raw / 62,192 gzip                              |
| Firebase Firestore chunk in root graph     | 549,233 raw / 159,885 gzip | Not statically imported                                |
| Dynamic Firebase chunks after lazy loading | n/a                        | app 379 gzip, auth 35,926 gzip, firestore 160,560 gzip |

Validation:

- `npm run lint && npm run check && npm test && npm run build` passed.
  - `svelte-check`: 0 errors, 0 warnings.
  - Vitest unit suite: 13 files passed, 1 skipped; 177 tests passed, 7 skipped.
  - Production build completed successfully.
- Firestore wrapper passed on emulator port 8210:
  - Node rules tests: 16 passed.
  - Cloud write integration Vitest: 1 file passed; 7 tests passed.

Manual browser verification still recommended:

- Signed-out `/` load with no `basstabs:had-session` hint should not request
  Firebase chunks and should show the signed-out controls immediately.
- Hover/focus/pointer-down the sign-in button, then click it; the Google popup
  should open without being blocked.
- With a valid previous session hint, `/` should show the existing checking state
  while Firebase Auth loads, then reconnect the cloud library.
- `/shared#<payload>` should render a snapshot without Firebase network requests.
- `/shared?id=<token>`, `/public`, and `/profile` should load Firebase only when
  those routes are visited and continue to behave as before.
