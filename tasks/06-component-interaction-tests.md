# 06 · Component and interaction tests

- **Status:** Not started
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
