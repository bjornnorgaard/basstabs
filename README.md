# basstabs by bear

Lives at [basstabs.bybear.dk](https://basstabs.bybear.dk).

Planned work is tracked in [tasks/](./tasks/README.md), with dependencies and
parallelisable work in [tasks/ROADMAP.md](./tasks/ROADMAP.md).

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
| `E[12]3`        | Fret 12 on E, immediately followed by fret 3                |
| `E123`          | Joined frets 1, 2, and 3 on E                               |
| `[12]` in a bar | Fret 12 on the previous string                              |
| `\|`            | Bar line, which ends the current measure                    |
| new line        | Starts a new row of tab                                     |
| `[Intro]`       | Names the section that follows (whole line only)            |
| `# Play softly` | Displays an annotation above the next row (whole line only) |

Every fret digit and every space inside a bar occupies exactly one tab column;
string letters, fret brackets, and bar lines occupy none. No extra columns are added. For
example, `|E4320|` renders `E|4320|`, while `|E1       |` renders
`E|1-------|`. Spaces before or between notes also become blank columns, and
bars in the same row can have different widths. A row without a final bar line
ends immediately after its last written character. Adjacent notes such as
`A2E320` mean `A2 E3 2 0`. Every unbracketed digit is a separate fret:
`E12` means `E1 E2`, while `E[12]` is one note at fret 12 and occupies two columns.
Use `E[12]3` for joined frets 12 and 3, or `E[12] 3` to separate them.
A bare bracketed fret reuses the previous string. Whole-line bracketed text is
always a section heading, including `[12]`; use `|[12]|` for a lone bare fret.
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
the chosen BPM), regardless of its written width. Playback divides a bar evenly
between its note groups, not its spaces; joined notes like `E320` share a group's
slot. Fully blank bars are silent. Section headings and annotations are not played.

The **Sound design** page (`/sound`, the sliders icon in the header) shapes the
synthesised bass app-wide: exciter, Karplus–Strong string model (damping, decay,
stiffness, pickup), sine layer, drive, amp envelope, bus EQ and compressor, and
humanising. It has a test riff (written in the shorthand) to play once or loop at
any BPM, single test notes, and an A/B switch against the defaults. Changes apply
live and are saved in the browser. Settings can be copied, downloaded or pasted as
JSON; to make a sound the default, paste its values into `DEFAULT_SOUND` in
`src/lib/audio/sound.ts`.

## Syntax highlighting

The shorthand editor is colour-coded, and the rendered tab uses the same colours so
you can see which shorthand produced which part of the tab. Each string has its own
colour, and a bare fret takes the colour of the string it plays on. Sections are
tinted, comments are muted and invalid tokens are underlined. Put the caret on a
note to outline it in the tab.

Click the **Shorthand** heading to collapse the editor so the tab takes the full
width. While collapsed, the heading shows a badge if the shorthand has errors. The
choice is saved in the browser.

## App

Built with SvelteKit and Skeleton UI (`vintage` theme, with light and dark mode).
Local tabs are saved in the browser's `localStorage`. You can create, search, duplicate
and delete tabs, copy them to the clipboard, download them as `.txt`, or share
them as a snapshot link. Google sign-in is optional: all existing local features
work without an account. When signed in, cloud saving is the default; each tab
can opt out by choosing **Browser only** under **Save location**.

New tabs are prefilled with an editable walkthrough, not just a placeholder.
Starting with an ascending C major scale, it explains sections and comments,
strings and frets, visual spacing and silent bars, joined notes, multi-digit
frets, bar lines, and new rows. An original lyric sketch demonstrates a verse,
and a final section introduces playback, looping, highlighting, export, sharing,
automatic saving, and sound design. String names are consistently uppercase in
the music, with a comment explaining that casing does not matter. Duplicating or
saving a shared tab preserves its source instead. Older saved tabs, sound-design riffs, and
version 1 share links are automatically migrated to bracket notation, preserving
their pitches, tab columns, and playback grouping. New share links use version 2.

- Parser: `src/lib/tab/parser.ts`. New indicators go in the `TabEvent` union.
- Renderer: `src/lib/tab/render.ts`. `layoutBlocks` records where every note and bar
  lands in the text, which playback uses for highlighting.
- Playback: `src/lib/tab/playback.ts` (timing), `src/lib/audio/bass.ts` (synth),
  `src/lib/audio/sound.ts` (settings) and `src/lib/audio/player.svelte.ts` (Web Audio
  scheduling). No samples or libraries.
- Highlighting: the parser emits source `tokens`; `src/lib/tab/highlight.ts` and
  `src/lib/components/ShorthandEditor.svelte` render them, styled by the `.hl-*`
  rules in `src/routes/layout.css`.
- Share links: `src/lib/tab/share.ts`
- Site metadata (name, description, URL, social preview image): `src/lib/site.ts`

### SEO

The app runs only in the browser, so `src/hooks.server.ts` adds the SEO tags to
the SPA shell at build time. These are the description, canonical URL, Open
Graph, Twitter card and JSON-LD tags. This way crawlers and link previews can
read them without running JavaScript. `robots.txt`, `sitemap.xml` and
`manifest.webmanifest` are pre-built from `src/lib/site.ts`. Tab and shared
pages are marked `noindex`; public tabs are discoverable through the public library.
Tab detail pages also set a title and description from the tab's title, artist,
and tuning for browser-rendered metadata; they remain `noindex` because tabs
are private browser or account data. To change the preview image or any other
site-wide metadata, edit `src/lib/site.ts`.

### Sharing

**Snapshot link** on a local tab page copies a URL like
`https://basstabs.bybear.dk/shared#<payload>` to the clipboard. The payload is
the title, artist, tuning and shorthand, base64url encoded in the hash, so the
whole tab travels inside the link and never touches a server. Opening the link
shows the rendered tab with a **Save to my tabs** button that stores an editable
copy. It stays in the browser without an account and saves to the cloud by default
when signed in.

### Optional Google sign-in and cloud tabs

Sign in with Google to automatically save existing browser tabs and newly created,
duplicated or imported tabs to your account, privately by default. Each tab keeps
the same ID. The app removes
the browser-only entry only after saving succeeds. The overview is one library
with **Browser only**, **Saved to cloud**, **Saving to cloud...**, or **Cloud ·
Unsaved changes** status badges, not separate local and cloud lists. Future
edits update the same cloud-backed tab, rather than creating more copies.
Cloud-backed tabs require sign-in to access; browser-only tabs remain available
without an account.

The editor's **Save location** setting sits below Title, Artist and Tuning, alongside
visibility and sharing. Select **Browser only** to opt out of automatic cloud saving,
or **Cloud account** to enable it again. A compact status shows save progress;
**Retry save** appears only for pending changes or failed uploads. Storage/sharing
details are available in an expandable help section. On a cloud-backed
tab, confirmation explains that this removes the cloud tab and revokes its live
link. The app durably stores the latest contents locally before deleting the
cloud tab and its published projection together. Failed conversions are reported;
the local backup is kept and the cloud tab is not presented as successfully removed.
The preference survives reloads, sign-out and later sign-in.
New duplicates and imported copies use the normal cloud default.

Automatic uploads wait for the account library to load. Failed saves remain in the
browser with a pending/failed status and **Retry save**; editing or reconnecting
also retries. Pending uploads are bound to the account they were created for, so
switching accounts does not upload those tabs to someone else's account. New tabs
created while signed in receive a distinct title if necessary, so repeated
**New tab**, duplicate and import actions do not conflict with existing titles.
Cloud titles must be unique within your account, ignoring capitalization and
leading/trailing spaces; other accounts can use the same titles. For older
browser/cloud copies with the same title, **Update existing cloud tab** asks
for confirmation before replacing the cloud contents with the browser version.
It preserves the cloud ID, creation date, visibility and live link, and removes
the browser entry only after a successful save. **Open existing cloud tab**
lets you inspect that version first; rename the browser tab to keep both as
separate variations. Nothing is automatically merged or deleted based on title.
An existing title shows a warning next to the save controls and is checked
again when clicked, before contacting Firestore. Server validation still checks
for conflicts with tabs saved on other devices. Failed saves also show their
message next to the button; access failures explain that signing in again or
deploying the latest rules may be necessary rather than implying a title conflict.
Cloud renames also check for duplicates; a conflicting draft stays unsaved until
you give it a different title. Existing duplicate titles are not automatically
renamed or deleted.
Cloud-backed tabs are available across devices and save edits automatically
after a short delay. **Retry save** explicitly retries
a failed save. Sign-out waits for pending edits to save; if saving fails, the
account stays signed in. Unsaved drafts are backed up in browser storage under
the account's UID and restored only for that account. Browser storage errors are
shown explicitly. Local tabs remain available after sign-out.

Visibility options:

- **Private:** only the signed-in owner can read or edit.
- **Unlisted:** anyone with the live link can read, but it is not listed publicly.
- **Public:** anyone can read, and it appears under **Public tabs**.

The **Visibility** segmented control offers **Public**, **Unlisted**, and **Private**
and stays in sync with sharing actions. Both **Copy live link** buttons on a cloud
tab produce `/shared?id=<random-token>`, automatically changing a private tab to
unlisted first. Public tabs stay public when copying a link. The link is read-only,
does not expire automatically, and shows successfully saved updates in real time.
Anyone with an unlisted link can forward it; this is not friend-specific access
control. Making the tab private or deleting it revokes the link. Sharing again
after revocation generates a new token. Switching between public and unlisted
keeps the existing link. Snapshot links remain independent, immutable copies and
cannot be revoked. Viewers can save a local editable copy without signing in.

Cloud edits need a connection to save. Recovered drafts can be saved with
**Retry save**. Simultaneous edits from multiple devices use last-write-wins,
not collaborative merging. The app warns before closing with pending changes.
On shared computers, sign out after successful saving; local tabs and sound
settings still belong to the browser.

### Firebase setup and deployment

The client configuration in `src/lib/firebase.ts` targets `basstabs-by-bear`.
It is public Web app configuration, not an admin credential. Analytics is not
initialized. The static nginx deployment does not need a server SDK or secrets.

In Firebase Console:

1. Enable the Google provider in Authentication.
2. Authorize `basstabs.bybear.dk`, `localhost`, and any staging hostname.
3. Create a Standard edition Firestore database with ID `(default)`.
4. Publish the repository's `firestore.rules` and `firestore.indexes.json` before
   testing cloud features. Production-mode deny-all rules intentionally prevent
   the cloud UI from working until these rules are deployed.

Use the Firebase CLI to deploy rules and indexes:

```sh
npx firebase login
npx firebase deploy --project basstabs-by-bear --only firestore:rules,firestore:indexes
```

Rules and cloud-title integration tests (including simultaneous uploads) use the
Firestore emulator and require Java 21 or newer:

```sh
npm run test:rules
```

The Firebase CLI supports Node 20/22/24; use Node 22 or 24 for local rules
testing if a newer Node version produces an engine warning. The Firestore
dependency's Node-only gRPC package is overridden to a patched compatible
1.x version; the browser app uses Firebase's Web transport.

Alternatively, paste `firestore.rules` into **Firestore Database → Rules** and
publish, then create the collection-scope composite index for `publishedTabs`
with `visibility` ascending and `updatedAt` descending in **Indexes**. Wait for
the index to finish building before using the public library.

Canonical tabs live at `users/{uid}/tabs/{tabId}`.
Create/rename transactions use an owner-only revision document at
`users/{uid}/cloudState/tabNames` to serialize duplicate-name checks across
devices. Checks read the server library, including tabs saved before this feature.
Deploy the updated rules with the client: older clients cannot create or rename
cloud tabs without participating in this coordination.
Shared content is mirrored
atomically at `publishedTabs/{unguessableToken}`. Rules require the projection
to match its canonical tab, enforce owner-only writes, and require deletion of
the projection on revocation/deletion. Guests may get a shared document by its
token; collection queries must filter `visibility == 'public'`. Shared
documents contain tab content and owner UID/tab ID, not the owner's email or
Google profile. Do not add private information to shared documents.

Monitor Firestore usage: public reads and live listeners consume quota. App Check
can reduce abuse once configured, but it does not replace Security Rules. No
Storage, Functions, Anonymous Authentication, or Firebase Hosting is required.

If Google sign-in succeeds but loading tabs reports **Missing or insufficient
permissions**, verify that the app-specific rules above are published to the
`(default)` database in `basstabs-by-bear`, not just saved in the editor or deployed
to another project/database. The initial Production-mode deny-all rules cause
this error even for signed-in users. After publishing, choose **Reconnect cloud**
or reload the app; a denied Firestore listener does not resume by itself. Do not
work around this error by allowing all reads/writes.

```sh
npm install
npm run dev      # start the dev server
npm test         # run the parser/renderer unit tests
npm run build    # build a static site into build/
```

## Container

The image is a static build served by digest-pinned `nginx-unprivileged`, so
there is no Node runtime. It idles at a few MiB of RAM.

- Listens on port **3000** and runs as UID 101. It also works with any non-root
  `runAsUser` and `readOnlyRootFilesystem: true`, as long as `/tmp` is a
  writable `emptyDir`.
- `GET /healthz` (liveness) and `GET /readyz` (readiness) return `200 ok` without
  authentication.
- `/_app/immutable/*` is cached for a year. Every other path gets `no-cache` and
  falls back to the app (`200.html`).
- The runtime base image is pinned in `Dockerfile` with a readable tag plus a
  digest. CI derives its nginx config test image from the same `Dockerfile`
  reference via `.github/scripts/runtime-image.sh`, so the checked image cannot
  drift from the shipped image. Dependabot checks Docker digests weekly in
  `.github/dependabot.yml`.

## Deploy (Mimir)

- `.github/workflows/webapp.yml`: pull requests are built and tested only. On `main`,
  CI builds and tests, pushes `ghcr.io/bjornnorgaard/basstabs/webapp:<yy.mm.dd-HH.MM-sha>`,
  and pins that tag into `deploy/mimir/services.test.yaml` (service key `web`).
- `.github/workflows/production.yml`: run it manually to copy the test tag into
  `deploy/mimir/services.prod.yaml`. It never runs automatically.
- `deploy/` is excluded from Prettier because the pin script requires
  `tag: "..."` in double quotes.

### Agent-managed Firestore deployment

Test and production currently share the Firebase project `basstabs-by-bear`.
CI does not deploy Firestore rules or indexes; no Google federation setup is
required. The agent making a rules-dependent change must validate and deploy
the required Firebase updates and confirm they are released **before pushing**
the client changes. The mandatory procedure is in [AGENTS.md](./AGENTS.md).
If authentication or deployment fails, stop before pushing and report the
blocker rather than leaving the new client incompatible with deployed rules.

Rules changes affect both sites immediately and must remain compatible with
the currently running clients. Breaking changes require a staged compatible
rollout or a separate test Firebase project, not an immediate restrictive update.

```sh
docker build -t basstabs .
docker run --rm -p 3000:3000 basstabs
```
