# 11 · Repeats and tempo markers

- **Status:** Done
- **Area:** Notation / playback
- **Size:** Medium
- **Depends on:** [10](./10-rhythm-and-durations.md) _(soft — same files; tempo composes with durations)_
- **Blocks:** –

## Goal

Add repeat bars (`|:` … `:|`) and per-section tempo markers, so riff-based music
does not have to be copy-pasted.

## Why

Bass parts are overwhelmingly repetitive. Today a four-bar riff played eight times
must be written out eight times, which makes the source long, hard to edit, and
easy to get inconsistent. Repeats are standard notation and pair naturally with
the section headings the format already has.

Per-section tempo matters because BPM is currently a single global playback
setting: a tab with a slow intro and a fast chorus cannot be checked at both
tempos in one pass.

The README notes the gap: "inline notes and section repeats are not yet supported."

## Current state

- [`parser.ts`](../src/lib/tab/parser.ts) has `Section { kind: 'section'; title }`
  and `Annotation { kind: 'annotation'; text }`, both whole-line only.
- `TabBlock = System | Section | Annotation`.
- `|` ends a measure. `[Intro]` on its own line is a heading; `# text` is an
  annotation. Note the existing rule: a whole-line bracketed value is _always_ a
  heading, including `[12]`.
- BPM lives on the player ([`PlayableTab.svelte`](../src/lib/components/PlayableTab.svelte),
  `player.setBpm`) and is global.
- Playback can already target a heading, row or bar, with Shift+click to loop.

## Suggested notation

| Input               | Meaning                        |
| ------------------- | ------------------------------ |
| `\|: E0 0 A2 2 :\|` | Repeat the enclosed bars twice |
| `\|: … :\|x4`       | Repeat four times              |
| `[Chorus @ 140]`    | Section heading with a tempo   |
| `# @ 140`           | Tempo change at this point     |

Pick one tempo form rather than both. `[Chorus @ 140]` is appealing because it
extends existing heading syntax, but it changes how heading text is parsed —
check it cannot break a tab with a literal `@` in a section name.

## Scope

1. Parse `|:` and `:|` with an optional repeat count. The tokenizer currently
   treats `|` as a bar line with no lookahead, so `|:` needs care.
2. Add the blocks/events to the `TabBlock` / `TabEvent` unions and new
   `SourceTokenKind` values for highlighting.
3. **Decide whether repeats expand in the renderer.** Rendered tab is also what
   copy-to-clipboard and `.txt` download produce, so the choice is user-visible:
   - _Render the repeat marks_ (compact, conventional, matches real tab), or
   - _Expand to literal bars_ (simple, but then the shorthand's brevity is lost
     in every export).

   Recommended: render the marks, and expand only in `buildSchedule`.

4. Expand repeats for playback in [`playback.ts`](../src/lib/tab/playback.ts).
   Highlighting maps a schedule entry back to a source position — with repeats,
   one source bar maps to several playback times, so `ScheduledNote` needs to keep
   pointing at the single source location while appearing multiple times.
5. Apply tempo changes in the scheduler and reflect them in the BPM control
   (likely as "section tempo overrides the global BPM", with the global setting
   acting as a multiplier or being overridden — decide and document).
6. Update the README and [`SyntaxHelp.svelte`](../src/lib/components/SyntaxHelp.svelte).
7. Consider share-link versioning, as in [09](./09-articulation-notation.md).

## Acceptance criteria

- `|: … :|` plays twice; `:|x4` plays four times.
- Highlighting follows each pass, re-highlighting the same source bar each time.
- Unbalanced repeats (`:|` with no `|:`, or nesting if unsupported) report a clear
  error at the correct position.
- A section tempo applies from its heading until the next one, and looping a
  section uses that tempo.
- Existing tabs are unchanged — a bare `|` still behaves exactly as before.
- Copy and `.txt` export round-trip: exported text re-parses to the same tab.

## Validation

```sh
npm run lint && npm run check && npm test
```

Extend [`parser.spec.ts`](../src/lib/tab/parser.spec.ts),
[`render.spec.ts`](../src/lib/tab/render.spec.ts) and
[`playback.spec.ts`](../src/lib/tab/playback.spec.ts). Test "play just this bar"
and "loop this section" for a bar inside a repeat — that is where highlighting is
most likely to break.

No Firestore changes.

## Risks

- `|:` tokenization is the likely source of regressions in existing tabs. An empty
  measure written `||` must keep working.
- Nested repeats add real complexity; it is reasonable to reject them with a clear
  error in this task.
- Edits the same parser/renderer/playback files as
  [09](./09-articulation-notation.md) and [10](./10-rhythm-and-durations.md).
  Sequence, don't parallelize — see [ROADMAP.md](./ROADMAP.md).

## Outcome

Implemented compact repeat barlines and whole-line tempo markers.

Syntax:

| Marker          | Meaning                                      |
| --------------- | -------------------------------------------- |
| `\|: ... :\|`   | Repeat the enclosed phrase twice             |
| `\|: ... :\|x3` | Repeat the enclosed phrase three total times |
| `@120`          | Set playback tempo to 120 BPM from here      |

Decisions and rationale:

- Repeats render as conventional, compact barlines (`|:` and `:|`, with `xN`
  when the count is greater than the default 2). They are not expanded in the
  rendered/exported tab, so copy and `.txt` output keep the shorthand concise and
  re-parse with the same repeat semantics.
- Repeats expand only in `buildSchedule`. Repeated notes keep the same source
  `noteId` and `measureId`, so highlighting re-lights the same source bar on
  every pass. Scheduling a single selected bar ignores partial repeat markers;
  a selected range/section expands repeats only when the complete start and end
  are inside that selection.
- Cross-row/section repeats are supported because validation and expansion walk
  the flattened measure sequence. Nested repeats are deliberately left out and
  rejected with `Nested repeats are not supported`.
- To preserve task 10 rhythm compatibility, `|:q`, `|:e`, `|:h`, `|:s`, `|:w`
  and `|:r` remain a plain barline followed by a duration/rest marker. A repeated
  bar that starts with rhythm must use a separating space: `|: :q E0 :|`.
- Tempo markers use `@120` on their own line. This was chosen over parsing
  section-title suffixes so existing section names containing `@` remain literal.
  The marker is rendered as a structural text line, so copied/downloaded tab text
  round-trips tempo semantics.
- Source tempo markers are absolute. When the played selection contains them,
  they override the BPM control for that playback; the control is disabled and
  shows the source tempo currently in effect. Tabs without tempo markers keep the
  previous user-chosen BPM slider behaviour.
- Tempo composes by changing bar-to-seconds conversion in the player schedule
  (`Schedule.tempoChanges`); explicit rhythm duration math remains in bar units.
- Share links stay on unreleased v3. `requiredShareVersion` now returns v3 for
  articulation, rhythm, repeat or tempo feature flags; no v4 was introduced.
- Added `repeat` and `tempo` source token kinds and `.hl-repeat` / `.hl-tempo`
  styles for light, dark and print contexts.

Left out:

- Volta/ending brackets.
- Nested repeats.
- Inline tempo syntax and section-title tempo suffixes such as `[Chorus @ 140]`.
  Use a whole-line `@140` marker before the section instead.

Regression and coverage:

- Added old-behaviour locks for the `|:q` rhythm collision, single-bar selection
  inside repeats, repeat expansion preserving note/measure IDs, repeat counts,
  cross-marker errors, tempo schedule maps, share v3 detection and the source-BPM
  UI state.
- Updated the README syntax/playback/highlighting/share text, in-app
  `SyntaxHelp`, preview rendering and the new-tab example.

Validation:

- `npm run format` was run before final validation.
- `npm run lint && npm run check && npm test && npm run build` passed with Node
  24 from the session env.
- Test count: 20 test files passed, 1 skipped; 230 tests passed, 7 skipped.
- Build output was removed afterward.
- No Firestore rules, indexes, schema paths or Firebase deployment surfaces were
  touched.
