# FlowState — Advanced Trade Log & Universal Delete Design

Date: 2026-08-13
Status: Approved for planning

## Summary

Two changes to FlowState's trade logging: P&L becomes a manual field instead of auto-calculated from entry/exit/size, and the single freeform `notes` field is replaced by four structured reflection fields (Setup/Thesis, Execution Notes, Lessons Learned, Brainstorm). Alongside this, every deletable entity in the app (trades, journal entries, accounts) gets a delete affordance, with accounts requiring an explicit choice about their trades since trades reference accounts by foreign key. Journal templates are already deletable — no change there.

## Goals

- P&L is typed by the trader, not computed — handles partial fills, commissions, slippage, and any other real-world case the simple `(exit - entry) * direction * size` formula doesn't capture.
- Trade reflection uses four named fields instead of one blob, matching how a real post-trade review is structured (why you took it, what happened, what you'd change, anything else).
- Trades, journal entries, and accounts can all be deleted from the UI, with account deletion explicitly asking what to do about its trades rather than silently cascading or silently failing.
- Existing installs (v0.1.0/v0.2.0 are already released) don't lose data — the schema migration is additive and preserves existing `notes` content.
- New UI work goes through the `interface-design` skill so it stays consistent with the locked visual direction in `.interface-design/system.md`.

## Non-goals

- Rich text (BlockNote) for the new trade fields — they stay plain text; rich text remains a Journal-only feature.
- Editing an existing trade's price/size fields after creation (out of scope; only P&L and the four reflection fields are addressed here — a general trade-edit flow is a future item).
- Soft-delete / trash / undo — deletions are immediate and permanent, gated only by a confirmation dialog.
- Deleting rule profiles independently of their account (they have no standalone management UI today and aren't getting one here — they're deleted together with their account).

## Architecture

- **Schema migration**: `schema.ts`'s `applySchema` gets a new migration step that runs after the existing `CREATE TABLE` statements. It checks `pragma table_info(trades)` for the four new columns and adds any that are missing via `ALTER TABLE trades ADD COLUMN ...` (all nullable — SQLite can't add a `NOT NULL` column without a default to an existing table with rows). On the same pass, if `notes` has content and `execution_notes` is still empty for a row, it copies `notes` into `execution_notes` — a one-time backfill, not an ongoing sync. The `notes` column itself is left in place (unused going forward) rather than dropped, since `DROP COLUMN` on a live install is unnecessary risk for a column that costs nothing to leave alone.
- **`createTrade`** (`src/main/db/trades.repo.ts`) stops calling `computePnl` — `NewTrade` now requires `pnl` as an input field instead of deriving it. The rule engine and equity curve, which already consume `Trade.pnl` as a plain number, need no changes.
- **Delete repository functions**: `deleteTrade(db, id)`, `deleteJournalEntry(db, id)`, and `deleteAccount(db, id, { withTrades: boolean })` — the last one wraps the rule-profile + trades + account deletion in a single `db.transaction`, so a declined "delete trades too" never leaves a partial state (if `withTrades` is false and trades exist, the function throws before touching anything, since the FK constraint would block it anyway — the UI is expected to only call it with `withTrades: true` when trades exist, per the confirm-dialog flow below).
- **IPC/preload**: new channels `trades:delete`, `journalEntries:delete`, `accounts:delete` (accepting `{ id, withTrades }`), following the existing `flowStateApi` namespace pattern exactly.

## Data Model

- **`trades`** gains four nullable `TEXT` columns: `setup_thesis`, `execution_notes`, `lessons_learned`, `brainstorm`. `NewTrade` no longer includes `pnl` as derived — it's a required field the caller supplies, same as `entryPrice`/`exitPrice`. The `Trade` shared type gains `setupThesis: string | null`, `executionNotes: string | null`, `lessonsLearned: string | null`, `brainstorm: string | null`, replacing `notes: string | null` in the type (the underlying `notes` column stays in SQLite for migration purposes, but the TypeScript type and all app code stop referencing it after the one-time backfill).
- No new tables. Delete operations are plain `DELETE FROM <table> WHERE id = ?` (or, for accounts, a transaction deleting `trades WHERE account_id = ?`, then the `rule_profiles` row, then the `accounts` row).

## Trade Log UI

The quick-add form gains a `P&L ($)` input (required, numeric, no longer auto-computed and displayed as read-only — the trader types the real number). The four reflection fields move into the same per-row expand-out that already holds tags/notes/screenshots (from the original Trade Log design), replacing the single notes textarea with four labeled textareas: Setup/Thesis, Execution Notes, Lessons Learned, Brainstorm. A delete button (trash icon, following whatever pattern the `interface-design` pass settles on — likely matching the existing template-delete `×` button style) sits in the expand-out, gated by a confirm dialog.

## Delete UX

- **Trade**: `window.confirm('Delete this trade? This cannot be undone.')` → `trades:delete`.
- **Journal entry**: same pattern, from wherever the entry is being viewed (Journal section list, Calendar day panel) → `journalEntries:delete`.
- **Account**: clicking delete on an account with zero trades shows a plain confirm. Clicking delete on an account with N trades shows a confirm whose text states the count and asks to also delete the trades (e.g. "This account has 12 trades. Delete the account and all 12 trades? This cannot be undone.") — confirming calls `accounts:delete` with `withTrades: true`; declining cancels the entire operation, nothing is deleted.

## Error Handling

- Every new delete/create call follows the existing `ErrorBanner` convention already used throughout the app (try/catch, `setError`, dismissable banner) — a failed delete leaves the item in place and shows why.
- The migration step is defensive: column-existence checks mean re-running `applySchema` (which happens on every app start) is idempotent — it never re-adds a column or re-copies `notes` into an already-populated `execution_notes`.

## Testing

- Repository tests: `deleteTrade`, `deleteJournalEntry`, `deleteAccount` (both `withTrades: true` and the "has trades but withTrades: false throws" case), migration idempotency (running `applySchema` twice on the same DB doesn't error or double-copy `notes`), and `createTrade` no longer computing `pnl` (asserts the stored value matches whatever was passed in, including a value that would NOT match the old formula, to prove the calculation is truly gone).
- Component tests: the quick-add form submits the typed P&L value (not a computed one) to `trades.create`; each of the three delete confirm flows (trade/entry/account) calls the right IPC method only after confirmation, and calls nothing if the user cancels.
- Manual verification: create a trade with a P&L that wouldn't match entry/exit/size math, confirm it's stored as typed; delete a trade, a journal entry, and an account with trades (confirming both the "yes delete trades" and cancel paths).

## Open Items for Future Versions

- Editing an existing trade (price/size, not just the fields this spec covers).
- Soft-delete/undo, if accidental deletion turns out to be a real problem in practice.
