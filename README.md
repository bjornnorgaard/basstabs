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

| Input           | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `E3`            | Fret 3 on the E string (string names ignore case)           |
| `5`             | Fret 5 on the same string as the previous note              |
| `\|`            | Bar line, which ends the current measure                    |
| new line        | Starts a new row of tab                                     |
| `[Intro]`       | Names the section that follows (whole line only)            |
| `# Play softly` | Displays an annotation above the next row (whole line only) |

Each note gets its own column, and spaces between notes are optional. For
example, `A2E320` means `A2 E3 2 0`. Two-digit frets make their column wider.
Supported tunings are 4-string (EADG), 5-string (BEADG) and 6-string (BEADGC).

Use section names and annotations for structure, playing reminders, or rough
lyrics without aligning words to notes:

```text
[Verse 1]
# First lyric line: ...
E0 0 A2 2 | E0 0 3 A2 |

[Chorus]
# Play loudly
E3 3 A2 2 |
```

Headings and annotations are displayed in previews, copied tabs, and `.txt`
downloads. Both markers are recognized only at the start of their own line;
inline notes and section repeats are not yet supported.

## Playback

The tab view can play what you wrote as a sanity check. Use **Play all**, or hover
a section heading, row or bar and click it to play just that part. Shift+click
loops it; the loop button makes looping the default. The note currently sounding
is highlighted.

There is no rhythm in the syntax yet, so every bar lasts the same time (4 beats at
the chosen BPM) and is split evenly between its columns. Joined notes like `E320`
share one column's slot. Section headings and annotations are not played.

The **Sound design** page (`/sound`, the sliders icon in the header) shapes the
synthesised bass app-wide: exciter, Karplus–Strong string model (damping, decay,
stiffness, pickup), sine layer, drive, amp envelope, bus EQ and compressor, and
humanising. It has a test riff (written in the shorthand) to play once or loop at
any BPM, single test notes, and an A/B switch against the defaults. Changes apply
live and are saved in the browser. Settings can be copied, downloaded or pasted as
JSON; to make a sound the default, paste its values into `DEFAULT_SOUND` in
`src/lib/audio/sound.ts`.

## App

Built with SvelteKit and Skeleton UI (`vintage` theme, with light and dark mode).
Tabs are saved in the browser's `localStorage`. You can create, search, duplicate
and delete tabs, copy them to the clipboard, download them as `.txt`, or share
them as a link.

- Parser: `src/lib/tab/parser.ts`. New indicators go in the `TabEvent` union.
- Renderer: `src/lib/tab/render.ts`. `layoutBlocks` records where every note and bar
  lands in the text, which playback uses for highlighting.
- Playback: `src/lib/tab/playback.ts` (timing), `src/lib/audio/bass.ts` (synth),
  `src/lib/audio/sound.ts` (settings) and `src/lib/audio/player.svelte.ts` (Web Audio
  scheduling). No samples or libraries.
- Share links: `src/lib/tab/share.ts`
- Site metadata (name, description, URL, social preview image): `src/lib/site.ts`

### SEO

The app runs only in the browser, so `src/hooks.server.ts` adds the SEO tags to
the SPA shell at build time. These are the description, canonical URL, Open
Graph, Twitter card and JSON-LD tags. This way crawlers and link previews can
read them without running JavaScript. `robots.txt`, `sitemap.xml` and
`manifest.webmanifest` are pre-built from `src/lib/site.ts`. Tab and shared
pages are marked `noindex` because their content is private to each browser.
To change the preview image or any other site metadata, edit `src/lib/site.ts`.

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
