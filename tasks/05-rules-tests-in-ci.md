# 05 · Run Firestore rules tests in CI

- **Status:** In progress
- **Area:** CI / safety
- **Size:** Small
- **Depends on:** –
- **Blocks:** –

## Goal

Run `npm run test:rules` in GitHub Actions so rules regressions are caught before
they reach the shared Firebase project.

## Why

[`firestore.rules`](../firestore.rules) (145 lines) is the only thing enforcing
tab ownership, the private/unlisted/public visibility model, and the requirement
that a published projection matches its canonical tab. The repository already has
a thorough emulator suite — [`tests/firestore.rules.test.mjs`](../tests/firestore.rules.test.mjs)
and [`src/lib/cloud/write.integration.spec.ts`](../src/lib/cloud/write.integration.spec.ts) —
but [`.github/workflows/webapp.yml`](../.github/workflows/webapp.yml) never runs it.

CI today runs: `lint`, `check`, `test`, `build`, and an nginx config check. The
most security-sensitive surface in the repo is the one surface CI does not cover.

This matters more than usual here because [AGENTS.md](../AGENTS.md) makes rules
deployment an explicit pre-push obligation for the agent making the change, and
test/production share one project — a bad rules push affects live users at once.

## Current state

```json
"test:rules": "firebase emulators:exec --only firestore --project demo-basstabs \"node --test tests/firestore.rules.test.mjs && vitest --run src/lib/cloud/write.integration.spec.ts\""
```

- `firebase-tools` is already a dev dependency, so `npm ci` installs it.
- `demo-basstabs` is an emulator-only project id and never touches real data.
- `src/lib/cloud/write.integration.spec.ts` is `describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)`,
  so it already skips silently outside the emulator — which is why the current
  `npm test` run reports 7 skipped tests.
- The emulator requires **Java 21 or newer**.

## Scope

Add a job to `.github/workflows/webapp.yml` that installs a JDK and runs
`npm run test:rules`.

Decisions to make:

- **Separate job vs. a step in `test`.** A separate `rules` job runs in parallel
  with the existing one and keeps the failure signal legible. Prefer that, and
  make the `image` job depend on both.
- **JDK**: `actions/setup-java@v5` with Temurin 21.
- **Caching**: `npm ci` is already cached via `actions/setup-node`. The emulator
  jar is downloaded on each run; cache `~/.cache/firebase/emulators` if the
  download proves slow or flaky.
- Keep `timeout-minutes` set, consistent with the existing jobs.

Note the workflow's `paths-ignore` list skips `deploy/**` and `**/*.md`. Rules
live at the repo root, so they are already covered — but confirm that a change to
`firestore.rules` or `firestore.indexes.json` alone does trigger the workflow.

## Acceptance criteria

- A pull request that weakens `firestore.rules` fails CI. Verify this
  deliberately on a scratch branch (for example by allowing a non-owner write)
  and confirm the job goes red, then revert.
- A normal pull request passes and the new job adds no more than a couple of
  minutes.
- The 7 currently-skipped integration tests actually **run** in the new job —
  check the job output for the executed count, not just a green tick. A silently
  skipping job is the main failure mode here and provides false assurance.
- The workflow still builds and pushes the image on `main` as before.

## Validation

Locally first (requires Java 21+):

```sh
npm run test:rules
```

Then push a branch and confirm the job runs on the pull request.

## Risks

- **False assurance** if the emulator does not start and the specs skip instead of
  failing. Consider asserting that `FIRESTORE_EMULATOR_HOST` is set, so a missing
  emulator is a hard error rather than a skip.
- Do not add any Firebase credentials or Google federation to CI. This job uses
  the local emulator and the `demo-basstabs` project id only. Deployment stays a
  manual, agent-performed step per [AGENTS.md](../AGENTS.md).
