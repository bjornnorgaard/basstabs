# 09 · Articulation notation

- **Status:** Done
- **Area:** Notation / parser
- **Size:** Large
- **Depends on:** –
- **Blocks:** [10](./10-rhythm-and-durations.md), [11](./11-repeats-and-tempo-markers.md) _(same files)_

## Goal

Support the articulations that bass players actually write: hammer-on, pull-off,
slide, bend, vibrato, ghost note and dead note.

## Why

This is the most conspicuous gap between the shorthand and real bass tab. Every
other tab format has these, and without them the app cannot represent most riffs
faithfully. The codebase was explicitly designed to grow here —
[`src/lib/tab/parser.ts`](../src/lib/tab/parser.ts) says:

```ts
/** One rhythmic column in the tab. Kept as a union so new indicators can be added later. */
export type TabEvent = NoteEvent;
```

and the README's own extension note is "New indicators go in the `TabEvent` union."

## Suggested notation

Conventional ASCII-tab characters, so the rendered output looks like tab people
already read:

| Input  | Meaning           | Renders as |
| ------ | ----------------- | ---------- |
| `E5h7` | Hammer-on 5 → 7   | `5h7`      |
| `E7p5` | Pull-off 7 → 5    | `7p5`      |
| `E3/5` | Slide up          | `3/5`      |
| `E5\3` | Slide down        | `5\3`      |
| `E5b`  | Bend              | `5b`       |
| `E5~`  | Vibrato           | `5~`       |
| `Ex`   | Dead / muted note | `x`        |
| `E(5)` | Ghost note        | `(5)`      |

Design constraints to respect:

- **Column accounting is exact.** Every fret digit and every space inside a bar
  occupies one column; string letters, brackets and bar lines occupy none. Each
  new connector character must have a defined, documented column width —
  `5h7` is three columns.
- `[12]` brackets mean a multi-digit fret, so `E(5)` for a ghost note needs an
  unambiguous rule against bracket syntax. Parentheses avoid the clash, but
  confirm the tokenizer agrees.
- `\` in `E5\3` is awkward inside JS/TS string literals in tests — note it, and
  consider whether a second character should also be accepted.

## Scope

A connector joins two frets on one string, so this is **not** just a new event
kind — it affects every stage:

1. **Parser** — extend the `TabEvent` union, extend `NOTE_PATTERN`
   (`/^([A-Za-z])?(?:\[(\d+)\]|(\d+))$/`), and report precise errors (an
   articulation needs a preceding note; `h` at the start of a bar is invalid).
2. **Tokens** — add `SourceTokenKind` values so articulations highlight. Today:
   `'string' | 'fret' | 'bar' | 'section' | 'comment' | 'invalid'`.
3. **Renderer** — [`render.ts`](../src/lib/tab/render.ts) must place connectors in
   `layoutBlocks` with correct `NoteLayout` positions, since playback highlighting
   depends on those offsets.
4. **Highlighting** — [`highlight.ts`](../src/lib/tab/highlight.ts) and the
   `.hl-*` rules in [`layout.css`](../src/routes/layout.css).
5. **Share links** — the payload carries raw shorthand, so a v2 link containing
   articulations would be unreadable by older deployed clients. Decide: bump to
   **version 3**, or accept graceful degradation. See
   [`share.ts`](../src/lib/tab/share.ts) (`VERSION`, `decodeSharedTab`, which
   already migrates v1). **Do not silently reuse v2.**
6. **Docs** — the README syntax table and
   [`SyntaxHelp.svelte`](../src/lib/components/SyntaxHelp.svelte).

## Playback — scope decision

Render-only support is a legitimate and valuable first delivery. Synthesising a
convincing slide or bend in the Karplus–Strong model
([`bass.ts`](../src/lib/audio/bass.ts)) is a substantial separate effort.

Recommended split:

- **This task:** parse, render, highlight, document. For playback, treat a
  hammer-on/pull-off/slide target as a normal note in the same group (so the pitch
  is at least heard) and ignore vibrato/bend/ghost; mute `x`.
- **Later task:** proper articulation synthesis.

State clearly in the README which articulations affect sound and which are
notation-only, so the behaviour is not mistaken for a bug.

## Acceptance criteria

- All eight articulations parse, render and highlight correctly.
- Column widths stay exact: a bar with articulations still aligns with its
  neighbours, matching the existing padding rules.
- Invalid use (`E h5`, a trailing `h` with no target) produces an error at the
  correct source position, consistent with existing error reporting.
- Existing tabs are unaffected — all current parser, render, migration and
  playback tests pass unchanged.
- Copy-to-clipboard and `.txt` download include the articulations.
- Share-link compatibility is handled deliberately and documented.
- The README table and in-app `SyntaxHelp` both describe the new syntax.

## Validation

```sh
npm run lint && npm run check && npm test
```

Add cases to [`parser.spec.ts`](../src/lib/tab/parser.spec.ts),
[`render.spec.ts`](../src/lib/tab/render.spec.ts),
[`highlight.spec.ts`](../src/lib/tab/highlight.spec.ts) and
[`playback.spec.ts`](../src/lib/tab/playback.spec.ts).

No Firestore changes: tab source is an opaque string to the rules and schema.

## Risks

- Backward compatibility is the big one. Stored tabs, sound-design riffs and share
  links all contain shorthand; a tokenizer change that reinterprets an existing
  character would corrupt saved tabs. Check that none of the new characters can
  currently appear in a _valid_ tab before giving them meaning.
- Heavy overlap with [10](./10-rhythm-and-durations.md) and
  [11](./11-repeats-and-tempo-markers.md) — do not run these in parallel. See
  [ROADMAP.md](./ROADMAP.md).

## Outcome

Implemented the brief's articulation set:

| Input  | Meaning           | Rendered text |
| ------ | ----------------- | ------------- |
| `E5h7` | Hammer-on         | `5h7`         |
| `E7p5` | Pull-off          | `7p5`         |
| `E3/5` | Slide up          | `3/5`         |
| `E5\3` | Slide down        | `5\3`         |
| `E5b`  | Bend              | `5b`          |
| `E5~`  | Vibrato           | `5~`          |
| `Ex`   | Dead / muted note | `x`           |
| `E(5)` | Ghost note        | `(5)`         |

Decisions and compatibility:

- Kept the suggested characters. The only concrete ambiguity found was `b` versus
  the low `B` string in 5-string tuning, so `A2B0` remains an adjacent B-string
  note and bend is only `b` when it is attached to a preceding note without a
  following fret. Regression coverage preserves this.
- Replaced the parser's note regex loop with an explicit scanner. Existing v2
  syntax and v1 migration semantics are preserved, including legacy `E12` versus
  `E320` migration behavior.
- `TabEvent` is now an extensible union of plain fretted notes, `technique`
  events, and `dead-note` events. Ordinary note objects keep their existing shape
  unless they are ghost notes, where `display: "(5)"` and `ghost: true` are added.
- Column accounting is exact and documented: every articulation glyph occupies one
  rendered tab column, while string prefixes, brackets, and bar lines still do
  not. `E5h7` is three columns, `E5b` is two, and `E(5)` is three.
- Invalid connectors report at the connector column. Examples: `h5` reports
  `Articulation "h" needs a preceding note`; `E5h` reports
  `Articulation "h" needs a target fret`.
- Playback is render-first as requested: hammer-on/pull-off/slide targets play as
  normal joined notes, bends/vibrato/ghost notes play as the plain fret, and `x`
  is a silent slot. No new synthesis was added.
- Share links now accept versions 1, 2, and 3. `encodeSharedTab` emits the lowest
  version required by the source via `requiredShareVersion(source, tuningId)`:
  version 2 for bracket-era syntax, version 3 only when articulation feature flags
  are present.
- Copy-to-clipboard and `.txt` export already use rendered tab text, so the new
  renderer output includes articulations there without separate UI changes.
- Updated the README syntax/playback/highlighting/share text, in-app
  `SyntaxHelp`, and the new-tab example walkthrough.

Left out:

- Expressive synthesis for slides, bends, vibrato, ghost-note velocity, or muted
  thuds. These remain notation/rendering semantics for now.
- A second slide-down character. Backslash is supported and documented; tests use
  raw string literals where useful.

Validation:

- `npm run lint && npm run check && npm test && npm run build` passed with Node
  24 from the session env.
- Test count: 13 test files passed, 1 skipped; 186 tests passed, 7 skipped.
- Build output was removed afterward.
- Manual smoke check: ran the dev server on port 4193, opened the new-tab example,
  and verified rendered articulation output including
  `E|5h7-7p5|-------|-----|x-(5)|`; stopped the server afterward.

### Notes for tasks 10 and 11

- Extend `TabEvent` in `src/lib/tab/parser.ts` with new event variants rather
  than overloading note strings. The scanner's main loop is the extension point:
  add a token reader near the articulation handling and set a parse-result feature
  flag for share-version decisions.
- `Measure.width` must continue to be the exact rendered column count. If a new
  marker occupies a tab column, increment `measureColumn`; if it is structural
  only, do not.
- For rendered output, add non-note glyphs as line segments with their own class
  instead of letting `fillerParts` guess. Playback should consume only the layout
  events it actually schedules.
- Add new token kinds/classes in `SourceTokenKind`, `tokenClass`, and the `.hl-*`
  block in `src/routes/layout.css`.
- Extend `requiredShareVersion`/parser feature flags for rhythm and repeat syntax.
  Version 3 is intentionally the unreleased extension version for tasks 10 and 11;
  do not bump to version 4 for those features unless the payload format changes
  incompatibly after v3 is released.
