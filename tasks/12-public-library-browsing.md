# 12 · Improve the public library

- **Status:** Not started
- **Area:** UX
- **Size:** Medium
- **Depends on:** –
- **Blocks:** –

## Goal

Make `/public` worth browsing: previews, tuning, and a way to find something.

## Why

[`src/routes/public/+page.svelte`](../src/routes/public/+page.svelte) renders a
card with only the title and artist:

```svelte
<h2 class="h5 break-words">{tab.title || 'Untitled tab'}</h2>
<p class="break-words opacity-70">{tab.artist || 'Unknown artist'}</p>
```

The public library is the app's only discovery surface and the only page a
search engine indexes, yet it shows less than the home page does for local tabs —
which already renders a real tab preview. A visitor cannot tell a 4-string walking
line from a 5-string riff without opening each one.

## Current state

- Loads 24 at a time from `publishedTabs` with `where('visibility','==','public')`,
  `orderBy('updatedAt','desc')`, cursor pagination via `startAfter`, and a **Load
  more** button.
- Backed by the composite index in
  [`firestore.indexes.json`](../firestore.indexes.json)
  (`visibility` ASC, `updatedAt` DESC), which is already deployed.
- Handles `failed-precondition` with a "still being prepared" message.
- The home page ([`+page.svelte`](../src/routes/+page.svelte)) already builds
  previews with `renderTab` and trims to the first system — reuse that approach
  via [`TabPreview.svelte`](../src/lib/components/TabPreview.svelte).

## Scope

In rough priority order:

1. **Tab previews.** Reuse the home page's first-system approach. The documents
   already contain the source, so this needs no extra reads.
2. **Tuning badge.** 4/5/6-string is decisive information for a player.
3. **Client-side filtering** over already-loaded tabs, mirroring the home page's
   title/artist search. Cheap, no extra reads, and honest if labelled as filtering
   the loaded list.
4. **Sort options** — most recent (current) vs. oldest. Anything beyond
   `updatedAt` needs a new composite index; see the warning below.
5. **Empty and loading states.** "No public tabs yet." is fine but a skeleton
   while loading would avoid the current blank flash.

### Explicitly out of scope (for now)

**Real full-text search.** Firestore cannot do substring search; it would need a
search service or a denormalized keyword array. That is a separate decision about
cost and complexity — do not quietly add a third-party search dependency here.

Likewise **popularity sorting**, which needs view or save counters that do not
exist and would mean writes from unauthenticated readers — a rules and abuse
question of its own.

## Firestore considerations — read before coding

Per [AGENTS.md](../AGENTS.md), any change to queries, indexes or rules must be
validated and deployed **before** the dependent client is pushed.

- Previews, badges and client-side filtering need **no** index or rules change.
  Prefer this scope and the task stays client-only.
- Adding a sort field (for example `createdAt` or `title`) **requires a new
  composite index** in [`firestore.indexes.json`](../firestore.indexes.json),
  deployed and finished building _before_ the client that queries it ships.
  Otherwise users hit the `failed-precondition` path.
- Do not add fields to published documents without checking
  [`firestore.rules`](../firestore.rules), which requires the projection to match
  its canonical tab. And never put private information — owner email or Google
  profile — into a published document.

## Acceptance criteria

- Each card shows a readable tab preview and its tuning.
- Filtering narrows the loaded list and makes clear it searches loaded tabs only.
- **Load more** still paginates correctly, and filtering plus pagination compose
  sensibly (a filtered view should not look like the end of the list).
- No increase in Firestore reads per visit.
- The page still works signed out, which is its whole point.
- Long titles, missing artists and empty sources still render without breaking
  the grid.

## Validation

```sh
npm run lint && npm run check && npm test
```

If indexes changed:

```sh
npx --no-install firebase deploy --project basstabs-by-bear --only firestore:indexes --non-interactive
```

Confirm the index finished building before releasing queries that need it, and
record the verification in the completion summary.

## Risks

- Rendering 24 previews per page is more client work than two lines of text.
  Measure; `renderTab` is fast, but trim to the first system as the home page does.
- The page is public and `noindex` is _not_ set here (unlike tab and shared
  pages), so content is indexable — another reason previews should be real
  rendered tab rather than raw shorthand.
