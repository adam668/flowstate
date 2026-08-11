import { useState } from 'react'
import { Sidebar, ViewName } from './components/Sidebar'
import { AccountsView } from './views/AccountsView'
import { TradeLogView } from './views/TradeLogView'

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewName>('dashboard')

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} />
      <main className="main-content">
        {view === 'accounts' && <AccountsView />}
        {view === 'tradeLog' && <TradeLogView />}
        {view !== 'accounts' && view !== 'tradeLog' && (
          <p style={{ color: 'var(--text-secondary)' }}>Current view: {view}</p>
        )}
      </main>
    </div>
  )
}
