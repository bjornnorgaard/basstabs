# Tasks

Planned work for basstabs, one file per task. Each file is written to be picked up
cold by an agent session with no prior context.

See [ROADMAP.md](./ROADMAP.md) for dependencies, file conflicts and which tasks
can safely run in parallel.

## Index

| #                                           | Task                               | Area                 | Size   | Status      | Depends on  |
| ------------------------------------------- | ---------------------------------- | -------------------- | ------ | ----------- | ----------- |
| [01](./01-lazy-load-firebase.md)            | Lazy-load Firebase                 | Performance          | Medium | In progress | –           |
| [02](./02-firestore-offline-persistence.md) | Firestore offline persistence      | Offline              | Small  | Not started | 01 _(soft)_ |
| [03](./03-offline-app-shell.md)             | Offline app shell (service worker) | Offline / PWA        | Medium | In progress | –           |
| [04](./04-firebase-app-check.md)            | Firebase App Check                 | Security / cost      | Medium | Not started | 01 _(soft)_ |
| [05](./05-rules-tests-in-ci.md)             | Run Firestore rules tests in CI    | CI / safety          | Small  | In progress | –           |
| [06](./06-component-interaction-tests.md)   | Component and interaction tests    | Testing              | Medium | Not started | –           |
| [07](./07-split-cloud-store.md)             | Split the cloud store              | Maintainability      | Medium | Not started | 01 _(soft)_ |
| [08](./08-pin-container-base-image.md)      | Pin the container base image       | Build / supply chain | Small  | In progress | –           |
| [09](./09-articulation-notation.md)         | Articulation notation              | Notation / parser    | Large  | In progress | –           |
| [10](./10-rhythm-and-durations.md)          | Rhythm and note durations          | Notation / playback  | Large  | Not started | 09 _(soft)_ |
| [11](./11-repeats-and-tempo-markers.md)     | Repeats and tempo markers          | Notation / playback  | Medium | Not started | 10 _(soft)_ |
| [12](./12-public-library-browsing.md)       | Improve the public library         | UX                   | Medium | Not started | –           |
| [13](./13-print-stylesheet.md)              | Print stylesheet                   | UX                   | Small  | In progress | –           |

A **soft** dependency means the tasks edit the same files, not that one needs the
other's feature. They can be done in either order, but not at the same time.

## Status values

| Status        | Meaning                                                     |
| ------------- | ----------------------------------------------------------- |
| `Not started` | Available to pick up                                        |
| `In progress` | An agent or person is working on it — do not start a second |
| `Blocked`     | Cannot proceed; the file must say why                       |
| `Done`        | Merged to `main` and verified                               |

## Working on a task

1. Read [ROADMAP.md](./ROADMAP.md) first and confirm nothing conflicting is
   `In progress`.
2. Set the task's **Status** to `In progress` in both its file and the table
   above, as the first commit of the session. This is how parallel sessions avoid
   colliding.
3. Do the work. Treat the task file as a brief, not a specification — if
   something in it turns out to be wrong or a better approach appears, update the
   file to match reality rather than silently diverging.
4. Record decisions in the task file. Several tasks ask for an explicit choice
   (the rhythm model in [10](./10-rhythm-and-durations.md), repeat rendering in
   [11](./11-repeats-and-tempo-markers.md)). Write down what was chosen and why,
   so the next session does not reopen it.
5. Run the validation commands listed in the task before claiming completion.
6. Set **Status** to `Done` and note anything deliberately left out.

If a task is finished but turned up follow-up work, add a new numbered file
rather than growing the original.

## Conventions

- Files are `NN-kebab-case-title.md`. Numbers are stable identifiers and give a
  rough thematic grouping, **not** a priority order — the recommended order is in
  [ROADMAP.md](./ROADMAP.md).
- Never renumber an existing task; other files and sessions link to it. New tasks
  take the next free number.
- Keep links relative so they resolve on GitHub and in an editor.

## Project rules that apply to every task

- [AGENTS.md](../AGENTS.md) governs anything touching Firestore rules, indexes,
  document schemas, paths or queries. Required Firebase changes must be validated
  and deployed **before** pushing the dependent client. This is not optional and
  most relevant to [04](./04-firebase-app-check.md), [05](./05-rules-tests-in-ci.md)
  and [12](./12-public-library-browsing.md).
- Test and production share the Firebase project `basstabs-by-bear`, so a rules
  or index deployment affects live users immediately.
- Baseline on a clean `main`: `npm run lint`, `npm run check`, `npm test`
  (177 passed, 7 skipped) and `npm run build` all pass. Keep it that way.
