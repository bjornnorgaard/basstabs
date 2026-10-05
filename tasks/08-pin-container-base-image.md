# 08 · Pin the container base image

- **Status:** Not started
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
