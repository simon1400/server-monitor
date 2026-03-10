import { useState, useEffect, useCallback } from 'react'
import { HardDrive, FolderOpen, Server, Package, Loader2 } from 'lucide-react'

interface DiskUsageEntry {
  name: string
  path: string
  size: string
  bytes: number
  category: 'project' | 'system' | 'other'
}

interface DiskUsageData {
  entries: DiskUsageEntry[]
  totalDisk: number
  usedDisk: number
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

function EntryRow({ entry, maxBytes, color }: { entry: DiskUsageEntry; maxBytes: number; color: string }) {
  const pct = maxBytes > 0 ? (entry.bytes / maxBytes) * 100 : 0

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-bg-card-hover transition-colors">
      <div className={`w-2 h-2 rounded-full ${color} shrink-0`} />
      <span className="text-sm font-mono text-text-primary w-36 shrink-0 truncate" title={entry.path}>
        {entry.name}
      </span>
      <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-mono text-text-secondary w-20 text-right shrink-0">
        {entry.size}
      </span>
      <span className="flex items-center gap-1 text-xs text-text-muted w-44 shrink-0 truncate" title={entry.path}>
        <FolderOpen className="w-3 h-3 shrink-0" />
        {entry.path}
      </span>
    </div>
  )
}

export default function DiskUsage() {
  const [data, setData] = useState<DiskUsageData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/disk-usage')
      if (!res.ok) return
      setData(await res.json())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 300000)
    return () => clearInterval(id)
  }, [fetchData])

  if (loading && !data) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-accent-cyan" />
          <h2 className="text-lg font-semibold">Disk Usage Breakdown</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
          <p className="text-sm text-text-muted">Scanning disk usage...</p>
          <p className="text-xs text-text-muted">This may take a moment</p>
        </div>
      </div>
    )
  }
  if (!data || data.entries.length === 0) return null

  const projects = data.entries.filter(e => e.category === 'project')
  const system = data.entries.filter(e => e.category === 'system')

  const allBytes = data.entries.reduce((sum, e) => sum + e.bytes, 0)
  const projectBytes = projects.reduce((sum, e) => sum + e.bytes, 0)
  const systemBytes = system.reduce((sum, e) => sum + e.bytes, 0)
  const otherBytes = data.usedDisk > 0 ? Math.max(0, data.usedDisk - allBytes) : 0

  const maxProjectBytes = projects[0]?.bytes ?? 1
  const maxSystemBytes = system[0]?.bytes ?? 1

  // Stacked bar segments
  const segments = data.usedDisk > 0 ? [
    { label: 'Projects', bytes: projectBytes, color: 'bg-accent-blue' },
    { label: 'System', bytes: systemBytes, color: 'bg-accent-yellow' },
    { label: 'Other', bytes: otherBytes, color: 'bg-text-muted' },
    { label: 'Free', bytes: data.totalDisk - data.usedDisk, color: 'bg-bg-primary' },
  ] : []

  return (
    <div className="bg-bg-card rounded-xl border border-border p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-accent-cyan" />
          <h2 className="text-lg font-semibold">Disk Usage Breakdown</h2>
        </div>
        {data.usedDisk > 0 && (
          <span className="text-sm font-mono text-text-secondary">
            {formatBytes(data.usedDisk)} / {formatBytes(data.totalDisk)}
          </span>
        )}
      </div>

      {/* Overall stacked bar */}
      {segments.length > 0 && (
        <div className="mb-4">
          <div className="h-5 bg-bg-primary rounded-full overflow-hidden flex">
            {segments.map(seg => {
              const pct = (seg.bytes / data.totalDisk) * 100
              if (pct < 0.3) return null
              return (
                <div
                  key={seg.label}
                  className={`h-full ${seg.color} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${seg.label}: ${formatBytes(seg.bytes)} (${pct.toFixed(1)}%)`}
                />
              )
            })}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-blue inline-block" />
              Projects {formatBytes(projectBytes)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-yellow inline-block" />
              System {formatBytes(systemBytes)}
            </span>
            {otherBytes > 100 * 1024 * 1024 && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-text-muted inline-block" />
                Other {formatBytes(otherBytes)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-bg-primary border border-border inline-block" />
              Free {formatBytes(data.totalDisk - data.usedDisk)}
            </span>
          </div>
        </div>
      )}

      {/* Projects section */}
      {projects.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2 px-3">
            <Package className="w-4 h-4 text-accent-blue" />
            <h3 className="text-sm font-semibold text-text-secondary">Projects</h3>
            <span className="text-xs text-text-muted">/opt/ — {formatBytes(projectBytes)}</span>
          </div>
          <div className="space-y-0.5">
            {projects.map(entry => (
              <EntryRow key={entry.path} entry={entry} maxBytes={maxProjectBytes} color="bg-accent-blue" />
            ))}
          </div>
        </div>
      )}

      {/* System section */}
      {system.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-3">
            <Server className="w-4 h-4 text-accent-yellow" />
            <h3 className="text-sm font-semibold text-text-secondary">System</h3>
            <span className="text-xs text-text-muted">{formatBytes(systemBytes)}</span>
          </div>
          <div className="space-y-0.5">
            {system.map(entry => (
              <EntryRow key={entry.path} entry={entry} maxBytes={maxSystemBytes} color="bg-accent-yellow" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
