# FlowState — v1 Update Design

Date: 2026-08-24
Status: Approved for planning

## Summary

Seven independent features to round FlowState out toward a v1 release: Goals/evaluation progress, trade screenshots, Trade Log search/filter, a Settings page, a light theme + accent-color picker, CSV/PDF export, and DB backup/restore. Each is scoped to be independently buildable and testable; the only real coupling is that the theme picker, accent picker, and export/backup actions all live on the new Settings page and share one `settings` table.

## Goals

- Surface the prop-firm progress data that already exists on `RuleProfile` (`profitTarget`, `minTradingDays`) but is never computed or shown.
- Let traders attach chart screenshots to trades — the schema already has `screenshot_paths`, it's just never written to or read from in the UI.
- Make the Trade Log usable once an account has hundreds of trades (filter by instrument/tag/playbook/date).
- Add a real Settings page as the home for app-level preferences, starting with theme (dark/light) and accent color.
- Let a trader export their trade history (CSV) or a printable performance report (PDF) — for taxes or for submitting an evaluation payout request.
- Let a trader back up and restore their local SQLite database, since everything today lives only in `userData/flowstate.db` with no export path.

## Non-goals

- Cloud sync / multi-device — backup/restore is manual, file-based, single-device.
- Custom/arbitrary accent colors (a color wheel) — a curated preset list only, consistent with the "one accent, used with intention" design principle.
- Export templates or customization — one CSV shape, one PDF report shape, no configuration.
- Automatic/scheduled backups — user-triggered only.
- Multi-select/bulk actions in the Trade Log filter (e.g., bulk delete/bulk tag) — filtering only.
- Screenshot annotation/markup — attach and view only, no drawing tools.

## Architecture Overview

No architectural restructuring — every feature is additive within the existing main/preload/renderer split and IPC-namespace pattern (`flowStateApi.<domain>.<verb>`). New pieces:

- One new table: `settings` (single row, id fixed at 1).
- One new main-process module: `src/main/export/` (CSV + PDF generation) and light additions to `src/main/index.ts` for backup/restore (uses `dialog` and `fs`, both already available since `media.ts` uses `fs`).
- One new IPC namespace each for `settings`, `export`, `backup` — following the existing pattern exactly (repo function → `ipcMain.handle` → preload wrapper → renderer call).

---

## 1. Goals / Evaluation Progress

**Data**: `RuleProfile.profitTarget: number | null` and `minTradingDays: number | null` already exist and are already loaded wherever `RuleStatus` is computed — nothing new to fetch.

**`computeRuleStatus` additions** (`src/main/ruleEngine/computeRuleStatus.ts`):
- `profitTargetPercent: number | null` — `(currentBalance - startingBalance) / profitTarget * 100`, clamped to a minimum of 0 (a drawdown day doesn't show negative progress). `null` when `profitTarget` is `null`.
- `tradingDaysCount: number` — count of distinct local calendar days with at least one trade (reuses `computeDayAggregates` from `src/shared/calendar.ts`, already a dependency of this file for the consistency rule).
- `tradingDaysRemaining: number | null` — `max(0, minTradingDays - tradingDaysCount)`. `null` when `minTradingDays` is `null`.

**`RuleStatus` type** (`src/shared/types.ts`) gains these three fields.

**UI**: new `GoalsPanel` component (`src/renderer/src/components/GoalsPanel.tsx`), visual sibling of `DrawdownGauge`/`ConsistencyPanel` — same `.gauge-card` family, two independent bars stacked in one card (profit target progress, trading-days progress) rather than two separate cards, since they're both "how close to evaluation pass" framing. Rendered on Dashboard per account, only showing whichever of the two bars has non-null data (an account with a profit target but no min-trading-days requirement shows one bar, not an empty second one).

## 2. Trade Screenshots

**Data flow**: reuses the existing `flowstate-media://` protocol and `flowStateApi.media.saveImage(base64, mimeType)` built for journal images — no new main-process media code needed. `Trade.screenshotPaths: string[]` already exists in the schema and type; it's just never populated (`TradeQuickAddForm` always sends `[]`) or read.

**`UpdateTradeReflection` gains `screenshotPaths?: string[]`** — the one missing piece. `trades.repo.ts`'s `updateTradeReflection` needs to persist it (currently the function doesn't touch `screenshot_paths` at all).

**UI** (`TradeRow.tsx` expand-out): a new field alongside the existing reflection fields —
- A hidden `<input type="file" accept="image/*" multiple>` triggered by a styled button ("Add screenshot"), following the same base64-encode-then-`media.saveImage` pattern already implemented in `JournalEntryEditorBody`'s `uploadFile` callback.
- A thumbnail strip (`flowstate-media://` URLs, same protocol journal images already use) below the reflection fields, each with a small `×` to remove it from the in-memory `screenshotPaths` array (removal doesn't delete the file on disk — same non-goal as journal images, which also never delete orphaned files).
- Saving the row includes the current `screenshotPaths` array in the `trades:update` payload, same as every other field.

**Non-goal callback**: no image markup/annotation, no lightbox/zoom for v1 — thumbnails link isn't clickable-to-enlarge; a full-size view is a natural v2 addition once the pattern is in place.

## 3. Trade Log Search/Filter

Pure client-side filtering, no new IPC or schema — `TradeLogView` already loads the full trade list for the selected account into memory.

**New `computeFilteredTrades` pure function** (`src/shared/tradeFilters.ts`, mirroring the `src/shared/analytics.ts`/`calendar.ts` pattern) taking `(trades: Trade[], filters: TradeFilters) => Trade[]`, where:
```ts
interface TradeFilters {
  instrument: string       // case-insensitive substring match, '' = no filter
  tagId: number | null     // exact match against tagIds, null = no filter
  playbookId: number | null
  dateFrom: string | null  // local YYYY-MM-DD, inclusive, matched against exitTime's local day
  dateTo: string | null    // inclusive
}
```

**UI** (`TradeLogView.tsx`): a filter bar above the trade table — instrument text input, tag `<select>` (populated from the same tags list already available via `getOrCreateTag`/new `tags:list`), playbook `<select>` (from `flowStateApi.playbooks.list()`, same call `AnalyticsView` already makes), two date inputs. `filteredTrades = useMemo(() => computeFilteredTrades(trades, filters), [trades, filters])` replaces the current `trades.map(...)` in the table body. An empty-state message ("No trades match these filters") replaces the table when `filteredTrades.length === 0 && trades.length > 0`, distinct from the existing "Create an account first" empty state.

## 4. Settings Page

**New table** `settings` (schema.ts): single row, `id INTEGER PRIMARY KEY CHECK (id = 1)`, `theme TEXT NOT NULL DEFAULT 'dark'`, `accent_color TEXT NOT NULL DEFAULT '#D99A3D'`. Seeded with the one row (`id=1`) on first `applySchema` run if absent (`INSERT OR IGNORE INTO settings (id, theme, accent_color) VALUES (1, 'dark', '#D99A3D')`), so a `getSettings` call never has to handle a missing row.

**`src/main/db/settings.repo.ts`**: `getSettings(db): Settings` (always returns the one row), `updateSettings(db, updates: UpdateSettings): Settings` (partial update, same `!== undefined` pattern as every other repo's update function).

**Shared types**: `Settings { theme: 'dark' | 'light'; accentColor: string }`, `UpdateSettings { theme?: 'dark' | 'light'; accentColor?: string }`.

**IPC**: `settings:get`, `settings:update` — same pattern as every other namespace.

**New Sidebar entry + `SettingsView.tsx`**: loads settings on mount, renders the theme toggle and accent picker (below), plus the Export and Backup/Restore action buttons (sections 6–7). A settings change (theme/accent) calls `settings:update` immediately on selection — no separate "Save" button, consistent with how other instant-apply toggles in the app behave.

**App-level application**: `App.tsx` loads settings once on mount (alongside the existing update-status fetch) and sets `document.documentElement.dataset.theme = settings.theme` and `document.documentElement.style.setProperty('--accent', settings.accentColor)` — both are cheap, synchronous DOM operations applied as soon as the settings promise resolves. A brief flash of default dark/amber on cold start is accepted (same tradeoff Artifacts make for `prefers-color-scheme`) rather than adding complexity to avoid it.

## 5. Theme System (Light Theme + Accent Picker)

**Light palette** — new tokens in `tokens.css` under `:root[data-theme="light"]`, following the project's existing single-hue-shifted-by-lightness rule but inverted (light backgrounds, dark text), keeping the same semantic mapping (`--pnl-pos`/`--pnl-neg` unchanged in meaning, `--accent` becomes user-selectable — see below). Every other file in the app already consumes tokens, never raw hex, so no component changes are needed beyond this one token block — this is the payoff of the token-only styling discipline already in place.

Because `.interface-design/system.md` currently documents "dark-first, single-theme by design," this spec updates that doc once the light theme ships: the "terminal at night" identity remains the *default* and the primary design target, but light mode is now a supported, real (not half-finished) alternative — every component must be checked against both palettes during the design pass, not just spot-checked.

**Accent picker**: a curated list of 5 preset hex values (the existing `#D99A3D` amber plus four more chosen during implementation to fit the trading-desk world — e.g., a cool blue, a muted green that's visibly distinct from `--pnl-pos`, etc. — picked and swatched during the `interface-design` pass, not decided in this spec). Rendered as a small row of color swatches in Settings; clicking one calls `settings:update({ accentColor })`.

**Why a CSS custom property override instead of a token file per accent**: `--accent` already is the single decorative-color variable every component references (per the existing design system's "one accent" rule) — overriding it via `style.setProperty` on `:root` at app start is the minimal-surface-area approach, no per-component changes.

## 6. Export (CSV / PDF)

**CSV** (`src/main/export/csv.ts`): given an account's trades, builds a CSV string (headers: date, instrument, side, size, entry, exit, pnl, r-multiple, playbook, tags, setup thesis, execution notes, lessons learned) using manual string-building (no new dependency — trade data has no embedded commas/newlines risk beyond text fields, which get standard CSV-quote-escaping). Triggered via `export:csv` IPC handler: opens `dialog.showSaveDialog` (default filename `flowstate-<account>-<date>.csv`), writes with `fs.writeFileSync` if the user didn't cancel.

**PDF** (`src/main/export/pdf.ts`): renders a printable "Evaluation Report" — account name, date range, starting/ending balance, win rate, total trades, best/worst day, drawdown/consistency/goals status — as an off-screen `BrowserWindow` loading a small self-contained HTML string (inline styles, no dependency on the app's own CSS/React bundle, since `printToPDF` needs a fully separate renderer load). Calls `webContents.printToPDF()` (built into Electron, zero new dependencies), then the same `dialog.showSaveDialog` + `fs.writeFileSync` pattern as CSV. The off-screen window is destroyed after the PDF buffer is captured.

**IPC**: `export:csv(accountId)`, `export:pdf(accountId)` — both return `Promise<void>` (success/cancel are indistinguishable to the caller; a failed write throws and surfaces via the existing `ErrorBanner` pattern).

**UI**: two buttons on the Settings page ("Export trades (CSV)", "Export evaluation report (PDF)"), each preceded by an account `<select>` since export is per-account.

## 7. Backup / Restore

**Backup**: `backup:create` IPC handler — `dialog.showSaveDialog` (default filename `flowstate-backup-<date>.db`), then `fs.copyFileSync(currentDbPath, chosenPath)`. Safe to do live since `better-sqlite3` (used in WAL-off default mode here — confirmed no `PRAGMA journal_mode=WAL` is set anywhere in `connection.ts`) writes are synchronous and the file is consistent between statements.

**Restore**: `backup:restore` IPC handler — `dialog.showOpenDialog` (filter `*.db`), then:
1. Confirm via a renderer-side `window.confirm` before invoking (destructive — replaces all current data).
2. Validate the chosen file *before* touching the live DB: open it with `new Database(chosenPath, { fileMustExist: true, readonly: true })` and run `SELECT 1`; if either throws, abort with an error surfaced through `ErrorBanner` and the live DB is untouched. Close this validation connection immediately after.
3. Close the existing `better-sqlite3` connection (`db.close()`).
4. `fs.copyFileSync(chosenPath, currentDbPath)`.
5. `app.relaunch(); app.exit()` — the simplest correct way to get a fully clean reload of every in-memory renderer/main state that assumes the old DB (accounts list, cached trades, etc.), rather than trying to hot-reconnect and re-fetch everything from every open view.

**UI**: two buttons on the Settings page ("Back up data...", "Restore from backup..."), restore gated by the confirm dialog described above, both using the existing `ErrorBanner` pattern for failure (e.g., an invalid restore file is caught by step 2's validation and reported without ever touching the live DB).

## Data Model Summary

- New table: `settings` (single row).
- `trades.screenshot_paths` — existing column, now actually written to via `updateTradeReflection`.
- No other schema changes. Everything else (Goals, filtering, export, backup) reads existing data.

## Error Handling

Every new IPC call follows the existing pattern: try/catch in the renderer, `setError`, dismissable `ErrorBanner`. Backup/restore additionally validates the target file before committing (see above) so a bad restore attempt never corrupts the live database.

## Testing

- **Repo/pure-function tests**: `computeRuleStatus`'s three new fields (clamping, null-profile cases); `computeFilteredTrades` (each filter independently and combined, case-insensitive instrument match, date-range inclusivity); `settings.repo.ts` (`getSettings` returns the seeded row, `updateSettings` partial-update semantics); CSV builder (header shape, quote-escaping a field containing a comma).
- **Component tests**: `GoalsPanel` renders correct bar widths; `TradeRow` screenshot add/remove updates the save payload; `TradeLogView` filter bar narrows the rendered rows; `SettingsView` calls `settings:update` with the right shape on theme/accent change and calls `export`/`backup` IPC methods on button click.
- **Manual verification** (each needs a real Electron run, not just Vitest): PDF export actually produces a readable file; backup/restore round-trip (back up, make a change, restore, confirm the change is gone and the app relaunches cleanly); light theme spot-check across every existing view (Dashboard, Trade Log, Accounts, Calendar, Journal, Analytics, Playbooks) for readability/contrast, since `--pnl-pos`/`--pnl-neg`/`--accent` semantics must hold in both palettes.

## Open Items for Future Versions

- Screenshot annotation/lightbox.
- Bulk actions in the filtered Trade Log (bulk tag, bulk delete).
- Scheduled/automatic backups.
- Cloud sync.
- Custom (non-preset) accent color input.
