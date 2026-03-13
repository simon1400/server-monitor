import { Monitor, RefreshCw, Wifi, WifiOff, Bell } from 'lucide-react'
import { NavLink } from 'react-router'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import NotificationSettings from './NotificationSettings'

interface HeaderProps {
  lastUpdate: number
  loading: boolean
  error: string | null
  onRefresh: () => void
  processCount: number
}

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/apps', label: 'Apps' },
  { to: '/disk', label: 'Disk' },
]

export default function Header({ lastUpdate, loading, error, onRefresh, processCount }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false)

  return (
    <>
    {showNotifications && <NotificationSettings onClose={() => setShowNotifications(false)} />}
    <header className="bg-bg-secondary/80 backdrop-blur-sm border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Monitor className="w-6 h-6 text-accent-blue" />
            <div>
              <h1 className="text-lg font-bold text-text-primary">Server Monitor</h1>
              <p className="text-xs text-text-muted">{processCount} processes</p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-blue/15 text-accent-blue'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-card-hover'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {error ? (
            <div className="flex items-center gap-1.5 text-accent-red text-sm">
              <WifiOff className="w-4 h-4" />
              <span className="hidden sm:inline">Disconnected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-accent-green text-sm">
              <Wifi className="w-4 h-4" />
              <span className="hidden sm:inline">Connected</span>
            </div>
          )}

          {lastUpdate > 0 && (
            <span className="text-xs text-text-muted hidden sm:block">
              Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          )}

          <button
            onClick={() => setShowNotifications(true)}
            className="p-2 rounded-lg hover:bg-bg-card-hover text-text-muted hover:text-text-primary transition-colors"
            title="Notification settings"
          >
            <Bell className="w-4 h-4" />
          </button>

          <button
            onClick={onRefresh}
            className="p-2 rounded-lg hover:bg-bg-card-hover text-text-muted hover:text-text-primary transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
    </>
  )
}
