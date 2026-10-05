# 13 · Print stylesheet

- **Status:** Done
- **Area:** UX
- **Size:** Small
- **Depends on:** –
- **Blocks:** –

## Goal

Make a tab print cleanly on paper, with the tab itself legible and the app chrome
gone.

## Why

Sheet music gets printed and put on a stand. A bass tab app that cannot produce a
usable printout is missing an obvious affordance — and for a music tool this is
one of the cheapest wins available.

`grep -rn "@media print" src/` returns nothing: printing today produces the app
bar, buttons, the editor pane, and whatever the screen layout happens to do at
paper width.

## Current state

- Styles live in [`src/routes/layout.css`](../src/routes/layout.css) with
  Tailwind 4 and Skeleton's `vintage` theme, in light and dark mode.
- Dark mode is set by `data-mode` on `<html>` from an inline script in
  [`app.html`](../src/app.html) — **printing in dark mode would waste ink on a
  dark background**, so the print stylesheet must force light rendering.
- The tab view is [`src/routes/tab/[id]/+page.svelte`](../src/routes/tab/[id]/+page.svelte)
  with [`PlayableTab.svelte`](../src/lib/components/PlayableTab.svelte).
- Tab text is monospace with exact column alignment — the single thing that must
  survive printing intact.
- The app already offers copy-to-clipboard and `.txt` download, so print is the
  remaining output format.

## Scope

A `@media print` block, plus a **Print** action on the tab page.

Hide: the app bar, mode toggle, play/stop/loop/BPM controls, gutter play buttons,
the shorthand editor, save-location and visibility controls, and toasts.

Keep and improve:

- Title, artist and tuning as a heading — a printout needs to identify itself.
- The rendered tab, at a size that stays aligned.
- Section headings and annotations, which carry the structure.

Details worth getting right:

- Force light colours and remove background fills; `print-color-adjust` only where
  genuinely needed.
- Avoid breaking a system across pages (`break-inside: avoid` on each system).
- Syntax highlighting colours should degrade legibly — grey on white still needs
  contrast. Consider printing the tab in black and relying on layout alone.
- Add a footer or header line with the source URL for shared/public tabs.

## Acceptance criteria

- Print preview of a tab page shows the tab with correct column alignment and no
  app chrome.
- Printing in dark mode produces a light page.
- A multi-system tab paginates without splitting a system across pages.
- Section headings and annotations are present.
- The **Print** button is visible on screen and absent from the printed page.
- `/shared` tabs print too — a shared link is a likely thing to print.
- Screen rendering is entirely unaffected.

## Validation

```sh
npm run lint && npm run check && npm test && npm run preview
```

Then use the browser print preview (Ctrl+P) on:

- A local tab in light mode and in dark mode.
- A long multi-system tab.
- A `/shared?id=…` page and a `/shared#<payload>` snapshot.
- Both A4 and Letter, portrait.

No Firestore changes.

## Risks

- Tailwind 4's `print:` variants cover most needs; prefer them over hand-written
  CSS where practical, and keep anything global in `layout.css`.
- The monospace alignment is the whole value of the output. If the print font
  falls back to a proportional face, the tab becomes meaningless — specify the
  monospace stack explicitly in the print rules.

## Outcome

- Implemented visible **Print** actions on local tab and snapshot/live shared tab
  pages; the action calls `window.print()` and is hidden from print output.
- Added a separated `@media print` block at the end of
  `src/routes/layout.css` that forces light pages, black tab text, an explicit
  monospace stack, hidden app/playback/editor/cloud/toast chrome, and
  `break-inside: avoid` on rendered tab blocks.
- Added print-only local tab headings and kept shared tab headings visible, with a
  wrapped shared source URL footer.
- Left out Firestore changes and Firebase deployment because this task only
  changes client markup/CSS and documentation.
- Verification completed:
  `npm run lint && npm run check && npm test && npm run build`; production
  preview on port 4143; Playwright print-media PDF/PNG renders for local light
  A4, local dark Letter, shared snapshot light Letter, and shared snapshot dark
  A4. The renders were visually inspected for white pages, aligned monospace tab
  columns, section/comment presence, no app chrome, no visible print button, and
  wrapped shared source URL.
- Manual follow-up for a human reviewer: open browser print preview on a real
  saved/live shared tab if they want to validate an authenticated `/shared?id=…`
  link, because the automated print render used a snapshot hash link and did not
  contact Firebase.
