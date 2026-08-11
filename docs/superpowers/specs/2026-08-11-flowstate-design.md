# FlowState — Design Spec

Date: 2026-08-11
Status: Approved for planning

## Summary

FlowState is a desktop journaling app for futures traders on prop firm accounts (Topstep, Apex, FTMO-style, etc.), built with Electron. It unifies three things that are usually kept in separate tools: automatic prop-firm rule tracking (drawdown, daily loss limits, consistency), trade performance analytics, and trading psychology/behavior journaling — all local, single-user, no backend.

## Goals

- Make prop firm rule violations visible *before* they happen, not after, via an automatically computed rule engine (not a manual checklist).
- Reduce the friction of logging a trade to near-zero so journaling actually happens.
- Support multiple firms and multiple accounts simultaneously, each with its own rule profile.
- Capture the behavioral/psychological side of trading (tags, notes, screenshots) alongside the numbers, so patterns are visible over time (calendar, analytics).
- Fully local: private, no accounts, no network dependency. Data portability via export/import.

## Non-goals (v1)

- No cloud sync / multi-device backend.
- No automatic broker/platform import (CSV import is a deliberate v2 addition — data model should not preclude it).
- No mobile app.

## Architecture

- **Electron main process**: owns the SQLite database (`better-sqlite3`), handles file system access for screenshot storage, exposes a typed IPC API to the renderer. No network calls.
- **Renderer**: React + TypeScript SPA, five views sharing a client-side query layer over IPC. Charts via Recharts.
- **Storage**: local SQLite file. Built-in export (full DB or JSON dump) / import for backup and manual sync (e.g. via a synced folder).

## Data Model

- **`accounts`** — firm name, account name, starting balance, currency, status (evaluation / funded / failed), `rule_profile_id`.
- **`rule_profiles`** — drawdown type (trailing / static), drawdown amount, daily loss limit, consistency %, min trading days, profit target. Reusable templates, cloned per account and editable per account.
- **`trades`** — account_id, instrument, side, entry/exit price & time, size, P&L, R-multiple, notes, screenshot paths; tags via a many-to-many join table.
- **`tags`** — user-defined, ad-hoc (both setup tags like "ORB breakout" and psychology tags like "FOMO", "revenge trade"). Not a hardcoded enum.
- **`daily_logs`** — account_id, date, aggregated P&L, rule status snapshot, freeform day note.

## Rule Engine

A pure function over an account's trade history + starting balance + rule profile. Computes:
- Running balance and trailing high-water mark (for trailing drawdown types).
- Today's P&L vs. daily loss limit.
- Consistency % and min-trading-days progress, where the rule profile defines them.

Produces two states per relevant metric: **violation** (limit breached) and **warning** (e.g. within 10% of a limit). Recomputed on every trade insert/edit. Surfaced ambiently (Dashboard header strip, per-account gauge) rather than requiring navigation to see.

## Visual Direction

Established and approved in `.interface-design/system.md` (project root). Summary:

- **Concept**: a trading desk after hours — serious, disciplined, unglamorous. Flat emotional tone on both winning and losing days; no gamification (no streaks, no badges, no celebratory motion).
- **Palette**: single graphite hue shifted only in lightness (`#0B0D0F` → `#23282D`), one decorative accent (`#D99A3D` amber), P&L green/red (`#3FB77F` / `#E0594F`) reserved strictly for actual P&L values.
- **Type**: monospace (tabular figures) for all numeric data; sans for prose/labels/navigation.
- **Depth**: borders-only, low-opacity rgba, no shadows. Tight/workbench density (12–16px padding).
- **Signature component**: the drawdown gauge — a ruled instrument with tick marks referencing the account's actual high-water mark and a marked hard-limit line, used both on the Dashboard's ambient status strip and on the Accounts view.

## Views

### Dashboard
Ambient rule-status strip pinned at top — one segment per active account (today's P&L, limit remaining, amber warning dot near threshold). Below it, one dominant equity curve for the selected account as the single focal element. Secondary metrics (win rate, avg R, trades today) demoted below in a label → value → delta hierarchy, not an equal-weight KPI card grid.

### Trade Log
Keyboard-first quick-add bar (instrument, side, size, entry, exit → P&L auto-calculated; full tab-through, submit without a mouse). Dense mono-figure table below. Tags, notes, and screenshot attachment live in a per-row expand-out so they never block quick entry. Screenshot paste (clipboard) and drag-and-drop both supported directly in the expand-out, with thumbnail preview.

### Accounts
One card per account — firm, phase, rule profile — built around the drawdown gauge component, so configuring a rule profile and viewing its live status use the same visual instrument as the Dashboard strip.

### Calendar
Month grid; cells shaded by day P&L (pos/neg tokens only, no extra decorative color). Small amber dot on any day containing a flagged psychology tag, so behavioral patterns are visible without opening the day. Click-through to that day's trades and notes.

### Analytics
Equity curve (hero), win rate by setup tag, win rate by time-of-day, R-multiple distribution histogram. Same mono/tabular, borders-only, single-accent treatment as the rest of the app — no default chart-library colors.

## Error Handling

- Rule engine calculations are derived, not stored as source of truth — if a trade is edited/deleted, dependent daily_logs and rule status recompute rather than drift.
- Screenshot files are copied into an app-managed local directory (not referenced by original path) so moving/deleting the source file doesn't break the journal; broken references degrade to a placeholder, not a crash.
- Export/import validates schema version before importing; mismatched versions are rejected with a clear message rather than silently corrupting data.

## Testing

- Rule engine: unit tests per rule type (trailing drawdown, static drawdown, daily loss limit, consistency %) covering violation/warning/clean boundaries, since this is the app's core value and must be correct.
- Data layer: unit tests for trade CRUD and cascading recompute of daily_logs.
- Renderer: component tests for the trade quick-add form (keyboard flow, validation) and the drawdown gauge (rendering at various fill levels).
- Manual verification pass in the running Electron app for each of the five views before considering a milestone done, per this project's visual bar.

## Open Items for Future Versions

- CSV import from broker/platform exports (data model already supports this via the existing `trades` shape).
- Cloud sync, if multi-device need arises later.
