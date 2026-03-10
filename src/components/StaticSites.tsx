import { useState, useEffect, useCallback } from 'react'
import { FileCode2, ExternalLink, FolderOpen, HardDrive, ShieldCheck, ShieldX } from 'lucide-react'

interface StaticSite {
  domain: string
  root: string
  ssl: boolean
  diskUsage: string
}

export default function StaticSites() {
  const [sites, setSites] = useState<StaticSite[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/static-sites')
      if (!res.ok) return
      const data = await res.json()
      setSites(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSites()
    const id = setInterval(fetchSites, 60000)
    return () => clearInterval(id)
  }, [fetchSites])

  if (loading && sites.length === 0) return null
  if (sites.length === 0) return null

  return (
    <div className="bg-bg-card rounded-xl border border-border p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <FileCode2 className="w-5 h-5 text-accent-purple" />
        <h2 className="text-lg font-semibold">Static Sites</h2>
        <span className="text-xs text-text-muted">{sites.length} site{sites.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-1">
        {sites.map((site) => (
          <div
            key={site.domain}
            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-accent-purple" />
              <span className="text-sm font-mono text-text-primary">{site.domain}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-xs text-text-muted" title={site.root}>
                <FolderOpen className="w-3.5 h-3.5" />
                {site.root.split('/').slice(-2).join('/')}
              </span>
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <HardDrive className="w-3.5 h-3.5" />
                {site.diskUsage}
              </span>
              {site.ssl ? (
                <span className="flex items-center gap-1 text-xs text-accent-green">
                  <ShieldCheck className="w-3.5 h-3.5" /> SSL
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-accent-yellow">
                  <ShieldX className="w-3.5 h-3.5" /> No SSL
                </span>
              )}
              <a
                href={`https://${site.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-accent-blue transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
