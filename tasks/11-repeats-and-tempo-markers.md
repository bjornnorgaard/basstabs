# 11 · Repeats and tempo markers

- **Status:** Not started
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
