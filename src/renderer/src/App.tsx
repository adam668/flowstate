import { useState } from 'react'
import { Sidebar, ViewName } from './components/Sidebar'

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewName>('dashboard')

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} />
      <main className="main-content">
        <p style={{ color: 'var(--text-secondary)' }}>Current view: {view}</p>
      </main>
    </div>
  )
}
