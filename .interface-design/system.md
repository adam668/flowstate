# FlowState — Design System

## Direction
A trading desk after hours, not a consumer finance app. Serious, disciplined, unglamorous — the tone stays flat on winning and losing days alike. No gamification (no streak badges, no confetti, no celebratory motion on green days).

**Domain world:** trailing drawdown, high-water mark, daily loss limit, evaluation vs. funded accounts, tick size, DOM/tape, order tickets, tilt/revenge trades, terminal glow.

## Palette
Single hue (blue-neutral graphite), shifted only in lightness. One decorative accent. Semantic color (P&L green/red) is reserved exclusively for actual P&L — nothing else borrows it.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0B0D0F` | page background |
| `--surface-1` | `#14171A` | cards, panels, header strip |
| `--surface-2` | `#1C2024` | nested surfaces (inputs receive a darker fill, not lighter) |
| `--surface-3` | `#23282D` | gauge tracks, recessed elements |
| `--border` | `rgba(255,255,255,0.08)` | standard border |
| `--border-soft` | `rgba(255,255,255,0.05)` | quiet dividers |
| `--text-primary` | `#E4E7EA` | primary text |
| `--text-secondary` | `#9BA3AB` | secondary/labels |
| `--text-muted` | `#5C646C` | metadata, captions |
| `--accent` | `#D99A3D` | the one decorative accent — focus states, active nav, warnings |
| `--pnl-pos` | `#3FB77F` | positive P&L only |
| `--pnl-neg` | `#E0594F` | negative P&L / hard-limit markers only |

Dark-first, single-theme by design (the terminal-at-night concept is the identity, not a mode).

## Typography
- **Mono** (JetBrains Mono / SF Mono / ui-monospace) for every figure: prices, P&L, contract counts, timestamps. Always `font-variant-numeric: tabular-nums`.
- **Sans** (Inter / system) for prose, labels, navigation.
- Scale: `display 40px/600 (mono)` · `h1 24px/600` · `label 12px/500 uppercase, tracked` · `body 14px/400 secondary` · `mono-data 13px`.

## Depth & Spacing
- **Depth strategy: borders-only.** No shadows, no soft elevation blur — low-opacity rgba borders throughout. Matches the "technical instrument" feel.
- **Density: tight/workbench.** 12–16px component padding, not brochure-airy.
- **Radius:** 4px (gauge track, recessed) · 8–10px (cards/panels). Concentric — nested radius = outer − padding.

## Key Component Patterns
- **Drawdown gauge** (signature element) — a ruled instrument, not a generic progress bar. Tick marks reference the account's real high-water mark; a marked hard-limit line (not just an end-of-bar color change) shows the actual breach point. Used per-account wherever trailing/static drawdown needs to be shown.
- **Ambient rule-status strip** — lives in the header/dashboard, not a page you have to visit. Segmented row (`.strip` / `.strip-item`), one item per active account: today's P&L (mono, tabular, colored pos/neg), limit remaining as a sub-line, warning dot (`--accent`) only when near a threshold. This is the always-visible surface for the rule engine.
- **Metric hierarchy:** label `11px/500/muted/tracked` → value `28–40px/600/primary or semantic/tabular-nums` → delta `12px/500/semantic`. Never flat single-size number blocks.

## Rejected Defaults
- Green/red as a general "trading app" decorative palette → reserved strictly for P&L semantics.
- Gamified badges/streak celebrations → flat instrument tone throughout.
- Equal-weight KPI card grid on Dashboard → ambient status strip (header) + one dominant equity curve as the single focal element; other metrics demoted to a lower tier.

## Reference
Specimen: `flowstate-direction.html` (published as Artifact "FlowState — Visual Direction"), approved 2026-08-11.
