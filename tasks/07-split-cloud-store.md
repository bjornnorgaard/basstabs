# 07 · Split the cloud store

- **Status:** Not started
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
