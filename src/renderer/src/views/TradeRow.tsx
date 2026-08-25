import { useState } from 'react'
import { flowStateApi } from '../api/client'
import type { Trade, UpdateTradeReflection, Playbook } from '../../../shared/types'

interface TradeRowProps {
  trade: Trade
  playbooks: Playbook[]
  onChanged: () => void
  onError: (message: string) => void
}

export function TradeRow({ trade, playbooks, onChanged, onError }: TradeRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [setupThesis, setSetupThesis] = useState(trade.setupThesis ?? '')
  const [executionNotes, setExecutionNotes] = useState(trade.executionNotes ?? '')
  const [lessonsLearned, setLessonsLearned] = useState(trade.lessonsLearned ?? '')
  const [brainstorm, setBrainstorm] = useState(trade.brainstorm ?? '')
  const [pnl, setPnl] = useState(String(trade.pnl))
  const [rMultiple, setRMultiple] = useState(trade.rMultiple === null ? '' : String(trade.rMultiple))
  const [playbookId, setPlaybookId] = useState(
    trade.playbookId === null ? '' : String(trade.playbookId)
  )
  const [screenshotPaths, setScreenshotPaths] = useState<string[]>(trade.screenshotPaths)

  async function handleSave(): Promise<void> {
    const parsedPnl = Number(pnl)
    const parsedRMultiple = Number(rMultiple)
    const updates: UpdateTradeReflection = {
      // Guard against a blank/garbage field silently writing NaN over a real P&L.
      pnl: Number.isFinite(parsedPnl) && pnl.trim() !== '' ? parsedPnl : trade.pnl,
      rMultiple: Number.isFinite(parsedRMultiple) && rMultiple.trim() !== '' ? parsedRMultiple : null,
      setupThesis: setupThesis.trim() || null,
      executionNotes: executionNotes.trim() || null,
      lessonsLearned: lessonsLearned.trim() || null,
      brainstorm: brainstorm.trim() || null,
      playbookId: playbookId === '' ? null : Number(playbookId),
      screenshotPaths
    }
    try {
      await flowStateApi.trades.update(trade.id, updates)
      onChanged()
    } catch (err) {
      onError(`Could not save trade notes: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

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

  async function handleDelete(): Promise<void> {
    if (!window.confirm('Delete this trade? This cannot be undone.')) return
    try {
      await flowStateApi.trades.delete(trade.id)
      onChanged()
    } catch (err) {
      onError(`Could not delete trade: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <>
      <tr>
        <td>{trade.instrument}</td>
        <td>{trade.side}</td>
        <td>{trade.size}</td>
        <td>{trade.entryPrice}</td>
        <td>{trade.exitPrice}</td>
        <td className={trade.pnl >= 0 ? 'pos' : 'neg'}>{trade.pnl.toFixed(2)}</td>
        <td className="trade-row-actions">
          <button
            type="button"
            className="trade-row-expand"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse trade details' : 'Expand trade details'}
          >
            {expanded ? '▾' : '▸'}
          </button>
          <button
            type="button"
            className="trade-row-delete"
            onClick={() => void handleDelete()}
            aria-label={`Delete trade ${trade.instrument}`}
          >
            ×
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="trade-row-detail">
          <td colSpan={7}>
            <div className="trade-row-fields">
              <div className="field">
                <label className="field-label" htmlFor={`setup-${trade.id}`}>
                  Setup / Thesis
                </label>
                <textarea
                  id={`setup-${trade.id}`}
                  value={setupThesis}
                  onChange={(e) => setSetupThesis(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`execution-${trade.id}`}>
                  Execution Notes
                </label>
                <textarea
                  id={`execution-${trade.id}`}
                  value={executionNotes}
                  onChange={(e) => setExecutionNotes(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`lessons-${trade.id}`}>
                  Lessons Learned
                </label>
                <textarea
                  id={`lessons-${trade.id}`}
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`brainstorm-${trade.id}`}>
                  Brainstorm
                </label>
                <textarea
                  id={`brainstorm-${trade.id}`}
                  value={brainstorm}
                  onChange={(e) => setBrainstorm(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`pnl-${trade.id}`}>
                  P&amp;L ($)
                </label>
                <input
                  id={`pnl-${trade.id}`}
                  type="number"
                  step="0.01"
                  value={pnl}
                  onChange={(e) => setPnl(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`r-multiple-${trade.id}`}>
                  R-Multiple
                </label>
                <input
                  id={`r-multiple-${trade.id}`}
                  type="number"
                  step="0.1"
                  value={rMultiple}
                  onChange={(e) => setRMultiple(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`playbook-${trade.id}`}>
                  Playbook
                </label>
                <select
                  id={`playbook-${trade.id}`}
                  value={playbookId}
                  onChange={(e) => setPlaybookId(e.target.value)}
                >
                  <option value="">None</option>
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
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
              <button type="button" className="trade-row-save" onClick={() => void handleSave()}>
                Save notes
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
