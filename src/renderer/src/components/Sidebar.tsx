export type ViewName = 'dashboard' | 'tradeLog' | 'accounts' | 'calendar' | 'journal' | 'analytics'

interface SidebarProps {
  active: ViewName
  onSelect: (view: ViewName) => void
}

export function Sidebar({ active, onSelect }: SidebarProps): JSX.Element {
  return (
    <nav className="sidebar">
      <button
        type="button"
        className={`sidebar-item ${active === 'dashboard' ? 'active' : ''}`}
        onClick={() => onSelect('dashboard')}
        aria-current={active === 'dashboard' ? 'page' : undefined}
      >
        Dashboard
      </button>
      <button
        type="button"
        className={`sidebar-item ${active === 'tradeLog' ? 'active' : ''}`}
        onClick={() => onSelect('tradeLog')}
        aria-current={active === 'tradeLog' ? 'page' : undefined}
      >
        Trade Log
      </button>
      <button
        type="button"
        className={`sidebar-item ${active === 'accounts' ? 'active' : ''}`}
        onClick={() => onSelect('accounts')}
        aria-current={active === 'accounts' ? 'page' : undefined}
      >
        Accounts
      </button>
      <button
        type="button"
        className={`sidebar-item ${active === 'calendar' ? 'active' : ''}`}
        onClick={() => onSelect('calendar')}
        aria-current={active === 'calendar' ? 'page' : undefined}
      >
        Calendar
      </button>
      <button
        type="button"
        className={`sidebar-item ${active === 'journal' ? 'active' : ''}`}
        onClick={() => onSelect('journal')}
        aria-current={active === 'journal' ? 'page' : undefined}
      >
        Journal
      </button>
      <button
        type="button"
        className={`sidebar-item ${active === 'analytics' ? 'active' : ''}`}
        onClick={() => onSelect('analytics')}
        aria-current={active === 'analytics' ? 'page' : undefined}
      >
        Analytics
      </button>
    </nav>
  )
}
