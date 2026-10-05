# 10 · Rhythm and note durations

- **Status:** Done
- **Area:** Notation / playback
- **Size:** Large
- **Depends on:** [09](./09-articulation-notation.md) _(soft — same files; sequence, don't block on scope)_
- **Blocks:** [11](./11-repeats-and-tempo-markers.md) _(same files)_

## Goal

Let the shorthand express rhythm, so playback reflects what was written instead of
dividing every bar evenly.

## Why

The README states the limitation plainly:

> There is no rhythm in the syntax yet, so every bar lasts the same time (4 beats at
> the chosen BPM), regardless of its written width. Playback divides a bar evenly
> between its note groups, not its spaces.

This means playback cannot represent anything syncopated — the moment a riff has a
dotted eighth or a rest that matters, the audio stops being a useful check, which
is playback's entire purpose. It is the largest remaining gap between what the app
shows and what the music is.

## Current state

- [`playback.ts`](../src/lib/tab/playback.ts) — `buildSchedule(measures, tuning)`
  produces `ScheduledNote`s; a bar is 4 beats and divides evenly across note
  groups.
- `groupJoinedEvents` in [`render.ts`](../src/lib/tab/render.ts) defines a group:
  joined notes like `E320` share one slot.
- Spaces are _visual_ columns and are explicitly **not** rhythmic today.
- [`player.svelte.ts`](../src/lib/audio/player.svelte.ts) does Web Audio
  scheduling and drives highlighting.

## Design decision — settle this first

The hard question is whether rhythm is **implicit** (derived from column
positions) or **explicit** (written markers). This choice determines the whole
task, so decide and record it before writing code.

### Option A — columns become time

Each column is a subdivision, so `E0---0---` is naturally two quarter notes and
spacing finally means something.

- _For:_ Matches how people already read ASCII tab; needs no new syntax; the
  existing alignment rules do the work.
- _Against:_ **Breaks every existing tab**, because spacing is currently decorative.
  A tab spaced for looks would suddenly play wrong. Needs migration, and migration
  cannot recover intent that was never expressed.

### Option B — explicit duration markers

Something like `E5:q` / `E5:e`, or a bar-level subdivision such as `|4/4:16 ... |`.

- _For:_ Fully backward compatible; a tab with no markers keeps today's behaviour.
- _Against:_ More syntax to learn and more to document.

### Option C — opt-in per tab

A tab-level mode selecting A or B, defaulting to today's behaviour.

- _For:_ Existing tabs are safe; new tabs get the better model.
- _Against:_ Two timing engines to maintain and explain.

**Recommended: B, or C with B as the new mode.** The repository has a strong
backward-compatibility record — share links are versioned and old sources are
migrated automatically — and silently changing how saved tabs sound would break
that contract.

Whatever is chosen, rests need an answer too: a rest is not the same as a blank
visual column, and the format currently has no way to say "silence for a beat".

## Scope

1. Decide and document the model above.
2. Extend the parser and the `TabEvent` union; add token kinds for highlighting.
3. Rework `buildSchedule` to use durations, keeping `ScheduledNote` highlighting
   offsets accurate.
4. Handle over- and under-filled bars: a bar whose durations exceed its length
   should produce a clear error, not silently drift.
5. Update the README (replacing the limitation paragraph quoted above) and
   [`SyntaxHelp.svelte`](../src/lib/components/SyntaxHelp.svelte).
6. Consider share-link versioning, as in [09](./09-articulation-notation.md).

## Acceptance criteria

- A tab with rhythm markers plays with the written rhythm; note highlighting stays
  in sync with the audio.
- Every existing tab, sound-design riff and v1/v2 share link plays exactly as it
  does today. This is the hard requirement.
- Looping a bar or section respects the new timing, with no gap or overlap at the
  loop point.
- Mixed bars (some notes marked, some not) behave predictably and are documented.
- Over-filled bars report a clear error at the right position.

## Validation

```sh
npm run lint && npm run check && npm test
```

Extend [`playback.spec.ts`](../src/lib/tab/playback.spec.ts) with explicit
expected onset times, and add regression cases asserting that unmarked sources
produce byte-identical schedules to today's.

Listen to the result — the test for rhythm is ultimately the ear. Verify looping
at a low BPM where timing errors are audible.

No Firestore changes.

## Risks

- **Silently changing how saved tabs sound is the worst outcome here** — worse
  than shipping nothing. Lock current behaviour behind regression tests _before_
  changing the scheduler.
- Rhythm interacts with [11](./11-repeats-and-tempo-markers.md); a per-section BPM
  change must compose with durations.
- Articulations from [09](./09-articulation-notation.md) occupy columns and form
  groups, so both tasks edit the same parser and scheduler paths. Sequence them.

## Outcome

Implemented explicit, opt-in rhythm markers (Option B). Unmarked bars keep the
legacy scheduler path, so existing sources, v1/v2 share links, sound-design riffs
and visual spacing keep their playback semantics. Duration/rest markers are
structural and do not occupy rendered tab columns; literal spaces around them are
still decorative columns, exactly like existing spaces.

Syntax:

| Marker        | Meaning                                              |
| ------------- | ---------------------------------------------------- |
| `:w`          | Sticky whole-note duration for following note groups |
| `:h`          | Sticky half-note duration                            |
| `:q`          | Sticky quarter-note duration                         |
| `:e`          | Sticky eighth-note duration                          |
| `:s`          | Sticky sixteenth-note duration                       |
| `:q.` etc.    | Dotted duration marker                               |
| `:r`          | Rest using the current sticky duration               |
| `:rq`, `:re.` | Rest with an explicit duration, optionally dotted    |

Decisions and semantics:

- Chose `:` as the single non-letter prefix so rhythm syntax does not collide
  with string names, fret brackets, articulations, bars, comments, or section
  headings. The duration letters are only meaningful after `:`.
- Duration markers are sticky within one bar. Stickiness resets to quarter notes
  at every bar line. A bar with any duration or rest marker is timed by explicit
  durations; a bar with no markers uses the old even-division behaviour.
- A duration applies to a note group. Joined notes and articulation groups
  (`E320`, `E5h7`) subdivide that slot internally as before.
- Rests consume time but render nothing. `:r` uses the current sticky duration;
  explicit rest durations such as `:re.` do not change the sticky note duration.
- Under-filled marked bars leave the remaining time silent. This supports pickups
  and short examples without forcing visible filler syntax.
- Over-filled marked bars report `Rhythm durations exceed one 4/4 bar` at the
  note/rest slot that exceeds the bar.
- Share links stay on v3 for the unreleased syntax line. `requiredShareVersion`
  now returns v3 for either articulation or rhythm feature flags; v4 was not
  introduced.
- Highlighting has new `duration` and `rest` token kinds with `.hl-duration` and
  `.hl-rest` styles in light, dark and print contexts.

Regression-lock evidence:

- Added playback regression cases for unmarked README-style bars, joined notes,
  articulation groups, blank bars, multi-row tabs and sections before changing
  the scheduler. These assert exact `[midi, start, length, measureId]` schedules.
- Added rhythm tests for sticky markers, dotted durations, rests, joined groups,
  render neutrality, share v3 detection, source highlighting and overfill errors.

Documentation/demo updates:

- Updated the README syntax table, syntax explanation, Playback section,
  highlighting note and share-version paragraph.
- Updated the in-app `SyntaxHelp` cheat sheet.
- Added a short `[Rhythm and Rests]` walkthrough to the new-tab example.

Left out:

- No expressive synthesis changes for articulations or rests.
- No implicit column-derived rhythm and no migration of existing tabs.
- No tempo markers; task 11 will add tempo/repeat syntax on top.

Validation:

- `npm test` passed: 13 test files passed, 1 skipped; 202 tests passed, 7 skipped.
- Full final validation was run after this outcome was written:
  `npm run lint && npm run check && npm test && npm run build`.
- Build output was removed afterward.

### Notes for task 11

- `buildSchedule` still uses bars as the internal time unit. Tempo changes should
  compose by changing the bar-to-seconds mapping in the player or by segmenting
  schedules by tempo, not by changing note `start`/`length` values produced for
  explicit durations.
- Explicit duration bars can be mixed with legacy bars. Repeats should preserve
  each repeated measure's `timed` flag and `timingSlots` so loop/repeat expansion
  has no gap or overlap.
- If tempo markers become structural syntax, add parser feature flags and source
  token kinds the same way rhythm did, and keep them on share v3 unless the
  payload format changes incompatibly after v3 is released.
