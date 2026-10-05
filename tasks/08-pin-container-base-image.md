# 08 · Pin the container base image

- **Status:** Done
- **Area:** Build / supply chain
- **Size:** Small
- **Depends on:** –
- **Blocks:** –

## Goal

Pin the nginx base image to a digest, and make CI validate the nginx config
against the exact image the container actually ships.

## Why

[`Dockerfile`](../Dockerfile) and [`.github/workflows/webapp.yml`](../.github/workflows/webapp.yml)
independently name the same floating tag:

```dockerfile
FROM nginxinc/nginx-unprivileged:1.27-alpine
```

```yaml
nginxinc/nginx-unprivileged:1.27-alpine
nginx -t
```

Two problems:

1. **The tag floats.** `1.27-alpine` is republished, so the same commit can
   produce different images over time, and the CI check may validate against a
   different build than the one shipped.
2. **The duplication can drift.** Bump one and forget the other and the config
   check silently stops being meaningful.

The config check is genuinely valuable — it verifies nginx starts as UID 1000,
matching the "any non-root `runAsUser`" guarantee in the README — so it is worth
making trustworthy.

## Current state

- `Dockerfile` is a two-stage build: `node:24-bookworm-slim` → `nginx-unprivileged`.
- The CI step mounts [`docker/nginx.conf`](../docker/nginx.conf) and
  [`docker/default.conf`](../docker/default.conf) and runs `nginx -t` as UID 1000.
- `node:24-bookworm-slim` floats too, though it only affects the build stage.

## Scope

1. Pin the runtime image by digest:
   `FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:<digest>`. Keeping the tag
   alongside the digest preserves readability; the digest is what is enforced.
2. Remove the duplication so CI and the Dockerfile cannot disagree. Options:
   - Have the CI step parse the `FROM` line out of the `Dockerfile` (simplest,
     no new tooling, and the repo already uses small shell helpers in
     `.github/scripts/`).
   - Or build the image in the `test` job and run `nginx -t` inside it, which
     validates the real artifact.

   Prefer whichever keeps one source of truth.

3. Decide on the build stage. Pinning `node:24-bookworm-slim` by digest is
   consistent but means more upkeep; at minimum, document the choice.
4. Note how the digest gets updated. Dependabot understands Docker digests and
   the repo has no automated base-image updates today — worth considering so
   pinning does not quietly mean "never patched".

## Acceptance criteria

- `docker build` uses a digest-pinned runtime image.
- The nginx config check validates the same image reference as the Dockerfile,
  with the reference written in exactly one place.
- The container still: listens on 3000, runs as UID 101, works under a different
  non-root UID with a read-only root filesystem, and answers `/healthz` and
  `/readyz` with `200 ok`.
- The image job on `main` still pushes `ghcr.io/bjornnorgaard/basstabs/webapp:<tag>`
  and pins it into [`deploy/mimir/services.test.yaml`](../deploy/mimir/services.test.yaml).

## Validation

```sh
npm run build
docker build -t basstabs .
docker run --rm -p 3000:3000 basstabs
curl -fsS localhost:3000/healthz && curl -fsS localhost:3000/readyz
```

Read-only / alternate-UID check:

```sh
docker run --rm -p 3000:3000 --user 1000 --read-only --tmpfs /tmp basstabs
```

Then confirm the workflow passes on a branch.

## Risks

- Pinning without an update path leads to an unpatched base image. Pair the pin
  with Dependabot or a written update procedure.
- `deploy/` is excluded from Prettier because the pin scripts require
  `tag: "..."` in double quotes — do not reformat those files.

## Outcome

- Implemented runtime pinning with
  `nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0`.
  The digest was resolved on 2026-10-05 with `docker buildx imagetools inspect`
  and is the multi-arch image index digest, not a single-platform manifest.
- Kept `node:24-bookworm-slim` unpinned. It is a build-stage-only image, while
  the runtime image is the deployed supply-chain boundary this task set out to
  lock down. Leaving Node as the readable major tag also keeps the Docker build
  aligned with the GitHub Actions `actions/setup-node` Node 24 setup. Dependabot
  can still propose Docker updates if that decision changes later.
- Added `.github/scripts/runtime-image.sh` so the workflow's nginx config test
  derives the runtime image reference from `Dockerfile`; the reference is written
  in exactly one place.
- Added weekly Dependabot updates for Docker digests and GitHub Actions. The npm
  ecosystem was intentionally left out as out of scope.
- Updated the README Container section to document digest pinning, CI drift
  prevention, and Dependabot updates.
- Left `deploy/` untouched and did not change Firestore rules/indexes or contact
  Firebase.
- Validation passed locally:
  - `bash .github/scripts/runtime-image.sh`
  - CI-equivalent `nginx -t` using the derived image reference
  - `npm run lint && npm run check && npm test`
  - `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color`
  - `docker build -t basstabs-t08 .`
  - default container on host port 3088: `curl -fsS localhost:3088/healthz`,
    `curl -fsS localhost:3088/readyz`, and `curl -fsS localhost:3088/`
  - alternate UID/read-only container on host port 3088 with
    `--user 1000 --read-only --tmpfs /tmp`: the same three curl checks
- Manual follow-up: confirm GitHub opens Dependabot PRs for Docker and GitHub
  Actions on its next weekly schedule, and confirm the branch workflow passes
  after this work is pushed by the project manager.
