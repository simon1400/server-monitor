/* eslint-disable @typescript-eslint/no-explicit-any */
import { getNginxDomains } from './sites.js'

interface LighthouseMetrics {
  fcp: number
  lcp: number
  cls: number
  tbt: number
  si: number
}

interface LighthouseResult {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
  metrics: LighthouseMetrics
}

export interface SeoResult {
  domain: string
  mobile: LighthouseResult | null
  desktop: LighthouseResult | null
  lastChecked: number
  error: string | null
}

// Cache: domain -> SeoResult, 1 hour TTL
const cache = new Map<string, SeoResult>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Track in-progress scans
const scanning = new Set<string>()

function parsePsiResponse(data: any): LighthouseResult | null {
  try {
    const lh = data.lighthouseResult
    if (!lh) return null

    const categories = lh.categories
    const audits = lh.audits

    return {
      performance: Math.round((categories.performance?.score ?? 0) * 100),
      accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score ?? 0) * 100),
      seo: Math.round((categories.seo?.score ?? 0) * 100),
      metrics: {
        fcp: audits['first-contentful-paint']?.numericValue ?? 0,
        lcp: audits['largest-contentful-paint']?.numericValue ?? 0,
        cls: audits['cumulative-layout-shift']?.numericValue ?? 0,
        tbt: audits['total-blocking-time']?.numericValue ?? 0,
        si: audits['speed-index']?.numericValue ?? 0,
      },
    }
  } catch {
    return null
  }
}

async function fetchPsi(url: string, strategy: 'mobile' | 'desktop'): Promise<LighthouseResult | null> {
  const categories = 'performance,accessibility,best-practices,seo'
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=${categories}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000) // 2min timeout

  try {
    const res = await fetch(apiUrl, { signal: controller.signal })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`PSI API error ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    return parsePsiResponse(data)
  } finally {
    clearTimeout(timeout)
  }
}

export async function scanDomain(domain: string): Promise<SeoResult> {
  if (scanning.has(domain)) {
    return cache.get(domain) || { domain, mobile: null, desktop: null, lastChecked: 0, error: 'Scan in progress' }
  }

  // Return cached result if still fresh
  const cached = cache.get(domain)
  if (cached && (Date.now() - cached.lastChecked) < CACHE_TTL) {
    return cached
  }

  scanning.add(domain)
  const url = `https://${domain}`

  try {
    // Run mobile and desktop sequentially to avoid rate limiting
    const mobile = await fetchPsi(url, 'mobile')
    const desktop = await fetchPsi(url, 'desktop')

    const result: SeoResult = {
      domain,
      mobile,
      desktop,
      lastChecked: Date.now(),
      error: (!mobile && !desktop) ? 'Failed to get results from PageSpeed Insights' : null,
    }

    cache.set(domain, result)
    return result
  } catch (err: any) {
    const result: SeoResult = {
      domain,
      mobile: null,
      desktop: null,
      lastChecked: Date.now(),
      error: err.message || 'Unknown error',
    }
    cache.set(domain, result)
    return result
  } finally {
    scanning.delete(domain)
  }
}

export function getSeoResults(): SeoResult[] {
  return Array.from(cache.values())
}

export function isDomainScanning(domain: string): boolean {
  return scanning.has(domain)
}

export async function getSeoDomainsForScan(): Promise<string[]> {
  return getNginxDomains()
}
