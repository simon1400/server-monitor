import { useState, useEffect, useCallback } from 'react'
import { HardDrive, FolderOpen } from 'lucide-react'

interface DiskUsageEntry {
  name: string
  path: string
  size: string
  bytes: number
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

export default function DiskUsage() {
  const [entries, setEntries] = useState<DiskUsageEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/disk-usage')
      if (!res.ok) return
      const data = await res.json()
      setEntries(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 300000) // refresh every 5 min
    return () => clearInterval(id)
  }, [fetchData])

  if (loading && entries.length === 0) return null
  if (entries.length === 0) return null

  const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0)
  const maxBytes = entries[0]?.bytes ?? 1

  // Color palette for bars
  const colors = [
    'bg-accent-blue', 'bg-accent-purple', 'bg-accent-cyan', 'bg-accent-green',
    'bg-accent-yellow', 'bg-accent-red', 'bg-blue-400', 'bg-purple-400',
    'bg-cyan-400', 'bg-green-400', 'bg-yellow-400', 'bg-red-400',
  ]

  return (
    <div className="bg-bg-card rounded-xl border border-border p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-accent-cyan" />
          <h2 className="text-lg font-semibold">Disk Usage by Project</h2>
          <span className="text-xs text-text-muted">/opt/</span>
        </div>
        <span className="text-sm font-mono text-text-secondary">
          Total: {formatBytes(totalBytes)}
        </span>
      </div>

      {/* Stacked bar */}
      <div className="h-6 bg-bg-primary rounded-full overflow-hidden flex mb-4">
        {entries.map((entry, i) => {
          const pct = (entry.bytes / totalBytes) * 100
          if (pct < 0.5) return null
          return (
            <div
              key={entry.name}
              className={`h-full ${colors[i % colors.length]} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${entry.name}: ${entry.size} (${pct.toFixed(1)}%)`}
            />
          )
        })}
      </div>

      {/* Project list */}
      <div className="space-y-1">
        {entries.map((entry, i) => {
          const pct = maxBytes > 0 ? (entry.bytes / maxBytes) * 100 : 0

          return (
            <div
              key={entry.name}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-card-hover transition-colors"
            >
              <div className={`w-2.5 h-2.5 rounded-full ${colors[i % colors.length]} shrink-0`} />
              <span className="text-sm font-mono text-text-primary w-40 shrink-0 truncate">
                {entry.name}
              </span>
              <div className="flex-1 h-2 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${colors[i % colors.length]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm font-mono text-text-secondary w-20 text-right shrink-0">
                {entry.size}
              </span>
              <span className="flex items-center gap-1 text-xs text-text-muted shrink-0" title={entry.path}>
                <FolderOpen className="w-3.5 h-3.5" />
                {entry.path}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
