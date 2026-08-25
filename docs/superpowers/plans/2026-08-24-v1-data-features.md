# v1 Data Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent v1 features: Goals/evaluation-progress panel, trade screenshots, and Trade Log search/filter.

**Architecture:** All three are additive within the existing main/preload/renderer split. Goals extends `computeRuleStatus` (pure function, already the home of the drawdown/consistency rules) and adds a Dashboard panel. Screenshots wires up the already-existing but unused `screenshotPaths` field through the existing `flowstate-media://` upload path. Filtering is a pure client-side function over data `TradeLogView` already loads — no new IPC or schema.

**Tech Stack:** TypeScript, React, better-sqlite3, Vitest, existing `flowStateApi` IPC pattern.

**Spec:** `docs/superpowers/specs/2026-08-24-v1-update-design.md` (sections 1–3)

## Global Constraints

- Every new/changed function needs a failing test first (TDD Iron Law — no exceptions).
- New UI additions style via `.interface-design/system.md` tokens only — no raw hex outside `tokens.css`.
- `UpdateTradeReflection`/`Trade`/`RuleStatus` are shared types (`src/shared/types.ts`) consumed by both main and renderer — any field added there must keep every existing literal object in test files compiling (`npm run typecheck` catches this).
- After every task: `npm run typecheck` and `npm test -- run` must both be clean before moving to the next task.
- `npm test` rebuilds `better-sqlite3` for Node via its `pretest` hook; `npm run build`/`npm run dev` rebuild it for Electron. Running `build`/`dev` after `test` means running `npm test -- run` again before the next task's tests, per the project's existing convention (already true of every prior plan in this repo).

---

### Task 1: `computeRuleStatus` — Goals fields

**Files:**
- Modify: `src/shared/types.ts` (`RuleStatus` interface)
- Modify: `src/main/ruleEngine/computeRuleStatus.ts`
- Modify: `src/main/ruleEngine/computeRuleStatus.test.ts`

**Interfaces:**
- Produces: `RuleStatus.profitTargetPercent: number | null`, `RuleStatus.tradingDaysCount: number`, `RuleStatus.tradingDaysRemaining: number | null`

- [ ] **Step 1: Write the failing tests**

Add to `src/main/ruleEngine/computeRuleStatus.test.ts`, right before the final closing `})` of the `describe('computeRuleStatus', ...)` block:

```ts
  it('reports profitTargetPercent as null when the profile has no profit target', () => {
    const status = computeRuleStatus(account, ruleProfile, [], '2026-08-11')
    expect(status.profitTargetPercent).toBeNull()
  })

  it('computes profitTargetPercent as a percentage of net profit against the target', () => {
    const profile: RuleProfile = { ...ruleProfile, profitTarget: 9000 }
    const trades = [trade(4500, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.profitTargetPercent).toBe(50) // 4500 / 9000 * 100
  })

  it('clamps profitTargetPercent to zero when the account is in a net loss', () => {
    const profile: RuleProfile = { ...ruleProfile, profitTarget: 9000 }
    const trades = [trade(-1000, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.profitTargetPercent).toBe(0)
  })

  it('reports tradingDaysCount as the number of distinct local trading days', () => {
    const trades = [
      trade(100, '2026-08-09T14:00:00Z'),
      trade(-50, '2026-08-09T15:00:00Z'), // same day as above
      trade(200, '2026-08-10T14:00:00Z')
    ]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.tradingDaysCount).toBe(2)
  })

  it('reports tradingDaysRemaining as null when the profile has no minTradingDays', () => {
    const status = computeRuleStatus(account, ruleProfile, [], '2026-08-11')
    expect(status.tradingDaysRemaining).toBeNull()
  })

  it('computes tradingDaysRemaining against minTradingDays, clamped to zero', () => {
    const profile: RuleProfile = { ...ruleProfile, minTradingDays: 5 }
    const trades = [
      trade(100, '2026-08-08T14:00:00Z'),
      trade(100, '2026-08-09T14:00:00Z'),
      trade(100, '2026-08-10T14:00:00Z')
    ]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.tradingDaysCount).toBe(3)
    expect(status.tradingDaysRemaining).toBe(2) // 5 - 3

    const profileMet: RuleProfile = { ...ruleProfile, minTradingDays: 2 }
    const statusMet = computeRuleStatus(account, profileMet, trades, '2026-08-11')
    expect(statusMet.tradingDaysRemaining).toBe(0) // already exceeded, clamped not negative
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/ruleEngine/computeRuleStatus.test.ts`
Expected: 6 new failures — TypeScript reads `status.profitTargetPercent` etc. as `undefined` at runtime (vitest doesn't type-check test files at run time), so each `toBeNull()`/`toBe(N)` assertion fails with "expected undefined to be ...".

- [ ] **Step 3: Add the new `RuleStatus` fields**

In `src/shared/types.ts`, in the `RuleStatus` interface, add after `consistencyState: RuleState | 'n/a'`:

```ts
  profitTargetPercent: number | null
  tradingDaysCount: number
  tradingDaysRemaining: number | null
```

- [ ] **Step 4: Implement in `computeRuleStatus`**

In `src/main/ruleEngine/computeRuleStatus.ts`, after the existing consistency-rule block (which ends with the `consistencyState` assignment, right before the `return` statement), add:

```ts
  let profitTargetPercent: number | null = null
  if (ruleProfile.profitTarget !== null) {
    profitTargetPercent = Math.max(0, (totalProfit / ruleProfile.profitTarget) * 100)
  }

  const tradingDaysCount = computeDayAggregates(accountTrades).length
  const tradingDaysRemaining =
    ruleProfile.minTradingDays !== null
      ? Math.max(0, ruleProfile.minTradingDays - tradingDaysCount)
      : null
```

Then add the three new fields to the returned object, after `consistencyState`:

```ts
    consistencyState,
    profitTargetPercent,
    tradingDaysCount,
    tradingDaysRemaining
  }
}
```

(`totalProfit` already exists earlier in the function, computed for the consistency rule — reuse it, don't recompute.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/ruleEngine/computeRuleStatus.test.ts`
Expected: all tests pass (27 total: 21 existing + 6 new).

- [ ] **Step 6: Fix other `RuleStatus` literal fixtures**

Adding required fields to `RuleStatus` breaks any file with a hand-written `RuleStatus`-typed object literal that doesn't go through `computeRuleStatus`. Find them:

Run: `grep -rn "consistencyState:" src --include=*.ts --include=*.tsx`

For each match outside `computeRuleStatus.ts`/`computeRuleStatus.test.ts` (expect `src/renderer/src/views/DashboardView.test.tsx`'s `base` object), add the three new fields immediately after `consistencyState`:

```ts
  profitTargetPercent: null,
  tradingDaysCount: 0,
  tradingDaysRemaining: null
```

- [ ] **Step 7: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/ruleEngine/computeRuleStatus.ts src/main/ruleEngine/computeRuleStatus.test.ts src/renderer/src/views/DashboardView.test.tsx
git commit -m "feat: profit-target and trading-days progress in computeRuleStatus"
```

---

### Task 2: `GoalsPanel` component + Dashboard wiring

**Files:**
- Create: `src/renderer/src/components/GoalsPanel.tsx`
- Create: `src/renderer/src/components/GoalsPanel.test.tsx`
- Modify: `src/renderer/src/views/DashboardView.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `RuleStatus.profitTargetPercent`, `RuleStatus.tradingDaysCount`, `RuleStatus.tradingDaysRemaining` (Task 1)
- Produces: `GoalsPanel` React component, props `{ firmLabel: string; profitTargetPercent: number | null; tradingDaysCount: number; tradingDaysRemaining: number | null }`. Note there is no `minTradingDays` prop — the Dashboard doesn't have a `RuleProfile` handy (only `RuleStatus`), so the trading-days bar's denominator is derived as `tradingDaysCount + (tradingDaysRemaining ?? 0)`, which equals the real `minTradingDays` while the goal is unmet and still renders a complete bar once it's met (`tradingDaysRemaining` clamps to `0`).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/GoalsPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GoalsPanel } from './GoalsPanel'

describe('GoalsPanel', () => {
  it('renders the profit target bar when profitTargetPercent is set', () => {
    render(
      <GoalsPanel
        firmLabel="Apex · 150K Eval #2"
        profitTargetPercent={50}
        tradingDaysCount={3}
        tradingDaysRemaining={null}
      />
    )
    expect(screen.getByText('Profit Target')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
  })

  it('omits the profit target bar when profitTargetPercent is null', () => {
    render(
      <GoalsPanel
        firmLabel="Apex"
        profitTargetPercent={null}
        tradingDaysCount={3}
        tradingDaysRemaining={2}
      />
    )
    expect(screen.queryByText('Profit Target')).not.toBeInTheDocument()
  })

  it('renders the trading-days bar when tradingDaysRemaining is not null', () => {
    render(
      <GoalsPanel
        firmLabel="Apex"
        profitTargetPercent={null}
        tradingDaysCount={3}
        tradingDaysRemaining={2}
      />
    )
    expect(screen.getByText('Trading Days')).toBeInTheDocument()
    expect(screen.getByText('3 / 5')).toBeInTheDocument() // 3 + 2
  })

  it('omits the trading-days bar when tradingDaysRemaining is null', () => {
    render(
      <GoalsPanel
        firmLabel="Apex"
        profitTargetPercent={50}
        tradingDaysCount={3}
        tradingDaysRemaining={null}
      />
    )
    expect(screen.queryByText('Trading Days')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/GoalsPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./GoalsPanel"`.

- [ ] **Step 3: Implement `GoalsPanel`**

Create `src/renderer/src/components/GoalsPanel.tsx`:

```tsx
interface GoalsPanelProps {
  firmLabel: string
  profitTargetPercent: number | null
  tradingDaysCount: number
  tradingDaysRemaining: number | null
}

export function GoalsPanel({
  firmLabel,
  profitTargetPercent,
  tradingDaysCount,
  tradingDaysRemaining
}: GoalsPanelProps): JSX.Element {
  const showProfitTarget = profitTargetPercent !== null
  const showTradingDays = tradingDaysRemaining !== null
  const tradingDaysTarget = tradingDaysCount + (tradingDaysRemaining ?? 0)

  return (
    <div className="goals-card">
      <span className="gauge-firm">{firmLabel}</span>
      {showProfitTarget && (
        <div className="goals-bar-row">
          <div className="goals-bar-label">
            <span>Profit Target</span>
            <span>{profitTargetPercent.toFixed(1)}%</span>
          </div>
          <div className="goals-bar-track">
            <div
              className="goals-bar-fill"
              style={{ width: `${Math.min(100, profitTargetPercent)}%` }}
            />
          </div>
        </div>
      )}
      {showTradingDays && (
        <div className="goals-bar-row">
          <div className="goals-bar-label">
            <span>Trading Days</span>
            <span>
              {tradingDaysCount} / {tradingDaysTarget}
            </span>
          </div>
          <div className="goals-bar-track">
            <div
              className="goals-bar-fill"
              style={{ width: `${Math.min(100, (tradingDaysCount / tradingDaysTarget) * 100)}%` }}
            />
          </div>
          {(tradingDaysRemaining as number) > 0 && (
            <div className="goals-bar-sub">{tradingDaysRemaining} days remaining</div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add CSS**

In `src/renderer/src/styles/tokens.css`, append (after the `.dashboard-consistency-row` rule added by the previous Playbooks/Consistency work):

```css
.goals-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 20px 22px; max-width: 460px; display: flex; flex-direction: column; gap: 16px; }
.goals-bar-row { display: flex; flex-direction: column; gap: 6px; }
.goals-bar-label { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.goals-bar-track { position: relative; height: 10px; background: var(--surface-3); border-radius: 4px; overflow: hidden; border: 1px solid var(--border-soft); }
.goals-bar-fill { position: absolute; top: 0; bottom: 0; left: 0; background: var(--accent); }
.goals-bar-sub { font-family: var(--mono); font-size: 10px; color: var(--text-muted); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/GoalsPanel.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 6: Wire into `DashboardView`**

In `src/renderer/src/views/DashboardView.tsx`:

Add the import:
```ts
import { GoalsPanel } from '../components/GoalsPanel'
```

Add a `GoalsItem` interface next to the existing `ConsistencyItem` interface:
```ts
interface GoalsItem {
  label: string
  profitTargetPercent: number | null
  tradingDaysCount: number
  tradingDaysRemaining: number | null
}
```

Add state next to `consistencyItems`:
```ts
  const [goalsItems, setGoalsItems] = useState<GoalsItem[]>([])
```

Extend the existing `statuses.map` inside the `load` function (the same one that builds `stripItems` and `consistencyItems`) to also build `goalsItems` — add right after the existing `setConsistencyItems(...)` call:

```ts
        setGoalsItems(
          statuses
            .filter(
              ({ status }) => status.profitTargetPercent !== null || status.tradingDaysRemaining !== null
            )
            .map(({ account: a, status }) => ({
              label: `${a.firmName} ${a.accountName}`,
              profitTargetPercent: status.profitTargetPercent,
              tradingDaysCount: status.tradingDaysCount,
              tradingDaysRemaining: status.tradingDaysRemaining
            }))
        )
```

Finally, render the panels — add after the existing `dashboard-consistency-row` block, before the closing `</div>` of the component's return:

```tsx
      {goalsItems.length > 0 && (
        <div className="dashboard-consistency-row">
          {goalsItems.map((item) => (
            <GoalsPanel
              key={item.label}
              firmLabel={item.label}
              profitTargetPercent={item.profitTargetPercent}
              tradingDaysCount={item.tradingDaysCount}
              tradingDaysRemaining={item.tradingDaysRemaining}
            />
          ))}
        </div>
      )}
```

(Reuses the existing `.dashboard-consistency-row` flex-wrap CSS — no new layout class needed.)

- [ ] **Step 7: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/GoalsPanel.tsx src/renderer/src/components/GoalsPanel.test.tsx src/renderer/src/views/DashboardView.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: GoalsPanel showing profit-target and trading-days progress on Dashboard"
```

---

### Task 3: `screenshotPaths` persistence in `updateTradeReflection`

**Files:**
- Modify: `src/shared/types.ts` (`UpdateTradeReflection`)
- Modify: `src/main/db/trades.repo.ts`
- Modify: `src/main/db/trades.repo.test.ts`

**Interfaces:**
- Produces: `UpdateTradeReflection.screenshotPaths?: string[]`, persisted by `updateTradeReflection`.

- [ ] **Step 1: Write the failing test**

Add to `src/main/db/trades.repo.test.ts`, right before the final closing `})`:

```ts
  it('updates screenshotPaths independently of the other reflection fields', () => {
    const trade = createTrade(db, {
      accountId,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      entryTime: '2026-08-11T13:35:00Z',
      exitTime: '2026-08-11T13:50:00Z',
      size: 2,
      pnl: 20,
      rMultiple: null,
      setupThesis: null,
      executionNotes: null,
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: [],
      playbookId: null
    })

    const updated = updateTradeReflection(db, trade.id, {
      screenshotPaths: ['flowstate-media://a.png', 'flowstate-media://b.png']
    })

    expect(updated.screenshotPaths).toEqual(['flowstate-media://a.png', 'flowstate-media://b.png'])
    expect(updated.pnl).toBe(20)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/db/trades.repo.test.ts`
Expected: FAIL — `expected [] to deeply equal [ 'flowstate-media://a.png', 'flowstate-media://b.png' ]` (the update silently ignores the new field since `updateTradeReflection` doesn't read or persist it yet).

- [ ] **Step 3: Add the field to `UpdateTradeReflection`**

In `src/shared/types.ts`, add to the `UpdateTradeReflection` interface, after `playbookId?: number | null`:

```ts
  screenshotPaths?: string[]
```

- [ ] **Step 4: Implement in `updateTradeReflection`**

In `src/main/db/trades.repo.ts`, in `updateTradeReflection`, add after the existing `playbookId` computed-value line:

```ts
  const screenshotPaths =
    updates.screenshotPaths !== undefined
      ? JSON.stringify(updates.screenshotPaths)
      : existing.screenshot_paths
```

Update the SQL statement to include `screenshot_paths`:

```ts
  db.prepare(
    `
    UPDATE trades
    SET pnl = ?, r_multiple = ?, setup_thesis = ?, execution_notes = ?, lessons_learned = ?, brainstorm = ?, playbook_id = ?, screenshot_paths = ?
    WHERE id = ?
  `
  ).run(
    pnl,
    rMultiple,
    setupThesis,
    executionNotes,
    lessonsLearned,
    brainstorm,
    playbookId,
    screenshotPaths,
    id
  )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/main/db/trades.repo.test.ts`
Expected: all tests pass (7 total: 6 existing + 1 new).

- [ ] **Step 6: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors (no other file constructs an `UpdateTradeReflection` literal that would be affected — it's an optional field).

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/db/trades.repo.ts src/main/db/trades.repo.test.ts
git commit -m "feat: persist screenshotPaths through updateTradeReflection"
```

---

### Task 4: Trade screenshot upload/thumbnail UI

**Files:**
- Modify: `src/renderer/src/views/TradeRow.tsx`
- Modify: `src/renderer/src/views/TradeRow.test.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.media.saveImage(base64: string, mimeType: string): Promise<string>` (existing), `UpdateTradeReflection.screenshotPaths` (Task 3)

- [ ] **Step 1: Write the failing test**

In `src/renderer/src/views/TradeRow.test.tsx`, add `saveImageMock` to the mock setup — replace the existing `vi.mock('../api/client', ...)` block with:

```ts
const deleteTradeMock = vi.fn()
const updateTradeMock = vi.fn()
const saveImageMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    trades: {
      delete: (...a: unknown[]) => deleteTradeMock(...a),
      update: (...a: unknown[]) => updateTradeMock(...a)
    },
    media: {
      saveImage: (...a: unknown[]) => saveImageMock(...a)
    }
  }
}))
```

In the `beforeEach`, add:
```ts
    saveImageMock.mockResolvedValue('flowstate-media://new-screenshot.png')
```

Add a new test at the end of the `describe('TradeRow', ...)` block, right before the closing `})`:

```ts
  it('uploads a screenshot and includes it in the save payload', async () => {
    renderRow()

    fireEvent.click(screen.getByLabelText('Expand trade details'))

    const file = new File(['fake-image-bytes'], 'chart.png', { type: 'image/png' })
    const fileInput = screen.getByLabelText('Add screenshot') as HTMLInputElement
    await waitFor(() => fireEvent.change(fileInput, { target: { files: [file] } }))

    await waitFor(() => expect(saveImageMock).toHaveBeenCalled())
    expect(await screen.findByAltText('Trade screenshot 1')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Save notes'))

    await waitFor(() =>
      expect(updateTradeMock).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ screenshotPaths: ['flowstate-media://new-screenshot.png'] })
      )
    )
  })

  it('removes a screenshot from the in-memory list without deleting the file', async () => {
    renderRow()

    fireEvent.click(screen.getByLabelText('Expand trade details'))
    const file = new File(['fake-image-bytes'], 'chart.png', { type: 'image/png' })
    const fileInput = screen.getByLabelText('Add screenshot') as HTMLInputElement
    await waitFor(() => fireEvent.change(fileInput, { target: { files: [file] } }))
    await screen.findByAltText('Trade screenshot 1')

    fireEvent.click(screen.getByLabelText('Remove screenshot 1'))
    fireEvent.click(screen.getByText('Save notes'))

    await waitFor(() =>
      expect(updateTradeMock).toHaveBeenCalledWith(42, expect.objectContaining({ screenshotPaths: [] }))
    )
  })
```

Also update the two existing payload-assertion tests (`'sends an edited P&L...'` and `'sends an edited R-multiple...'` and `'sends the selected playbook id...'`) to add `screenshotPaths: []` to their expected object — every `toHaveBeenCalledWith(42, { ... })` call in this file needs `screenshotPaths: []` added as a property (the trade fixture's `screenshotPaths` starts as `[]`, so an unmodified save round-trips the empty array).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/views/TradeRow.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Add screenshot` for the two new tests, and the three payload-assertion tests fail because the actual call omits `screenshotPaths`.

- [ ] **Step 3: Implement the screenshot field in `TradeRow`**

In `src/renderer/src/views/TradeRow.tsx`:

Add state, next to the existing `playbookId` state:
```ts
  const [screenshotPaths, setScreenshotPaths] = useState<string[]>(trade.screenshotPaths)
```

Add to the `updates` object in `handleSave`, after `playbookId`:
```ts
      screenshotPaths
```

Add a handler for the file input, after `handleSave`:
```ts
  async function handleAddScreenshot(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer()
        let binary = ''
        const bytes = new Uint8Array(buffer)
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const base64 = btoa(binary)
        const url = await flowStateApi.media.saveImage(base64, file.type)
        setScreenshotPaths((paths) => [...paths, url])
      }
    } catch (err) {
      onError(`Could not upload screenshot: ${err instanceof Error ? err.message : String(err)}`)
    }
    e.target.value = ''
  }

  function handleRemoveScreenshot(index: number): void {
    setScreenshotPaths((paths) => paths.filter((_, i) => i !== index))
  }
```

Add the field markup in the `trade-row-fields` div, after the Playbook field block and before the `Save notes` button. Note the field label is a plain `<span>`, not a `<label>` — the actual upload control below has its own dedicated label/input pair with their own ids, so the outer field label has nothing to point a `for` attribute at:
```tsx
              <div className="field">
                <span className="field-label">Screenshots</span>
                <div className="trade-screenshots">
                  {screenshotPaths.map((path, i) => (
                    <div className="trade-screenshot" key={path}>
                      <img src={path} alt={`Trade screenshot ${i + 1}`} />
                      <button
                        type="button"
                        className="trade-screenshot-remove"
                        onClick={() => handleRemoveScreenshot(i)}
                        aria-label={`Remove screenshot ${i + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <label className="trade-screenshot-add" htmlFor={`screenshot-input-${trade.id}`}>
                    + Add screenshot
                  </label>
                  <input
                    id={`screenshot-input-${trade.id}`}
                    type="file"
                    accept="image/*"
                    multiple
                    aria-label="Add screenshot"
                    className="trade-screenshot-input"
                    onChange={(e) => void handleAddScreenshot(e)}
                  />
                </div>
              </div>
```

- [ ] **Step 4: Add CSS**

In `src/renderer/src/styles/tokens.css`, append after the `.trade-row-fields select:focus` rule:

```css
.trade-screenshots { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.trade-screenshot { position: relative; width: 64px; height: 64px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
.trade-screenshot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.trade-screenshot-remove { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(11,13,15,0.75); border: none; color: var(--text-primary); font-size: 12px; line-height: 1; cursor: pointer; }
.trade-screenshot-remove:hover { color: var(--accent); }
.trade-screenshot-add { display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border: 1px dashed var(--border); border-radius: 6px; font-family: var(--sans); font-size: 11px; color: var(--text-muted); cursor: pointer; text-align: center; }
.trade-screenshot-add:hover { color: var(--accent); border-color: var(--accent); }
.trade-screenshot-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
```

(The input is visually hidden but keyboard/screen-reader accessible via its associated `<label>` — the standard pattern for styled file inputs.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/views/TradeRow.test.tsx`
Expected: all 7 tests pass (5 existing, updated for `screenshotPaths: []`, + 2 new).

- [ ] **Step 6: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/TradeRow.tsx src/renderer/src/views/TradeRow.test.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: attach and view trade screenshots"
```

---

### Task 5: `computeFilteredTrades` pure function

**Files:**
- Create: `src/shared/tradeFilters.ts`
- Create: `src/shared/tradeFilters.test.ts`

**Interfaces:**
- Produces: `TradeFilters` interface, `computeFilteredTrades(trades: Trade[], filters: TradeFilters): Trade[]`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/tradeFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeFilteredTrades, EMPTY_TRADE_FILTERS } from './tradeFilters'
import type { Trade } from './types'

function makeTrade(overrides: Partial<Trade>): Trade {
  return {
    id: 1,
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5010,
    entryTime: '2026-08-11T13:35:00Z',
    exitTime: '2026-08-11T13:50:00Z',
    size: 1,
    pnl: 10,
    rMultiple: null,
    setupThesis: null,
    executionNotes: null,
    lessonsLearned: null,
    brainstorm: null,
    screenshotPaths: [],
    tagIds: [],
    playbookId: null,
    ...overrides
  }
}

describe('computeFilteredTrades', () => {
  it('returns every trade when no filters are set', () => {
    const trades = [makeTrade({ id: 1 }), makeTrade({ id: 2 })]
    expect(computeFilteredTrades(trades, EMPTY_TRADE_FILTERS)).toEqual(trades)
  })

  it('filters by instrument, case-insensitive substring match', () => {
    const trades = [
      makeTrade({ id: 1, instrument: 'ES' }),
      makeTrade({ id: 2, instrument: 'NQ' }),
      makeTrade({ id: 3, instrument: 'MES' })
    ]
    const result = computeFilteredTrades(trades, { ...EMPTY_TRADE_FILTERS, instrument: 'es' })
    expect(result.map((t) => t.id)).toEqual([1, 3])
  })

  it('filters by exact tagId match', () => {
    const trades = [
      makeTrade({ id: 1, tagIds: [1, 2] }),
      makeTrade({ id: 2, tagIds: [2] }),
      makeTrade({ id: 3, tagIds: [] })
    ]
    const result = computeFilteredTrades(trades, { ...EMPTY_TRADE_FILTERS, tagId: 1 })
    expect(result.map((t) => t.id)).toEqual([1])
  })

  it('filters by exact playbookId match', () => {
    const trades = [
      makeTrade({ id: 1, playbookId: 5 }),
      makeTrade({ id: 2, playbookId: 6 }),
      makeTrade({ id: 3, playbookId: null })
    ]
    const result = computeFilteredTrades(trades, { ...EMPTY_TRADE_FILTERS, playbookId: 5 })
    expect(result.map((t) => t.id)).toEqual([1])
  })

  it('filters by inclusive date range against the local exit day', () => {
    const trades = [
      makeTrade({ id: 1, exitTime: '2026-08-09T14:00:00Z' }),
      makeTrade({ id: 2, exitTime: '2026-08-10T14:00:00Z' }),
      makeTrade({ id: 3, exitTime: '2026-08-11T14:00:00Z' })
    ]
    const result = computeFilteredTrades(trades, {
      ...EMPTY_TRADE_FILTERS,
      dateFrom: '2026-08-10',
      dateTo: '2026-08-10'
    })
    expect(result.map((t) => t.id)).toEqual([2])
  })

  it('combines multiple filters with AND semantics', () => {
    const trades = [
      makeTrade({ id: 1, instrument: 'ES', tagIds: [1] }),
      makeTrade({ id: 2, instrument: 'ES', tagIds: [] }),
      makeTrade({ id: 3, instrument: 'NQ', tagIds: [1] })
    ]
    const result = computeFilteredTrades(trades, {
      ...EMPTY_TRADE_FILTERS,
      instrument: 'ES',
      tagId: 1
    })
    expect(result.map((t) => t.id)).toEqual([1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/tradeFilters.test.ts`
Expected: FAIL — `Failed to resolve import "./tradeFilters"`.

- [ ] **Step 3: Implement `computeFilteredTrades`**

Create `src/shared/tradeFilters.ts`:

```ts
import type { Trade } from './types'
import { toLocalDateString } from './date'

export interface TradeFilters {
  instrument: string
  tagId: number | null
  playbookId: number | null
  dateFrom: string | null
  dateTo: string | null
}

export const EMPTY_TRADE_FILTERS: TradeFilters = {
  instrument: '',
  tagId: null,
  playbookId: null,
  dateFrom: null,
  dateTo: null
}

export function computeFilteredTrades(trades: Trade[], filters: TradeFilters): Trade[] {
  return trades.filter((trade) => {
    if (filters.instrument.trim() !== '') {
      const needle = filters.instrument.trim().toLowerCase()
      if (!trade.instrument.toLowerCase().includes(needle)) return false
    }
    if (filters.tagId !== null && !trade.tagIds.includes(filters.tagId)) return false
    if (filters.playbookId !== null && trade.playbookId !== filters.playbookId) return false
    if (filters.dateFrom !== null || filters.dateTo !== null) {
      const exitDay = toLocalDateString(new Date(trade.exitTime))
      if (filters.dateFrom !== null && exitDay < filters.dateFrom) return false
      if (filters.dateTo !== null && exitDay > filters.dateTo) return false
    }
    return true
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/tradeFilters.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/tradeFilters.ts src/shared/tradeFilters.test.ts
git commit -m "feat: computeFilteredTrades pure function for Trade Log filtering"
```

---

### Task 6: Trade Log filter bar UI

**Files:**
- Create: `src/renderer/src/views/TradeLogView.test.tsx`
- Modify: `src/renderer/src/views/TradeLogView.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `computeFilteredTrades`, `TradeFilters`, `EMPTY_TRADE_FILTERS` (Task 5); `flowStateApi.tags.list()` (existing)

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/views/TradeLogView.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listAccountsMock = vi.fn()
const listForAccountMock = vi.fn()
const listPlaybooksMock = vi.fn()
const listTagsMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    accounts: { list: (...a: unknown[]) => listAccountsMock(...a) },
    trades: { listForAccount: (...a: unknown[]) => listForAccountMock(...a) },
    playbooks: { list: (...a: unknown[]) => listPlaybooksMock(...a) },
    tags: { list: (...a: unknown[]) => listTagsMock(...a) }
  }
}))

vi.mock('./TradeQuickAddForm', () => ({
  TradeQuickAddForm: () => <div>quick-add-form</div>
}))

vi.mock('./TradeRow', () => ({
  TradeRow: ({ trade }: { trade: { instrument: string } }) => <tr><td>{trade.instrument}</td></tr>
}))

import { TradeLogView } from './TradeLogView'

describe('TradeLogView filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listAccountsMock.mockResolvedValue([
      {
        id: 1,
        firmName: 'Apex',
        accountName: '150K Eval',
        startingBalance: 150000,
        currency: 'USD',
        status: 'evaluation',
        ruleProfileId: 1,
        createdAt: ''
      }
    ])
    listForAccountMock.mockResolvedValue([
      {
        id: 1,
        accountId: 1,
        instrument: 'ES',
        side: 'long',
        entryPrice: 5000,
        exitPrice: 5010,
        entryTime: '2026-08-11T13:35:00Z',
        exitTime: '2026-08-11T13:50:00Z',
        size: 1,
        pnl: 10,
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null,
        screenshotPaths: [],
        tagIds: [],
        playbookId: null
      },
      {
        id: 2,
        accountId: 1,
        instrument: 'NQ',
        side: 'short',
        entryPrice: 18000,
        exitPrice: 17950,
        entryTime: '2026-08-12T13:35:00Z',
        exitTime: '2026-08-12T13:50:00Z',
        size: 1,
        pnl: 20,
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null,
        screenshotPaths: [],
        tagIds: [],
        playbookId: null
      }
    ])
    listPlaybooksMock.mockResolvedValue([])
    listTagsMock.mockResolvedValue([])
  })

  it('narrows the visible rows by instrument text', async () => {
    render(<TradeLogView />)
    await screen.findByText('ES')
    expect(screen.getByText('NQ')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter by instrument'), { target: { value: 'ES' } })

    await waitFor(() => expect(screen.queryByText('NQ')).not.toBeInTheDocument())
    expect(screen.getByText('ES')).toBeInTheDocument()
  })

  it('shows an empty-state message when no trades match the filters', async () => {
    render(<TradeLogView />)
    await screen.findByText('ES')

    fireEvent.change(screen.getByLabelText('Filter by instrument'), { target: { value: 'ZZZ' } })

    expect(await screen.findByText('No trades match these filters.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/views/TradeLogView.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Filter by instrument` (no filter bar exists yet).

- [ ] **Step 3: Implement the filter bar**

Rewrite `src/renderer/src/views/TradeLogView.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { flowStateApi } from '../api/client'
import { TradeQuickAddForm } from './TradeQuickAddForm'
import { TradeRow } from './TradeRow'
import { ErrorBanner } from '../components/ErrorBanner'
import { computeFilteredTrades, EMPTY_TRADE_FILTERS, TradeFilters } from '../../../shared/tradeFilters'
import type { Account, Trade, Playbook, Tag } from '../../../shared/types'

export function TradeLogView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [filters, setFilters] = useState<TradeFilters>(EMPTY_TRADE_FILTERS)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadAccounts(): Promise<void> {
      try {
        setError(null)
        const list = await flowStateApi.accounts.list()
        setAccounts(list)
        if (list.length > 0) setSelectedAccountId(list[0].id)
      } catch (e) {
        setError(`Could not load accounts: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    loadAccounts()
    flowStateApi.playbooks
      .list()
      .then(setPlaybooks)
      .catch((e: unknown) => {
        setError(`Could not load playbooks: ${e instanceof Error ? e.message : String(e)}`)
      })
    flowStateApi.tags
      .list()
      .then(setTags)
      .catch((e: unknown) => {
        setError(`Could not load tags: ${e instanceof Error ? e.message : String(e)}`)
      })
  }, [])

  async function refreshTrades(accountId: number): Promise<void> {
    try {
      setError(null)
      setTrades(await flowStateApi.trades.listForAccount(accountId))
    } catch (e) {
      setError(`Could not load trades: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    if (selectedAccountId !== null) refreshTrades(selectedAccountId)
  }, [selectedAccountId])

  const filteredTrades = useMemo(() => computeFilteredTrades(trades, filters), [trades, filters])

  if (accounts.length === 0) {
    return (
      <div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <p style={{ color: 'var(--text-secondary)' }}>Create an account first.</p>
      </div>
    )
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <select
        value={selectedAccountId ?? ''}
        onChange={(e) => setSelectedAccountId(Number(e.target.value))}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.firmName} · {a.accountName}
          </option>
        ))}
      </select>

      {selectedAccountId !== null && (
        <TradeQuickAddForm
          accountId={selectedAccountId}
          onCreated={() => refreshTrades(selectedAccountId)}
        />
      )}

      <div className="trade-filter-bar">
        <input
          type="text"
          placeholder="Filter by instrument…"
          aria-label="Filter by instrument"
          value={filters.instrument}
          onChange={(e) => setFilters((f) => ({ ...f, instrument: e.target.value }))}
        />
        <select
          aria-label="Filter by tag"
          value={filters.tagId ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, tagId: e.target.value === '' ? null : Number(e.target.value) }))
          }
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by playbook"
          value={filters.playbookId ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              playbookId: e.target.value === '' ? null : Number(e.target.value)
            }))
          }
        >
          <option value="">All playbooks</option>
          {playbooks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Filter from date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || null }))}
        />
        <input
          type="date"
          aria-label="Filter to date"
          value={filters.dateTo ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || null }))}
        />
        {filters !== EMPTY_TRADE_FILTERS && (
          <button type="button" onClick={() => setFilters(EMPTY_TRADE_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {filteredTrades.length === 0 ? (
        <p className="trade-filter-empty">No trades match these filters.</p>
      ) : (
        <table className="trade-table">
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Side</th>
              <th>Size</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>P&amp;L</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.map((t) => (
              <TradeRow
                key={t.id}
                trade={t}
                playbooks={playbooks}
                onChanged={() => selectedAccountId !== null && refreshTrades(selectedAccountId)}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

Note: `filters !== EMPTY_TRADE_FILTERS` is a reference check against the module-level constant — it's `true` (filters differ) the moment any `setFilters` call creates a new object, and `false` again only if the user's filters happen to structurally equal the empty state AND that exact object reference is restored (which only happens via the "Clear filters" button itself, or never being touched). This is intentionally simple: reference inequality after any edit is exactly "show the clear button once the user has touched a filter," which is the desired behavior — it does not need deep equality.

- [ ] **Step 4: Add CSS**

In `src/renderer/src/styles/tokens.css`, append after the `.trade-table` rules:

```css
.trade-filter-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
.trade-filter-bar input, .trade-filter-bar select { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-family: var(--sans); font-size: 13px; color: var(--text-primary); }
.trade-filter-bar input:focus, .trade-filter-bar select:focus { outline: none; border-color: var(--accent); }
.trade-filter-bar button { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; font-family: var(--sans); font-size: 12px; color: var(--text-secondary); cursor: pointer; }
.trade-filter-bar button:hover { color: var(--accent); border-color: var(--accent); }
.trade-filter-empty { margin-top: 20px; font-size: 13px; color: var(--text-muted); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/views/TradeLogView.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 6: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/TradeLogView.tsx src/renderer/src/views/TradeLogView.test.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: Trade Log filter bar (instrument/tag/playbook/date range)"
```

---

## Final Verification (after all 6 tasks)

- [ ] Run `npm run typecheck` — clean.
- [ ] Run `npm test -- run` — all tests pass.
- [ ] Run `npm run build` — succeeds.
- [ ] Run `npm run dev`, manually verify: Dashboard shows a Goals panel for an account whose rule profile has a profit target or min trading days; Trade Log's Add Screenshot button uploads and thumbnails an image, removing it and saving persists the removal; Trade Log filter bar narrows rows by each filter type and the Clear filters button resets them.
