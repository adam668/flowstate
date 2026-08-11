export type ViewName = 'dashboard' | 'tradeLog' | 'accounts'

interface SidebarProps {
  active: ViewName
  onSelect: (view: ViewName) => void
}

export function Sidebar({ active, onSelect }: SidebarProps): JSX.Element {
  return (
    <nav className="sidebar">
      <a
        className={`sidebar-item ${active === 'dashboard' ? 'active' : ''}`}
        onClick={() => onSelect('dashboard')}
      >
        Dashboard
      </a>
      <a
        className={`sidebar-item ${active === 'tradeLog' ? 'active' : ''}`}
        onClick={() => onSelect('tradeLog')}
      >
        Trade Log
      </a>
      <a
        className={`sidebar-item ${active === 'accounts' ? 'active' : ''}`}
        onClick={() => onSelect('accounts')}
      >
        Accounts
      </a>
      <a className="sidebar-item disabled">Calendar</a>
      <a className="sidebar-item disabled">Analytics</a>
    </nav>
  )
}
