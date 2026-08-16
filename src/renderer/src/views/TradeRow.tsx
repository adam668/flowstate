import { useState } from 'react'
import { flowStateApi } from '../api/client'
import type { Trade, UpdateTradeReflection } from '../../../shared/types'

interface TradeRowProps {
  trade: Trade
  onChanged: () => void
  onError: (message: string) => void
}

export function TradeRow({ trade, onChanged, onError }: TradeRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [setupThesis, setSetupThesis] = useState(trade.setupThesis ?? '')
  const [executionNotes, setExecutionNotes] = useState(trade.executionNotes ?? '')
  const [lessonsLearned, setLessonsLearned] = useState(trade.lessonsLearned ?? '')
  const [brainstorm, setBrainstorm] = useState(trade.brainstorm ?? '')

  async function handleSave(): Promise<void> {
    const updates: UpdateTradeReflection = {
      setupThesis: setupThesis.trim() || null,
      executionNotes: executionNotes.trim() || null,
      lessonsLearned: lessonsLearned.trim() || null,
      brainstorm: brainstorm.trim() || null
    }
    try {
      await flowStateApi.trades.update(trade.id, updates)
      onChanged()
    } catch (err) {
      onError(`Could not save trade notes: ${err instanceof Error ? err.message : String(err)}`)
    }
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
