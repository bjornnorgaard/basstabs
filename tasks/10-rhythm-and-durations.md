# 10 · Rhythm and note durations

- **Status:** In progress
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
