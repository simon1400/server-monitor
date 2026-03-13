import { useState, useEffect, useCallback } from 'react'
import { Globe, ShieldCheck, ShieldAlert, ShieldX, ExternalLink, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

interface SiteSSL {
  valid: boolean
  issuer: string
  notBefore: string
  notAfter: string
  daysLeft: number
  error: string | null
}

interface SiteStatus {
  domain: string
  httpStatus: number | null
  httpOk: boolean
  responseTime: number
  ssl: SiteSSL | null
  error: string | null
}

function SSLBadge({ ssl }: { ssl: SiteSSL | null }) {
  if (!ssl) {
    return (
      <span className="flex items-center gap-1 text-xs text-text-muted">
        <ShieldX className="w-3.5 h-3.5" /> No SSL
      </span>
    )
  }

  if (!ssl.valid) {
    return (
      <span className="flex items-center gap-1 text-xs text-accent-red font-medium">
        <ShieldAlert className="w-3.5 h-3.5" />
        {ssl.error === 'CERT_HAS_EXPIRED' || ssl.daysLeft <= 0 ? 'Expired' : ssl.error || 'Invalid'}
      </span>
    )
  }

  if (ssl.daysLeft <= 14) {
    return (
      <span className="flex items-center gap-1 text-xs text-accent-yellow font-medium">
        <ShieldAlert className="w-3.5 h-3.5" />
        {ssl.daysLeft}d left
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 text-xs text-accent-green">
      <ShieldCheck className="w-3.5 h-3.5" />
      {ssl.daysLeft}d
    </span>
  )
}

function HttpBadge({ status, ok }: { status: number | null; ok: boolean }) {
  if (status === null) {
    return <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-red/15 text-accent-red">DOWN</span>
  }
  if (ok) {
    return <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-green/15 text-accent-green">{status}</span>
  }
  if (status >= 500) {
    return <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-red/15 text-accent-red">{status}</span>
  }
  return <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-yellow/15 text-accent-yellow">{status}</span>
}

export default function SitesStatus() {
  const [sites, setSites] = useState<SiteStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/sites')
      if (!res.ok) return
      const data = await res.json()
      setSites(data)
    // eslint-disable-next-line no-empty
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSites()
    const id = setInterval(fetchSites, 60000)
    return () => clearInterval(id)
  }, [fetchSites])

  const problems = sites.filter((s) => !s.httpOk || (s.ssl && !s.ssl.valid))
  const warnings = sites.filter((s) => s.httpOk && s.ssl?.valid && s.ssl.daysLeft <= 14)
  const healthy = sites.filter((s) => s.httpOk && (!s.ssl || (s.ssl.valid && s.ssl.daysLeft > 14)))

  return (
    <div className="bg-bg-card rounded-xl border border-border p-5 mb-6">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-5 h-5 text-accent-cyan shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold whitespace-nowrap">Sites & SSL</h2>
          <span className="text-xs text-text-muted hidden sm:inline">{sites.length} domains</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {problems.length > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent-red/15 text-accent-red font-medium">
              <XCircle className="w-3.5 h-3.5" /> {problems.length} problem{problems.length > 1 ? 's' : ''}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent-yellow/15 text-accent-yellow font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> {warnings.length} warning{warnings.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-accent-green">
            <CheckCircle className="w-3.5 h-3.5" /> {healthy.length} ok
          </span>
          <button
            onClick={() => { setLoading(true); fetchSites() }}
            className="p-1.5 rounded-lg hover:bg-bg-card-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && sites.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-4">Checking sites...</p>
      ) : (
        <div className="space-y-1">
          {sites.map((site) => {
            const hasProblem = !site.httpOk || (site.ssl !== null && !site.ssl.valid)
            const isExpanded = expanded === site.domain

            return (
              <div key={site.domain}>
                <div
                  className={`flex items-center justify-between gap-2 px-2 sm:px-3 py-2 rounded-lg cursor-pointer transition-colors ${hasProblem ? 'bg-accent-red/5 hover:bg-accent-red/10' : 'hover:bg-bg-card-hover'}`}
                  onClick={() => setExpanded(isExpanded ? null : site.domain)}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${hasProblem ? 'bg-accent-red' : site.ssl && site.ssl.daysLeft <= 14 ? 'bg-accent-yellow' : 'bg-accent-green'}`} />
                    <span className={`text-xs sm:text-sm font-mono truncate ${hasProblem ? 'text-accent-red' : 'text-text-primary'}`}>
                      {site.domain}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <HttpBadge status={site.httpStatus} ok={site.httpOk} />
                    <span className="hidden sm:inline-flex"><SSLBadge ssl={site.ssl} /></span>
                    <span className="text-xs text-text-muted font-mono hidden sm:block w-14 text-right">
                      {site.responseTime}ms
                    </span>
                    <a
                      href={`https://${site.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-text-muted hover:text-accent-blue transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {isExpanded && (
                  <div className="ml-4 sm:ml-8 mr-1 sm:mr-3 mt-1 mb-2 p-2 sm:p-3 bg-bg-primary rounded-lg text-xs space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <span className="text-text-muted block">HTTP Status</span>
                        <span className="font-mono text-text-primary">{site.httpStatus ?? 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Response Time</span>
                        <span className="font-mono text-text-primary">{site.responseTime}ms</span>
                      </div>
                      {site.ssl && (
                        <>
                          <div>
                            <span className="text-text-muted block">SSL Issuer</span>
                            <span className="font-mono text-text-primary">{site.ssl.issuer || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-text-muted block">SSL Expires</span>
                            <span className={`font-mono ${site.ssl.daysLeft <= 0 ? 'text-accent-red font-bold' : site.ssl.daysLeft <= 14 ? 'text-accent-yellow' : 'text-text-primary'}`}>
                              {site.ssl.notAfter ? new Date(site.ssl.notAfter).toLocaleDateString('cs-CZ') : 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted block">Days Left</span>
                            <span className={`font-mono font-bold ${site.ssl.daysLeft <= 0 ? 'text-accent-red' : site.ssl.daysLeft <= 14 ? 'text-accent-yellow' : 'text-accent-green'}`}>
                              {site.ssl.daysLeft}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted block">SSL Valid</span>
                            <span className={`font-mono ${site.ssl.valid ? 'text-accent-green' : 'text-accent-red'}`}>
                              {site.ssl.valid ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    {(site.error || site.ssl?.error) && (
                      <div className="mt-2 p-2 bg-accent-red/10 rounded text-accent-red">
                        {site.error && <div>HTTP: {site.error}</div>}
                        {site.ssl?.error && <div>SSL: {site.ssl.error}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
