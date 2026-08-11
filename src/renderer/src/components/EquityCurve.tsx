import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Trade } from '../../../shared/types'

interface EquityCurveProps {
  startingBalance: number
  trades: Trade[]
}

export function EquityCurve({ startingBalance, trades }: EquityCurveProps): JSX.Element {
  const sorted = [...trades].sort((a, b) => a.exitTime.localeCompare(b.exitTime))
  let running = startingBalance
  const data = [
    { label: 'Start', balance: running },
    ...sorted.map((t, i) => {
      running += t.pnl
      return { label: `#${i + 1}`, balance: running }
    })
  ]

  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D99A3D" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#D99A3D" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" stroke="#5C646C" fontSize={10} tickLine={false} />
          <YAxis stroke="#5C646C" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#14171A', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'monospace', fontSize: 12 }}
          />
          <Area type="monotone" dataKey="balance" stroke="#D99A3D" fill="url(#equityFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
