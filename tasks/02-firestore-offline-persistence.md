# 02 · Firestore offline persistence

- **Status:** Not started
- **Area:** Offline / reliability
- **Size:** Small
- **Depends on:** [01](./01-lazy-load-firebase.md) _(soft — same file)_
- **Blocks:** –

## Goal

Let cloud-backed tabs open and accept edits without a connection, by enabling
Firestore's persistent local cache.

## Why

A bass player practising away from Wi-Fi is exactly the target user. Today
[`src/lib/firebase.ts`](../src/lib/firebase.ts) calls plain `getFirestore(app)`,
which uses the in-memory cache: with no connection a cloud tab cannot be read at
all, and a reload loses the warm cache. Browser-only tabs keep working because
they live in `localStorage` — the cloud path is the gap.

The README already promises "Cloud edits need a connection to save", so this
task also improves the documented behaviour.

## Current state

```ts
export const db = getFirestore(app);
```

The app already has a pending/failed-upload queue with **Retry save** in
[`src/lib/stores/cloud.svelte.ts`](../src/lib/stores/cloud.svelte.ts)
(`uploadErrors`, `syncBrowserTabs`, `upload`). This task **complements** that
machinery and must not duplicate or replace it.

## Scope

Change initialization to a persistent cache:

```ts
initializeFirestore(app, {
	localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
```

Use the multi-tab manager — the app is a single-page tool people plausibly open
in two tabs, and the single-tab manager throws `failed-precondition` for the
second one.

## Implementation outline

1. Swap `getFirestore` for `initializeFirestore` with `persistentLocalCache`.
2. Handle unsupported environments gracefully. Persistence is unavailable in
   private-browsing modes and some embedded webviews; catch the failure and fall
   back to the default cache rather than breaking cloud features entirely.
3. Surface connection state in the UI. The library listener already runs through
   `onSnapshot`; use snapshot metadata (`fromCache`, `hasPendingWrites`) to show
   an honest "Offline — changes will sync" status instead of an error that
   implies data loss.
4. Reconcile with the existing upload queue: an edit buffered by Firestore is
   _not_ a failed upload. Make sure such an edit does not appear as a failed save
   needing **Retry save**, and that it is not double-written when the connection
   returns.

## Acceptance criteria

- With the network throttled to offline in devtools, a previously-opened cloud
  tab still renders and remains editable.
- Edits made offline are written to the server once the connection returns,
  without the user pressing **Retry save**.
- Two browser tabs open at once both work; neither logs a `failed-precondition`
  persistence error.
- In a private-browsing window the app still loads and cloud features still work
  (just without persistence) rather than erroring.
- The offline state is communicated as pending sync, not as a failure.

## Validation

```sh
npm run lint && npm run check && npm test
```

Manual: devtools offline toggle, two-tab test, private window.

No Firestore rules or indexes change, so no Firebase deployment is required.

## Risks

- Last-write-wins still applies; offline editing on two devices can silently drop
  one side's changes. Do not claim conflict resolution in the docs.
- Persistent cache stores tab content in IndexedDB. The README tells users to sign
  out on shared computers — confirm that `signOut` plus the existing cleanup also
  clears the Firestore cache (`clearIndexedDbPersistence`, which must be called
  while no listeners are attached), and document the behaviour honestly.

## Coordination

Touches the same file as [01](./01-lazy-load-firebase.md) and
[04](./04-firebase-app-check.md). Do not run those in parallel with this one —
see [ROADMAP.md](./ROADMAP.md).
