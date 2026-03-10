import { useState, useMemo } from 'react'
import { Search, SortAsc, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import type { PM2Process, SortField, SortDirection } from '../types'
import ProcessCard from './ProcessCard'

export default function ProcessList({ processes, onAction }: { processes: PM2Process[]; onAction: () => void }) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const [filter, setFilter] = useState<'all' | 'online' | 'errored' | 'stopped'>('all')

  const stats = useMemo(() => ({
    total: processes.length,
    online: processes.filter((p) => p.status === 'online').length,
    errored: processes.filter((p) => p.status === 'errored').length,
    stopped: processes.filter((p) => p.status === 'stopped').length,
    problematic: processes.filter((p) => p.restarts > 5 || p.status === 'errored').length,
  }), [processes])

  const filtered = useMemo(() => {
    let result = [...processes]

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(q))
    }

    if (filter === 'online') result = result.filter((p) => p.status === 'online')
    else if (filter === 'errored') result = result.filter((p) => p.status === 'errored' || p.restarts > 5)
    else if (filter === 'stopped') result = result.filter((p) => p.status === 'stopped')

    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'cpu': cmp = a.cpu - b.cpu; break
        case 'memory': cmp = a.memory - b.memory; break
        case 'uptime': cmp = a.uptime - b.uptime; break
        case 'restarts': cmp = a.restarts - b.restarts; break
        case 'status': cmp = a.status.localeCompare(b.status); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [processes, search, sortField, sortDir, filter])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'name' ? 'asc' : 'desc')
    }
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === 'all' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-secondary hover:bg-bg-card-hover'}`}
        >
          All <span className="font-mono">{stats.total}</span>
        </button>
        <button
          onClick={() => setFilter('online')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === 'online' ? 'bg-accent-green/20 text-accent-green' : 'text-text-secondary hover:bg-bg-card-hover'}`}
        >
          <CheckCircle className="w-3.5 h-3.5" /> Online <span className="font-mono">{stats.online}</span>
        </button>
        {stats.problematic > 0 && (
          <button
            onClick={() => setFilter('errored')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === 'errored' ? 'bg-accent-red/20 text-accent-red' : 'text-accent-red/70 hover:bg-bg-card-hover'}`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Problems <span className="font-mono">{stats.problematic}</span>
          </button>
        )}
        {stats.stopped > 0 && (
          <button
            onClick={() => setFilter('stopped')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === 'stopped' ? 'bg-text-muted/20 text-text-muted' : 'text-text-secondary hover:bg-bg-card-hover'}`}
          >
            <XCircle className="w-3.5 h-3.5" /> Stopped <span className="font-mono">{stats.stopped}</span>
          </button>
        )}
      </div>

      {/* Search & Sort */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search processes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div className="flex items-center gap-1">
          <SortAsc className="w-4 h-4 text-text-muted" />
          {(['name', 'cpu', 'memory', 'restarts'] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              className={`px-2 py-1 rounded text-xs transition-colors ${sortField === field ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'}`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {sortField === field && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
          ))}
        </div>
      </div>

      {/* Process cards */}
      <div className="space-y-2">
        {filtered.map((proc) => (
          <ProcessCard key={proc.pm_id} process={proc} onAction={onAction} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            No processes match your search
          </div>
        )}
      </div>
    </div>
  )
}
