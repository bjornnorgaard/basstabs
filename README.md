# basstabs by bear

Lives at [basstabs.bybear.dk](https://basstabs.bybear.dk).

Given input syntax

```our syntax
E0 0 A2 2 |E0 0 3 A2 |
```

Desired output

```basstabs
G|--------|--------|
D|--------|--------|
A|----2-2-|------2-|
E|0-0-----|0-0-3---|
```

## Syntax

| Input    | Meaning                                             |
| -------- | --------------------------------------------------- |
| `E3`     | Fret 3 on the E string (string names ignore case)   |
| `5`      | Fret 5 on the same string as the previous note      |
| `A2E320` | Compact notes: `A2 E3 2 0` (each digit is one fret) |
| `\|`     | Bar line, which ends the current measure            |
| new line | Starts a new row of tab                             |

Each note gets its own column. Two-digit frets make their column wider.
Compact notes appear side by side; their measure is padded to the width of the longest measure.
Use spaces around multi-digit frets when writing compact notes (for example, `A12 E10`).
Supported tunings are 4-string (EADG), 5-string (BEADG) and 6-string (BEADGC).

## App

Built with SvelteKit and Skeleton UI (`vintage` theme, with light and dark mode).
Tabs are saved in the browser's `localStorage`. You can create, search, duplicate
and delete tabs, copy them to the clipboard, download them as `.txt`, or share
them as a link.

- Parser: `src/lib/tab/parser.ts`. New indicators go in the `TabEvent` union.
- Renderer: `src/lib/tab/render.ts`
- Share links: `src/lib/tab/share.ts`

### Sharing

**Share link** on a tab page copies a URL like
`https://basstabs.bybear.dk/shared#<payload>` to the clipboard. The payload is
the title, artist, tuning and shorthand, base64url encoded in the hash, so the
whole tab travels inside the link and never touches a server. Opening the link
shows the rendered tab with a **Save to my tabs** button that stores an editable
copy in that browser.

```sh
npm install
npm run dev      # start the dev server
npm test         # run the parser/renderer unit tests
npm run build    # build a static site into build/
```

## Container

The image is a static build served by `nginx-unprivileged`, so there is no Node
runtime. It idles at a few MiB of RAM.

- Listens on port **3000** and runs as UID 101. It also works with any non-root
  `runAsUser` and `readOnlyRootFilesystem: true`, as long as `/tmp` is a
  writable `emptyDir`.
- `GET /healthz` (liveness) and `GET /readyz` (readiness) return `200 ok` without
  authentication.
- `/_app/immutable/*` is cached for a year. Every other path gets `no-cache` and
  falls back to the app (`200.html`).

## Deploy (Mimir)

- `.github/workflows/webapp.yml`: pull requests are built and tested only. On `main`,
  CI builds and tests, pushes `ghcr.io/bjornnorgaard/basstabs/webapp:<yy.mm.dd-HH.MM-sha>`,
  and pins that tag into `deploy/mimir/services.test.yaml` (service key `web`).
- `.github/workflows/production.yml`: run it manually to copy the test tag into
  `deploy/mimir/services.prod.yaml`. It never runs automatically.
- `deploy/` is excluded from Prettier because the pin script requires
  `tag: "..."` in double quotes.

```sh
docker build -t basstabs .
docker run --rm -p 3000:3000 basstabs
```
