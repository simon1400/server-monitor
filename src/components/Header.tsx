import { Monitor, RefreshCw, Wifi, WifiOff, Bell, Lock } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { formatDistanceToNow } from 'date-fns'
import { useState, useEffect, useRef } from 'react'
import NotificationSettings from './NotificationSettings'

interface HeaderProps {
  lastUpdate: number
  loading: boolean
  error: string | null
  onRefresh: () => void
  processCount: number
}

const navItems: { to: string; label: string; icon?: typeof Lock }[] = [
  { to: '/', label: 'Overview' },
  { to: '/apps', label: 'Apps' },
  { to: '/hosting', label: 'Hosting' },
  { to: '/disk', label: 'Disk' },
  { to: '/billing', label: 'Billing', icon: Lock },
]

export default function Header({ lastUpdate, loading, error, onRefresh, processCount }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false)
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)

  // On narrow screens the nav scrolls horizontally — keep the active tab visible
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <>
    {showNotifications && <NotificationSettings onClose={() => setShowNotifications(false)} />}
    <header className="bg-bg-secondary/80 backdrop-blur-sm border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-6 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Monitor className="w-5 h-5 sm:w-6 sm:h-6 text-accent-blue shrink-0" />
            <div className="hidden sm:block">
              <h1 className="text-sm sm:text-lg font-bold text-text-primary whitespace-nowrap">Monitor</h1>
              <p className="text-[10px] sm:text-xs text-text-muted">{processCount} proc</p>
            </div>
          </div>

          <nav ref={navRef} className="flex items-center gap-0.5 sm:gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-1 shrink-0 whitespace-nowrap px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-blue/15 text-accent-blue'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-card-hover'
                  }`
                }
              >
                {Icon && <Icon className="w-3 h-3 shrink-0" />}
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-4 shrink-0">
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
