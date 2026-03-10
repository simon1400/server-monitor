import { useProcessLogs } from '../hooks/useMonitor'
import { RefreshCw, Terminal } from 'lucide-react'

export default function ProcessLogs({ processId }: { processId: number }) {
  const { logs, loading, refresh } = useProcessLogs(processId, 50)

  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-bg-primary/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-text-muted" />
          <span className="text-sm text-text-secondary">Logs</span>
        </div>
        <button
          onClick={refresh}
          className="p-1 rounded hover:bg-bg-card-hover text-text-muted hover:text-text-primary transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-3 bg-[#0a0a0a] font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <span className="text-text-muted">No logs available</span>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`${log.type === 'err' ? 'text-accent-red' : 'text-text-secondary'} break-all`}>
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
