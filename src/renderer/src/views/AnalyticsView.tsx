import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { flowStateApi } from '../api/client'
import {
  computeWinRateByTag,
  computeWinRateByHour,
  computeRMultipleDistribution
} from '../../../shared/analytics'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Trade, Tag } from '../../../shared/types'

const AXIS_COLOR = '#5C646C'
const TOOLTIP_STYLE = {
  background: '#14171A',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'monospace',
  fontSize: 12
}

function formatHour(hour: number): string {
  const period = hour < 12 ? 'a' : 'p'
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12
  return `${twelveHour}${period}`
}

interface AnalyticsCardProps {
  title: string
  isEmpty: boolean
  emptyMessage: string
  wide?: boolean
  children: React.ReactNode
}

function AnalyticsCard({ title, isEmpty, emptyMessage, wide, children }: AnalyticsCardProps): JSX.Element {
  return (
    <div className={`analytics-card ${wide ? 'wide' : ''}`}>
      <span className="analytics-card-title">{title}</span>
      {isEmpty ? <p className="analytics-empty">{emptyMessage}</p> : children}
    </div>
  )
}

export function AnalyticsView(): JSX.Element {
  const [trades, setTrades] = useState<Trade[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([flowStateApi.trades.listAll(), flowStateApi.tags.list()])
      .then(([tradeList, tagList]) => {
        setTrades(tradeList)
        setTags(tagList)
      })
      .catch((err: unknown) => {
        setError(`Could not load analytics: ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [])

  const tagWinRates = useMemo(() => computeWinRateByTag(trades, tags), [trades, tags])
  const hourWinRates = useMemo(
    () =>
      computeWinRateByHour(trades)
        .sort((a, b) => a.hour - b.hour)
        .map((entry) => ({ ...entry, label: formatHour(entry.hour) })),
    [trades]
  )
  const rDistribution = useMemo(() => computeRMultipleDistribution(trades), [trades])

  return (
    <div className="analytics-view">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="analytics-grid">
        <AnalyticsCard
          title="Win Rate by Tag"
          isEmpty={tagWinRates.length === 0}
          emptyMessage="Tag your trades to see which setups actually work."
        >
          <div className="analytics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tagWinRates} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="tagName" stroke={AXIS_COLOR} fontSize={10} tickLine={false} />
                <YAxis
                  stroke={AXIS_COLOR}
                  fontSize={10}
                  tickLine={false}
                  domain={[0, 1]}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => `${Math.round(Number(value) * 100)}%`}
                />
                <Bar dataKey="winRate" fill="#D99A3D" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="Win Rate by Hour"
          isEmpty={hourWinRates.length === 0}
          emptyMessage="No exited trades yet."
        >
          <div className="analytics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourWinRates} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" stroke={AXIS_COLOR} fontSize={10} tickLine={false} />
                <YAxis
                  stroke={AXIS_COLOR}
                  fontSize={10}
                  tickLine={false}
                  domain={[0, 1]}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => `${Math.round(Number(value) * 100)}%`}
                />
                <Bar dataKey="winRate" fill="#D99A3D" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="R-Multiple Distribution"
          isEmpty={rDistribution.length === 0}
          emptyMessage="Record an R-multiple on your trades to see your edge distribution."
          wide
        >
          <div className="analytics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rDistribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="bucket" stroke={AXIS_COLOR} fontSize={10} tickLine={false} />
                <YAxis stroke={AXIS_COLOR} fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {rDistribution.map((entry) => (
                    <Cell
                      key={entry.bucket}
                      fill={entry.bucket.startsWith('-') ? '#E0594F' : '#3FB77F'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>
      </div>
    </div>
  )
}
