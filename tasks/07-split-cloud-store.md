# 07 · Split the cloud store

- **Status:** Done
- **Area:** Maintainability
- **Size:** Medium
- **Depends on:** [01](./01-lazy-load-firebase.md) _(soft — heavy overlap)_
- **Blocks:** –

## Goal

Extract the upload/retry queue out of `CloudStore` so each piece has one
responsibility and can be tested in isolation.

## Why

[`src/lib/stores/cloud.svelte.ts`](../src/lib/stores/cloud.svelte.ts) is 543 lines
— the largest source file — and its spec
([`src/lib/cloud/store.spec.ts`](../src/lib/cloud/store.spec.ts)) is 687 lines,
the largest file in the repo. One class currently owns:

- Google auth lifecycle (`login`, `logout`, `onAuthStateChanged`)
- The account library listener (`onSnapshot`)
- Promoting browser tabs to the cloud (`syncBrowserTabs`, `promoteBrowserTabs`)
- The upload queue, retries and per-tab errors (`upload`, `uploadErrors`, `uploadAttempts`)
- Title-conflict resolution (`replaceFromLocal`)
- Visibility and share tokens (`setVisibility`, `save`)
- Deletion with local backup (`remove`, `keepBrowserOnly`)
- Per-account draft backup and the generation counter guarding account switches

The `generation` counter and the account-binding checks ("This pending cloud save
belongs to another account") are subtle correctness-critical logic that is hard to
see amid the rest.

## Non-goal

**This is a refactor. Behaviour must not change.** Every nuance currently covered
by the spec is a deliberate product decision — pending uploads bound to the
account that created them, backups written before cloud deletion, the generation
guard against stale async work after an account switch. None of it should be
"tidied away".

## Scope

Extract, in rough priority order:

1. **Upload queue** — pending state, per-tab errors, retry triggers, the
   `uploadAttempts` fingerprint dedupe, and account binding. The clearest seam and
   the most valuable extraction.
2. **Auth session** — user, `ready`, `busy`, login/logout, and the generation
   counter.
3. **Library listener** — the `onSnapshot` subscription and tab projection.

`CloudStore` remains the façade so components keep importing `cloudStore` and no
UI changes. Its reactive surface (`tabs`, `user`, `ready`, `busy`,
`uploadErrors`, …) must stay identical.

Split `store.spec.ts` along the same seams.

## Acceptance criteria

- The public surface used by components is unchanged; no `.svelte` file needs
  editing. Confirm with a repository-wide search for `cloudStore.`.
- All existing tests pass **without modifying their assertions**. Moving a test to
  a new file is fine; changing what it asserts means behaviour changed — stop and
  reconsider.
- `src/lib/stores/cloud.svelte.ts` is substantially smaller and each new module
  has a single clear responsibility.
- The generation guard and account binding remain intact and still covered.

## Validation

```sh
npm run lint && npm run check && npm test
```

If the emulator is available, also:

```sh
npm run test:rules
```

No rules, index, or document-schema changes — this is a pure client refactor. If
it starts changing document paths or query shapes, it has exceeded its scope.

## Risks

- Refactors of `$state` classes can quietly break reactivity: a value that stops
  being reactive still passes a unit test while the UI goes stale. Verify the
  library list, status badges and save indicators still update live in the browser.
- Heavy textual overlap with [01](./01-lazy-load-firebase.md), which also
  restructures this file's Firebase access. Running both at once guarantees a
  painful merge. Do 01 first — see [ROADMAP.md](./ROADMAP.md).
- Doing this _after_ [06](./06-component-interaction-tests.md) is attractive: real
  interaction tests give the refactor a safety net the current logic-only suite
  cannot.

## Outcome

Implemented the split with `cloudStore` kept as the public façade. No `.svelte`
files were edited.

Module map:

- `src/lib/stores/cloud.svelte.ts` — façade and orchestration. It keeps the
  public `cloudStore` properties and methods, delegates auth/listener/upload
  responsibilities, and still owns cloud edit/save/delete operations that span
  multiple seams (`dirty`, `saving`, `movingToBrowser`, timers, write promises,
  title/share save bookkeeping).
- `src/lib/cloud/auth-session.svelte.ts` — Auth state and lifecycle: `user`,
  `ready`, `busy`, `ensure()`, `startFromSessionHint()`,
  `skipInitialSessionCheck()`, `prewarmLogin()`, `login()`, `logout()`, session
  hint maintenance, synchronous cached `signInWithPopup` path, generation
  counter, and Firestore cache cleanup after sign-out.
- `src/lib/cloud/library-listener.svelte.ts` — account library listener:
  `onSnapshot`, cloud tab projection, saved title/share tracking, draft
  restore/cache, `loading`, `connectionFailed`, `offline`, and `pendingSync`.
- `src/lib/cloud/upload-queue.svelte.ts` — browser-tab cloud promotion queue:
  `syncBrowserTabs()`, upload attempt fingerprint dedupe, per-tab
  `uploadErrors`, account binding checks, explicit `upload()`, and
  `replaceFromLocal()`.
- `src/lib/cloud/errors.ts` — shared offline-error predicate for retry paths.

Line counts:

- Before: `src/lib/stores/cloud.svelte.ts` 700 lines;
  `src/lib/cloud/store.spec.ts` 742 lines.
- After:
  - `src/lib/stores/cloud.svelte.ts` 459 lines.
  - `src/lib/cloud/auth-session.svelte.ts` 145 lines.
  - `src/lib/cloud/library-listener.svelte.ts` 200 lines.
  - `src/lib/cloud/upload-queue.svelte.ts` 195 lines.
  - `src/lib/cloud/errors.ts` 7 lines.
  - Split cloud store specs: `store.spec.ts` 233 lines,
    `upload-queue.spec.ts` 293 lines, `auth-session.spec.ts` 60 lines,
    `library-listener.spec.ts` 48 lines, shared fixture 126 lines.

Surface and reactivity:

- Repository-wide `cloudStore.` scan was captured before and after. App and
  component usage is unchanged; the only scan movement is the test helper setup
  moving from `store.spec.ts` to `store.spec.fixtures.ts`.
- The member names used by components and component-test mocks remain available:
  `busy`, `connect`, `connectionFailed`, `create`, `dirty`, `ensure`, `error`,
  `get`, `keepBrowserOnly`, `loading`, `login`, `logout`, `movingToBrowser`,
  `offline`, `pendingSync`, `prewarmLogin`, `ready`, `remove`,
  `replaceFromLocal`, `save`, `saving`, `setVisibility`,
  `skipInitialSessionCheck`, `startFromSessionHint`, `tabs`, `update`, `upload`,
  `uploadErrors`, and `user`.
- `$state` remains live through the façade: auth, listener, and upload modules
  are `.svelte.ts` files that own their reactive fields, while the façade exposes
  getters/setters that delegate directly to those fields instead of copying
  values. `sorted` is still derived from the façade `tabs` getter.

Test split and counts:

- Moved existing cloud store tests unchanged along seams:
  - `upload-queue.spec.ts`: 18 tests.
  - `auth-session.spec.ts`: 3 tests.
  - `library-listener.spec.ts`: 3 tests.
  - Remaining façade/save/share/delete tests in `store.spec.ts`: 16 tests.
- Repo-wide `it(`/`test(` count before: 151. After: 151.
- Baseline before work: `npm test` passed with 20 files passed, 1 skipped; 200
  tests passed, 7 skipped.
- After split: `npm test` passed with 23 files passed, 1 skipped; 200 tests
  passed, 7 skipped.

Lazy Firebase / bundle check:

- No static `firebase/*` imports were added to the root bundle path.
- After `npm run build`, the
  `.svelte-kit/output/client/.vite/manifest.json` static import graph for the
  client app/start entry, root layout node, and root page node contained 23
  chunks and `firebaseStaticImports: []`.
- This preserves the pre-refactor lazy-Firebase outcome from task 01 (root graph
  had no Firebase static imports); Firebase remains reachable only through the
  lazy accessor and dynamic chunks.

Validation:

- `npm run lint && npm run check && npm test && npm run build` passed.
  - Prettier check passed.
  - ESLint passed.
  - `svelte-check`: 0 errors, 0 warnings.
  - Vitest aggregate: 23 files passed, 1 skipped; 200 tests passed, 7 skipped.
  - Production build completed and wrote `build/`.
- Required rules wrapper passed on port 8270:
  - Firestore rules node tests: 16 passed.
  - Cloud write integration Vitest: 1 file passed; 7 tests passed.

No Firestore document paths, queries, schemas, rules, or indexes changed. No
Firebase deployment or push was run.
