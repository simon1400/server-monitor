/* eslint-disable no-empty */
import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, Loader2, ExternalLink, Monitor, Smartphone, ChevronDown, ChevronRight } from 'lucide-react'
import type { SeoResult, LighthouseResult } from '../types'

function scoreColor(score: number): string {
  if (score >= 90) return 'text-accent-green'
  if (score >= 50) return 'text-accent-yellow'
  return 'text-accent-red'
}

function scoreBg(score: number): string {
  if (score >= 90) return 'bg-accent-green'
  if (score >= 50) return 'bg-accent-yellow'
  return 'bg-accent-red'
}

function ScoreCircle({ score, label, size = 'md' }: { score: number; label: string; size?: 'sm' | 'md' }) {
  const r = size === 'sm' ? 18 : 22
  const strokeWidth = size === 'sm' ? 3 : 4
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const dim = (r + strokeWidth) * 2

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={dim} height={dim} className="transform -rotate-90">
        <circle cx={r + strokeWidth} cy={r + strokeWidth} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-border" />
        <circle cx={r + strokeWidth} cy={r + strokeWidth} r={r} fill="none" strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className={scoreBg(score)} />
      </svg>
      <span className={`text-xs font-bold ${size === 'sm' ? '' : 'text-sm'} ${scoreColor(score)} -mt-${dim / 2 + 2}`}
        style={{ marginTop: `-${dim / 2 + 6}px` }}>
        {score}
      </span>
      <span className="text-[10px] text-text-muted mt-1">{label}</span>
    </div>
  )
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function MetricRow({ label, value, unit, good, poor }: { label: string; value: number; unit?: string; good: number; poor: number }) {
  const display = unit === 'ms' ? formatMs(value) : value.toFixed(3)
  const isGood = unit === 'ms' ? value <= good : value <= good
  const isPoor = unit === 'ms' ? value > poor : value > poor

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-xs font-mono font-medium ${isGood ? 'text-accent-green' : isPoor ? 'text-accent-red' : 'text-accent-yellow'}`}>
        {display}
      </span>
    </div>
  )
}

function LighthousePanel({ result, label, icon }: { result: LighthouseResult; label: string; icon: React.ReactNode }) {
  return (
    <div className="bg-bg-primary rounded-lg p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-4">
        <ScoreCircle score={result.performance} label="Perf" size="sm" />
        <ScoreCircle score={result.accessibility} label="A11y" size="sm" />
        <ScoreCircle score={result.bestPractices} label="BP" size="sm" />
        <ScoreCircle score={result.seo} label="SEO" size="sm" />
      </div>

      <div className="space-y-0.5">
        <div className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">Core Web Vitals</div>
        <MetricRow label="FCP" value={result.metrics.fcp} unit="ms" good={1800} poor={3000} />
        <MetricRow label="LCP" value={result.metrics.lcp} unit="ms" good={2500} poor={4000} />
        <MetricRow label="TBT" value={result.metrics.tbt} unit="ms" good={200} poor={600} />
        <MetricRow label="CLS" value={result.metrics.cls} good={0.1} poor={0.25} />
        <MetricRow label="SI" value={result.metrics.si} unit="ms" good={3400} poor={5800} />
      </div>
    </div>
  )
}

export default function SeoStatus() {
  const [domains, setDomains] = useState<string[]>([])
  const [results, setResults] = useState<SeoResult[]>([])
  const [scanning, setScanning] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/seo')
      if (!res.ok) return
      const data = await res.json()
      setDomains(data.domains)
      setResults(data.results)
      setScanning(new Set(data.scanning))
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const scanDomain = useCallback(async (domain: string) => {
    setScanning(prev => new Set(prev).add(domain))
    try {
      const res = await fetch(`/api/seo/${domain}/scan`, { method: 'POST' })
      if (!res.ok) return
      const result: SeoResult = await res.json()
      setResults(prev => {
        const filtered = prev.filter(r => r.domain !== domain)
        return [...filtered, result].sort((a, b) => a.domain.localeCompare(b.domain))
      })
    } catch {} finally {
      setScanning(prev => {
        const next = new Set(prev)
        next.delete(domain)
        return next
      })
    }
  }, [])

  const scanned = results.filter(r => r.lastChecked > 0)
  const avgPerf = scanned.length > 0
    ? Math.round(scanned.reduce((sum, r) => sum + (r.mobile?.performance ?? 0), 0) / scanned.length)
    : null

  return (
    <div className="bg-bg-card rounded-xl border border-border p-5 mb-6">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Search className="w-5 h-5 text-accent-purple shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold whitespace-nowrap">SEO & Performance</h2>
          <span className="text-xs text-text-muted hidden sm:inline">{domains.length} domains</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {avgPerf !== null && (
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${scoreBg(avgPerf)}/15 ${scoreColor(avgPerf)}`}>
              avg {avgPerf}
            </span>
          )}
          <span className="text-xs text-text-muted">{scanned.length}/{domains.length} scanned</span>
          <button
            onClick={fetchData}
            className="p-1.5 rounded-lg hover:bg-bg-card-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && domains.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-4">Loading domains...</p>
      ) : (
        <div className="space-y-1">
          {domains.map(domain => {
            const result = results.find(r => r.domain === domain)
            const isScanning = scanning.has(domain)
            const isExpanded = expanded === domain
            const mobilePerf = result?.mobile?.performance
            const desktopPerf = result?.desktop?.performance

            return (
              <div key={domain}>
                <div
                  className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-bg-card-hover cursor-pointer transition-colors"
                  onClick={() => result && setExpanded(isExpanded ? null : domain)}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {result ? (
                      isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="text-xs sm:text-sm font-mono truncate text-text-primary">
                      {domain}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    {result && !result.error && (
                      <>
                        {mobilePerf !== undefined && (
                          <span className="flex items-center gap-1">
                            <Smartphone className="w-3 h-3 text-text-muted" />
                            <span className={`text-xs font-mono font-bold ${scoreColor(mobilePerf)}`}>{mobilePerf}</span>
                          </span>
                        )}
                        {desktopPerf !== undefined && (
                          <span className="flex items-center gap-1">
                            <Monitor className="w-3 h-3 text-text-muted" />
                            <span className={`text-xs font-mono font-bold ${scoreColor(desktopPerf)}`}>{desktopPerf}</span>
                          </span>
                        )}
                      </>
                    )}
                    {result?.error && (
                      <span className="text-xs text-accent-red truncate max-w-30">{result.error}</span>
                    )}
                    {result?.lastChecked ? (
                      <span className="text-[10px] text-text-muted hidden sm:block w-16 text-right">
                        {new Date(result.lastChecked).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : null}
                    <button
                      onClick={(e) => { e.stopPropagation(); scanDomain(domain) }}
                      disabled={isScanning}
                      className="p-1 rounded hover:bg-bg-card-hover text-text-muted hover:text-accent-purple transition-colors disabled:opacity-50"
                      title={isScanning ? 'Scanning...' : 'Run PageSpeed scan'}
                    >
                      {isScanning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={`https://pagespeed.web.dev/analysis?url=https://${domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-text-muted hover:text-accent-blue transition-colors"
                      title="Open in PageSpeed Insights"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {isExpanded && result && (result.mobile || result.desktop) && (
                  <div className="ml-4 sm:ml-8 mr-1 sm:mr-3 mt-1 mb-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {result.mobile && (
                      <LighthousePanel
                        result={result.mobile}
                        label="Mobile"
                        icon={<Smartphone className="w-4 h-4 text-text-muted" />}
                      />
                    )}
                    {result.desktop && (
                      <LighthousePanel
                        result={result.desktop}
                        label="Desktop"
                        icon={<Monitor className="w-4 h-4 text-text-muted" />}
                      />
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
