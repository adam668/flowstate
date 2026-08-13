# FlowState — Calendar & Daily Journal Design

Date: 2026-08-13
Status: Approved for planning

## Summary

The first feature in FlowState's post-launch roadmap, aimed at competing with TradeZella by leaning into what already differentiates FlowState (prop-firm rule tracking) rather than chasing full feature parity. This feature adds two tightly-coupled pieces: a **Calendar view** (P&L heatmap + behavior-tag indicators, from the original app spec's Open Items) and a **Notion-style Daily Journal** — one rich, block-based journal page per calendar day, with images and user-created reusable templates.

## Goals

- One journal page per calendar day (not per account) — a single place to write about a trading day regardless of how many accounts were traded.
- Real block-based rich text editing: headings, lists, checkboxes, drag-to-reorder blocks, slash-command insertion, inline images — not a plain textarea.
- User-created, reusable templates (save any entry as a template, manage a personal template library, insert a template's content into any entry).
- Calendar as both a P&L-at-a-glance heatmap and the primary navigation surface into daily journal pages.
- A separate Journal section for browsing/searching all entries and managing templates, independent of the calendar grid.
- Fully local — journal content and images stored in SQLite / the local filesystem, no network calls, consistent with the rest of the app.

## Non-goals

- Analytics view, playbooks/strategies, broker/CSV import — separate roadmap items, each gets its own future spec.
- Nested pages / sub-pages within a journal entry (BlockNote's block model, not a full Notion page hierarchy).
- Collaborative editing, comments, or any multi-user feature — FlowState is single-user.
- Templates with dynamic/computed content (e.g. auto-inserting today's trades into a template) — templates are static block content the user designed; linking a day's trades into an entry is a manual/future affordance, not part of this spec.

## Architecture

- **Editor**: [BlockNote](https://www.blocknotejs.org/) — an open-source, React-native block editor built specifically for Notion-style editing (slash commands, drag handles, nested list/checkbox blocks, image blocks) on top of ProseMirror/Tiptap. Themed via BlockNote's theming API to use FlowState's existing CSS custom properties (surfaces, borders, `--mono`/`--sans`, `--accent`) rather than its default visual style — no new colors introduced, per the locked visual direction in `.interface-design/system.md`.
- **Storage**: two new SQLite tables (`journal_entries`, `journal_templates`), both storing their rich content as a JSON string (BlockNote's block array serializes to JSON). Local day convention (`toLocalDateString`, already shared between the rule engine and IPC layer) is reused for `journal_entries.date`, so "today's journal page" and "today's P&L" always agree on what day it is.
- **Images**: pasted or drag-dropped images are copied into `<userData>/journal-images/` (mirroring the original spec's screenshot-handling intent — copy into an app-managed directory, never reference the original source path). A custom Electron protocol, `flowstate-media://`, is registered in the main process and serves files from that directory; block content stores `flowstate-media://<filename>` URLs rather than raw filesystem paths, keeping the renderer's `contextIsolation`/`nodeIntegration: false` posture intact (no raw `file://` access, no path traversal outside the managed directory).
- **IPC**: new namespaces on `window.api`, following the existing pattern exactly — `journalEntries.{getByDate, upsert}`, `journalTemplates.{list, create, update, delete}`, `media.saveImage`.

## Data Model

- **`journal_entries`**: `id`, `date` (`TEXT UNIQUE`, local `YYYY-MM-DD`), `content` (`TEXT`, JSON-serialized BlockNote document), `created_at`, `updated_at`.
- **`journal_templates`**: `id`, `name` (`TEXT`), `content` (`TEXT`, same JSON shape as entries), `created_at`.
- No foreign keys to `accounts`/`trades` in this spec — an entry is date-scoped, not account-scoped, matching the "one page per day" decision. A future spec may add a lightweight trade-reference/link affordance; not built here.

## Calendar View

Month grid (reusing the app's existing grid/token patterns). Each day cell:
- Shaded by that day's aggregate P&L across **all** accounts (sum of all trades whose `exitTime` falls on that local day) — `--pnl-pos`/`--pnl-neg` tokens only, matching the existing trade-table/gauge color language. A day with no trades is unshaded (neutral surface).
- Shows a small amber dot if any trade that day carries a flagged behavior tag (the tag vocabulary is already user-defined and ad-hoc per the original spec — this reuses the existing `tags`/`trade_tags` tables, no new tag concept).
- Clicking a day opens that day's journal entry in an editor pane — if none exists yet for that date, an empty one is created on first save (not on click, to avoid littering the database with empty rows for days the user merely glanced at).

## Journal Section

A new top-level sidebar item (replacing the current disabled "Calendar" *and* introducing a new "Journal" entry — Calendar was already a planned, currently-disabled nav item per the app shell; this spec activates it and adds Journal alongside).

- **Entry list/search**: reverse-chronological list of all journal entries, with a text search that matches against entry content (plain-text-extracted from the block JSON for search purposes — no separate full-text index needed at this scale).
- **Template library**: list of saved templates; create a new template from scratch (opens a blank editor, save gives it a name) or from an existing entry ("Save as template" action); rename and delete; inserting a template appends its blocks into whatever entry is currently open.

## Error Handling

- Autosave, not explicit save: entry content persists on a debounced interval (matching how a notebook app should feel — no "unsaved changes" anxiety). A failed autosave surfaces via the existing `ErrorBanner` pattern, and retries on the next debounce tick rather than losing the edit (the in-editor content is the source of truth until a write succeeds; nothing is cleared on failure).
- `media.saveImage` failures (disk full, permission error) surface via `ErrorBanner`; the image block shows a broken-image placeholder rather than crashing the editor.
- Deleting a template requires a confirmation step (destructive, not undoable) — mirroring the care already taken around destructive actions elsewhere in the app's design conventions.
- `flowstate-media://` protocol handler validates the requested filename resolves inside `journal-images/` (no `..`/path traversal) before serving — a basic containment check appropriate for a local single-user app, not a full security sandbox.

## Testing

- `journal_entries`/`journal_templates` repository functions: unit tests for create/update/get-by-date, following the existing repo test pattern (in-memory SQLite).
- `flowstate-media://` protocol handler: unit test for the path-traversal guard (a `../`-containing request is rejected).
- Calendar cell P&L aggregation: unit test reusing the rule-engine's local-day trade-attribution convention, covering a day with trades from two different accounts (must sum both) and a day with none (neutral, no dot).
- BlockNote editor integration itself is not unit-tested in detail (it's a well-tested third-party library) — component tests cover FlowState's own wiring: that saving an entry round-trips through the IPC layer, and that inserting a template appends rather than replaces existing content.
- Manual verification pass in the running app: create an entry, add headings/lists/an image, save a template from it, apply that template to a different day, confirm the calendar cell coloring matches a day with known trades.

## Open Items for Future Versions

- Analytics view, playbooks/strategies, broker/CSV import (unchanged from the original spec's roadmap, now explicitly reprioritized behind this feature per this session's discussion).
- Linking specific trades into a journal entry (e.g. an inline trade-reference block).
- Full-text search performance at scale, if the plain-text-extraction search approach becomes slow with a large journal history.
