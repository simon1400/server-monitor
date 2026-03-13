import { useState, useMemo } from 'react'
import { Search, SortAsc, AlertTriangle, CheckCircle, XCircle, Globe, ShieldAlert } from 'lucide-react'
import type { PM2Process, SiteStatus, SortField, SortDirection } from '../types'
import ProcessCard from './ProcessCard'

export default function ProcessList({ processes, sites, onAction }: { processes: PM2Process[]; sites: SiteStatus[]; onAction: () => void }) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const [filter, setFilter] = useState<'all' | 'online' | 'errored' | 'stopped'>('all')

  // Build a map: pm_id -> SiteStatus (with name-based fallback)
  const processSiteMap = useMemo(() => {
    const domainMap = new Map<string, SiteStatus>()
    for (const site of sites) {
      domainMap.set(site.domain, site)
    }

    const result = new Map<number, SiteStatus>()
    const usedDomains = new Set<string>()

    // 1st pass: exact match via httpDomain (PID-based mapping from backend)
    for (const proc of processes) {
      if (proc.httpDomain) {
        const site = domainMap.get(proc.httpDomain)
        if (site) {
          result.set(proc.pm_id, site)
          usedDomains.add(site.domain)
        }
      }
    }

    // 2nd pass: fallback — match by process name prefix
    // e.g. "tulsio-client" → prefix "tulsio" → matches "tulsio.hardart.cz"
    for (const proc of processes) {
      if (result.has(proc.pm_id)) continue
      const prefix = proc.name.replace(/-(client|strapi)$/, '')
      if (!prefix || prefix === proc.name) continue
      for (const site of sites) {
        if (usedDomains.has(site.domain)) continue
        // match domain starting with prefix or containing prefix before a dot
        if (site.domain.startsWith(prefix + '.') || site.domain.includes(prefix + '.')) {
          result.set(proc.pm_id, site)
          usedDomains.add(site.domain)
          break
        }
      }
    }

    return result
  }, [sites, processes])

  const stats = useMemo(() => {
    const problematic = processes.filter((p) => {
      const site = processSiteMap.get(p.pm_id)
      const sslBad = site?.ssl && !site.ssl.valid
      return p.restarts > 20 || p.status === 'errored' || (p.status === 'online' && p.httpOk === false) || sslBad
    })
    return {
      total: processes.length,
      online: processes.filter((p) => p.status === 'online').length,
      errored: processes.filter((p) => p.status === 'errored').length,
      stopped: processes.filter((p) => p.status === 'stopped').length,
      problematic: problematic.length,
    }
  }, [processes, processSiteMap])

  // Domains not linked to any process
  const orphanSites = useMemo(() => {
    const linkedDomains = new Set<string>()
    for (const proc of processes) {
      const site = processSiteMap.get(proc.pm_id)
      if (site) linkedDomains.add(site.domain)
    }
    return sites.filter(s => !linkedDomains.has(s.domain))
  }, [processes, sites, processSiteMap])

  const filtered = useMemo(() => {
    let result = [...processes]

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((p) => {
        const domain = processSiteMap.get(p.pm_id)?.domain
        return p.name.toLowerCase().includes(q) || (domain && domain.toLowerCase().includes(q))
      })
    }

    if (filter === 'online') result = result.filter((p) => p.status === 'online')
    else if (filter === 'errored') result = result.filter((p) => {
      const site = processSiteMap.get(p.pm_id)
      const sslBad = site?.ssl && !site.ssl.valid
      return p.status === 'errored' || p.restarts > 20 || (p.status === 'online' && p.httpOk === false) || sslBad
    })
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
  }, [processes, search, sortField, sortDir, filter, processSiteMap])

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
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by process or domain..."
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
          <ProcessCard key={proc.pm_id} process={proc} site={processSiteMap.get(proc.pm_id)} onAction={onAction} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            No processes match your search
          </div>
        )}
      </div>

      {/* Orphan domains (not linked to any PM2 process) */}
      {orphanSites.length > 0 && !search && filter === 'all' && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-5 h-5 text-accent-cyan" />
            <h3 className="text-sm font-semibold text-text-secondary">Other Domains</h3>
            <span className="text-xs text-text-muted">(no PM2 process linked)</span>
          </div>
          <div className="space-y-1">
            {orphanSites.map((site) => {
              const hasProblem = !site.httpOk || (site.ssl !== null && !site.ssl.valid)
              return (
                <div
                  key={site.domain}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-lg bg-bg-card border ${hasProblem ? 'border-accent-red/30' : 'border-border'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${hasProblem ? 'bg-accent-red' : site.ssl && site.ssl.daysLeft <= 14 ? 'bg-accent-yellow' : 'bg-accent-green'}`} />
                    <span className={`text-sm font-mono ${hasProblem ? 'text-accent-red' : 'text-text-primary'}`}>
                      {site.domain}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {site.httpOk
                      ? <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-green/15 text-accent-green">{site.httpStatus}</span>
                      : <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-red/15 text-accent-red">{site.httpStatus ?? 'DOWN'}</span>
                    }
                    {site.ssl ? (
                      !site.ssl.valid
                        ? <span className="flex items-center gap-1 text-xs text-accent-red"><ShieldAlert className="w-3.5 h-3.5" /> {site.ssl.daysLeft <= 0 ? 'Expired' : 'Invalid'}</span>
                        : site.ssl.daysLeft <= 14
                          ? <span className="flex items-center gap-1 text-xs text-accent-yellow"><ShieldAlert className="w-3.5 h-3.5" /> {site.ssl.daysLeft}d</span>
                          : <span className="flex items-center gap-1 text-xs text-accent-green"><ShieldAlert className="w-3.5 h-3.5" /> {site.ssl.daysLeft}d</span>
                    ) : (
                      <span className="text-xs text-text-muted">No SSL</span>
                    )}
                    <span className="text-xs text-text-muted font-mono w-14 text-right">{site.responseTime}ms</span>
                    <a
                      href={`https://${site.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted hover:text-accent-blue transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
