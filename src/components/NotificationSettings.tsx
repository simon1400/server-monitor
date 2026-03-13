import { Bell, BellOff, BellRing, Send, X, Check, AlertTriangle } from 'lucide-react'
import { useNotifications } from '../hooks/useNotifications'
import { useState } from 'react'

interface NotificationSettingsProps {
  onClose: () => void
}

export default function NotificationSettings({ onClose }: NotificationSettingsProps) {
  const {
    status,
    pushEnabled,
    pushSupported,
    loading,
    enablePush,
    disablePush,
    sendTest,
  } = useNotifications()

  const [testSent, setTestSent] = useState(false)

  const handleTest = async () => {
    const ok = await sendTest()
    if (ok) {
      setTestSent(true)
      setTimeout(() => setTestSent(false), 3000)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-accent-blue" />
            <h2 className="text-lg font-bold text-text-primary">Notifications</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-card-hover text-text-muted hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Browser Push Notifications */}
          <div className="bg-bg-secondary rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {pushEnabled ? (
                  <BellRing className="w-4 h-4 text-accent-green" />
                ) : (
                  <BellOff className="w-4 h-4 text-text-muted" />
                )}
                <span className="text-sm font-medium text-text-primary">Browser Push</span>
              </div>
              {pushSupported ? (
                <button
                  onClick={pushEnabled ? disablePush : enablePush}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    pushEnabled
                      ? 'bg-accent-red/15 text-accent-red hover:bg-accent-red/25'
                      : 'bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25'
                  } ${loading ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {loading ? 'Loading...' : pushEnabled ? 'Disable' : 'Enable'}
                </button>
              ) : (
                <span className="text-xs text-text-muted">Not supported</span>
              )}
            </div>
            <p className="text-xs text-text-muted">
              {pushEnabled
                ? 'You will receive push notifications even when the app is closed.'
                : 'Enable to receive alerts when processes go down, HTTP checks fail, or SSL certificates expire.'}
            </p>
          </div>

          {/* Telegram */}
          <div className="bg-bg-secondary rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {status?.telegram ? (
                  <Check className="w-4 h-4 text-accent-green" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-accent-yellow" />
                )}
                <span className="text-sm font-medium text-text-primary">Telegram</span>
              </div>
              <span className={`text-xs font-medium ${status?.telegram ? 'text-accent-green' : 'text-text-muted'}`}>
                {status?.telegram ? 'Connected' : 'Not configured'}
              </span>
            </div>
            <p className="text-xs text-text-muted">
              {status?.telegram
                ? 'Telegram bot is sending alerts to your chat.'
                : 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env on the server.'}
            </p>
          </div>

          {/* Status summary */}
          {status && (
            <div className="bg-bg-secondary rounded-xl p-4 space-y-2">
              <span className="text-sm font-medium text-text-primary">Alert channels</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${status.telegram ? 'bg-accent-green' : 'bg-text-muted'}`} />
                  <span className="text-text-secondary">Telegram</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${status.webPush && pushEnabled ? 'bg-accent-green' : 'bg-text-muted'}`} />
                  <span className="text-text-secondary">Web Push</span>
                </div>
              </div>
            </div>
          )}

          {/* Alerts info */}
          <div className="bg-bg-secondary rounded-xl p-4 space-y-1.5">
            <span className="text-sm font-medium text-text-primary">Monitored events</span>
            <ul className="text-xs text-text-muted space-y-1">
              <li className="flex items-center gap-1.5">
                <span className="text-red-400">&#9679;</span> Process goes down / recovers
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-red-400">&#9679;</span> HTTP health check fails / recovers
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-yellow-400">&#9679;</span> High restart count (&gt;20)
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-yellow-400">&#9679;</span> SSL certificate expiring (&lt;7 days)
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-red-400">&#9679;</span> SSL certificate invalid
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-red-400">&#9679;</span> Site goes down / recovers
              </li>
            </ul>
          </div>

          {/* Test button */}
          <button
            onClick={handleTest}
            disabled={testSent}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-blue/15 text-accent-blue rounded-xl text-sm font-medium hover:bg-accent-blue/25 transition-colors disabled:opacity-50"
          >
            {testSent ? (
              <>
                <Check className="w-4 h-4" />
                Test sent!
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send test notification
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
