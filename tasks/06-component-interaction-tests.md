# 06 · Component and interaction tests

- **Status:** Done
- **Area:** Testing
- **Size:** Medium
- **Depends on:** –
- **Blocks:** –

## Goal

Add a client-side test project so Svelte components and user interactions are
covered, not just pure logic.

## Why

All 177 passing tests are logic-only: parser, renderer, playback timing, synth,
share encoding, migration, and the cloud store with mocked Firestore. Not one
component is mounted.

The untested paths are exactly the ones most likely to break and the ones hardest
to reason about from source:

- The **Save location** switch between browser-only and cloud.
- The title-conflict flow: **Update existing cloud tab** vs. **Open existing cloud tab**.
- Playback highlighting — clicking a bar, Shift+click to loop, the active-note outline.
- Collapsing the **Shorthand** editor and its error badge.
- The visibility segmented control staying in sync with **Copy live link**.

These involve confirmation dialogs and destructive operations on cloud data, so a
regression is expensive.

## Current state

[`vite.config.ts`](../vite.config.ts) defines a single project:

```ts
projects: [
	{
		extends: './vite.config.ts',
		test: {
			name: 'server',
			environment: 'node',
			include: ['src/**/*.{test,spec}.{js,ts}'],
			exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
		}
	}
];
```

The `exclude` reserves the `*.svelte.spec.ts` pattern for a client project that
was never added — the structure anticipates this task.

`expect: { requireAssertions: true }` is set globally; keep it.

## Scope

Add a second Vitest project named `client` that mounts components.

Recommended: `vitest-browser-svelte` with Playwright-provided Chromium, which is
the current SvelteKit recommendation and tests real layout and events. The
lighter alternative is `jsdom` + `@testing-library/svelte`, which is faster to set
up but cannot meaningfully test focus, pointer behaviour or Web Audio.

Either way:

- The new project must `include: ['src/**/*.svelte.{test,spec}.{js,ts}']` so the
  existing `server` project stays exactly as it is.
- `npm test` should run both projects.
- CI ([`.github/workflows/webapp.yml`](../.github/workflows/webapp.yml)) must
  install any browser binaries the chosen runner needs.

## Suggested first tests

Start with a thin vertical slice rather than broad coverage:

1. `CloudTabControls.svelte` — switching **Save location** to browser-only on a
   cloud tab asks for confirmation and does not delete anything until confirmed.
2. `PlayableTab.svelte` — clicking a bar's gutter button starts playback for that
   bar; clicking again stops it; Shift+click loops. Stub the player.
3. `ShorthandEditor.svelte` — invalid shorthand marks the token and, when
   collapsed, shows the error badge.

## Acceptance criteria

- `npm test` runs both projects and the existing 177 tests still pass unchanged.
- At least the three slices above are covered and genuinely fail when the
  behaviour is broken — verify by temporarily breaking each one.
- CI runs the new project; the job stays within a sensible time budget.
- Web Audio is stubbed, not actually started, so tests are deterministic and
  silent. `AudioContext` is unavailable in `jsdom` and restricted in headless
  browsers without a gesture.

## Validation

```sh
npm run lint && npm run check && npm test
```

Plus a CI run on a branch.

## Risks

- Browser-mode tests are slower and can be flaky in CI. Keep the set small and
  meaningful; this task is about establishing the harness and proving it catches
  real regressions, not about chasing a coverage number.
- `cloudStore` is a module-level singleton, so component tests need either a reset
  hook between tests or module mocking. Decide once and apply it consistently —
  leaking state between tests is the likeliest source of flakiness here.

## Coordination

Touches [`vite.config.ts`](../vite.config.ts) and the CI workflow. If
[05](./05-rules-tests-in-ci.md) runs at the same time, both edit
`.github/workflows/webapp.yml` — a small, easily-resolved overlap, but worth
sequencing. See [ROADMAP.md](./ROADMAP.md).

## Outcome

Implemented:

- Added a second Vitest project named `client` using `vitest-browser-svelte`,
  `@vitest/browser-playwright`, and headless Chromium. The existing `server`
  project keeps the same Node environment, include, and Svelte-spec exclude.
- Added deterministic browser setup that clears browser storage between tests and
  provides a silent `AudioContext`/`webkitAudioContext` stub. The playback slice
  also mocks `$lib/audio/player.svelte`, so no Web Audio scheduling or sound is
  started by component tests.
- Added browser component/route tests for:
  - `CloudTabControls.svelte`: moving a cloud tab to **Browser only** asks for
    confirmation and does not call `cloudStore.keepBrowserOnly()` until accepted.
  - `PlayableTab.svelte`: clicking a bar starts playback, clicking it again
    stops playback, and Shift+click passes `loop: true`.
  - `ShorthandEditor.svelte`: malformed shorthand receives the `hl-invalid`
    decoration and the editor exposes `aria-invalid="true"`.
  - `src/routes/tab/[id]/+page.svelte`: a collapsed invalid shorthand editor
    shows the `1 error` badge.
  - `src/routes/tab/[id]/+page.svelte`: the **Print** button renders for a valid
    tab and calls `window.print()`.
- Updated CI's existing `test` job to install Chromium with
  `npx playwright install --with-deps chromium` after `npm ci` and before
  `npm test`.
- Updated the README development commands with server/client project selectors
  and the browser install command.
- Added browser-test artifacts (`__screenshots__/`, `.vitest-attachments/`) to
  `.gitignore`.

Harness and singleton decisions:

- Chose Vitest browser mode rather than jsdom because the requested coverage is
  interaction-heavy and the installed Playwright 1.63.0 package uses Chromium
  revision 1243, matching the browser cache already present in the worktree
  environment.
- Handled `cloudStore` as a module mock in component tests rather than adding a
  reset hook to the production singleton. This keeps the tests on the public
  `cloudStore` surface (`get`, `tabs`, `user`, `saving`, `movingToBrowser`,
  `keepBrowserOnly`, etc.) without editing `src/lib/stores/cloud.svelte.ts`,
  which task 07 will refactor later.

Break-the-code proof:

- Temporarily changed `CloudTabControls.svelte` so the cloud-to-browser path
  skipped the confirmation condition. The CloudTabControls browser spec failed
  because `window.confirm` was not called. Restored the condition.
- Temporarily changed `PlayableTab.svelte` so bar playback always passed
  `loop: false`. The PlayableTab browser spec failed on the Shift+click
  expectation. Restored `loop: event.shiftKey`.
- Temporarily changed `ShorthandEditor.svelte` so token decorations ignored
  `tokenClass(token)`. The ShorthandEditor browser spec failed because no
  `.hl-invalid` span was rendered. Restored token-based classes.
- Temporarily changed `src/routes/tab/[id]/+page.svelte` so the collapsed error
  badge condition was disabled. The route browser spec failed to find the
  **Shorthand editor 1 error** trigger. Restored the badge condition.
- Temporarily changed the route `printTab()` handler to no-op. The route browser
  spec failed because `window.print()` was not called. Restored the handler.

Validation results:

- `npm run format` completed and left only the new/changed task files formatted.
- `npm run lint && npm run check && npm test && npm run build` passed.
  - `svelte-check`: 0 errors, 0 warnings.
  - Aggregate Vitest: 17 files passed, 1 skipped; 182 tests passed, 7 skipped.
  - Server project alone: 13 files passed, 1 skipped; 177 tests passed,
    7 skipped.
  - Client project alone: 4 files passed; 5 tests passed.
  - Production build completed successfully.
- `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color`
  passed with no findings.

Left out:

- No Firestore rules, indexes, Firebase deployment, Google federation, pushes,
  or restricted source testability hooks were added.
- GitHub Actions itself was not run locally. After the project manager pushes or
  opens a PR, verify that the `Build and test` job installs Chromium, runs the
  combined Vitest suite, and reports both the server and client project tests.
