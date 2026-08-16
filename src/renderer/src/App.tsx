import { useEffect, useState } from 'react'
import { Sidebar, ViewName } from './components/Sidebar'
import { DashboardView } from './views/DashboardView'
import { AccountsView } from './views/AccountsView'
import { TradeLogView } from './views/TradeLogView'
import { CalendarView } from './views/CalendarView'
import { JournalView } from './views/JournalView'
import { AnalyticsView } from './views/AnalyticsView'
import { UpdateBanner } from './components/UpdateBanner'
import { flowStateApi } from './api/client'
import type { UpdateStatus } from '../../shared/types'

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewName>('dashboard')
  const [readyVersion, setReadyVersion] = useState<string | null>(null)

  useEffect(() => {
    // Catch up on any status that arrived before this listener was live —
    // checkForUpdates runs at app start, which can beat React mounting.
    void flowStateApi.updates.getStatus().then((status) => {
      if (status?.state === 'ready') setReadyVersion(status.version)
    })
    return flowStateApi.updates.onStatusChange((status: UpdateStatus) => {
      if (status.state === 'ready') setReadyVersion(status.version)
    })
  }, [])

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} />
      <main className="main-content">
        {readyVersion && (
          <UpdateBanner
            version={readyVersion}
            onRestart={() => flowStateApi.updates.restartAndInstall()}
          />
        )}
        {view === 'dashboard' && <DashboardView />}
        {view === 'accounts' && <AccountsView />}
        {view === 'tradeLog' && <TradeLogView />}
        {view === 'calendar' && <CalendarView />}
        {view === 'journal' && <JournalView />}
        {view === 'analytics' && <AnalyticsView />}
      </main>
    </div>
  )
}
