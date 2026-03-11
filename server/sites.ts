import { exec } from 'child_process'
import { promisify } from 'util'
import https from 'https'
import http from 'http'
import tls from 'tls'

const execAsync = promisify(exec)

// Custom health-check paths for domains where "/" returns non-2xx
const CUSTOM_CHECK_PATHS: Record<string, string> = {
  'api.pellwood.com': '/order',
}

export interface SiteStatus {
  domain: string
  httpStatus: number | null
  httpOk: boolean
  responseTime: number
  ssl: {
    valid: boolean
    issuer: string
    notBefore: string
    notAfter: string
    daysLeft: number
    error: string | null
  } | null
  error: string | null
}

// Get domains from nginx config
export async function getNginxDomains(): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `nginx -T 2>/dev/null | grep -E 'server_name [a-z]' | grep -v '#' | sed 's/.*server_name //' | sed 's/;.*//' | tr ' ' '\\n' | sort -u | grep -v 'www\\.' | grep -v 'localhost' | grep '\\.'`
    )
    return stdout.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function checkHttp(domain: string): Promise<{ status: number | null; time: number; error: string | null }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const path = CUSTOM_CHECK_PATHS[domain] || '/'
    const req = https.get(
      `https://${domain}${path}`,
      { timeout: 10000, rejectUnauthorized: false },
      (res) => {
        resolve({ status: res.statusCode ?? null, time: Date.now() - start, error: null })
        res.resume()
      }
    )
    req.on('error', () => {
      // Try HTTP fallback
      const reqHttp = http.get(
        `http://${domain}${path}`,
        { timeout: 10000 },
        (res) => {
          resolve({ status: res.statusCode ?? null, time: Date.now() - start, error: null })
          res.resume()
        }
      )
      reqHttp.on('error', (err2) => {
        resolve({ status: null, time: Date.now() - start, error: err2.message })
      })
      reqHttp.on('timeout', () => {
        reqHttp.destroy()
        resolve({ status: null, time: Date.now() - start, error: 'Timeout' })
      })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve({ status: null, time: Date.now() - start, error: 'Timeout' })
    })
  })
}

function checkSSL(domain: string): Promise<SiteStatus['ssl']> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      443,
      domain,
      { rejectUnauthorized: false, servername: domain, timeout: 10000 },
      () => {
        try {
          const cert = socket.getPeerCertificate()
          const authorized = socket.authorized ?? false

          if (cert && cert.valid_to) {
            const notAfter = new Date(cert.valid_to)
            const notBefore = new Date(cert.valid_from)
            const now = new Date()
            const daysLeft = Math.floor((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

            resolve({
              valid: authorized && daysLeft > 0,
              issuer: String(cert.issuer?.O || cert.issuer?.CN || 'Unknown'),
              notBefore: notBefore.toISOString(),
              notAfter: notAfter.toISOString(),
              daysLeft,
              error: authorized ? null : String(socket.authorizationError || 'Certificate not trusted'),
            })
          } else {
            resolve({ valid: false, issuer: '', notBefore: '', notAfter: '', daysLeft: 0, error: 'No certificate' })
          }
        } catch {
          resolve({ valid: false, issuer: '', notBefore: '', notAfter: '', daysLeft: 0, error: 'Failed to read certificate' })
        }
        socket.end()
      }
    )
    socket.on('error', (err) => {
      resolve({ valid: false, issuer: '', notBefore: '', notAfter: '', daysLeft: 0, error: err.message })
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve({ valid: false, issuer: '', notBefore: '', notAfter: '', daysLeft: 0, error: 'Timeout' })
    })
  })
}

export interface StaticSite {
  domain: string
  root: string
  ssl: boolean
  diskUsage: string
}

// Parse nginx config to find static sites (root + try_files, no proxy_pass)
export async function getStaticSites(): Promise<StaticSite[]> {
  try {
    const { stdout } = await execAsync('nginx -T 2>/dev/null')
    const sites: StaticSite[] = []
    // Split into server blocks
    const blocks = stdout.split(/(?=server\s*\{)/)

    for (const block of blocks) {
      if (!block.includes('server {') && !block.includes('server{')) continue
      // Skip blocks that are just redirects or have proxy_pass
      if (block.includes('proxy_pass')) continue
      if (!block.includes('try_files')) continue

      const domainMatch = block.match(/server_name\s+([a-z0-9._-]+)/i)
      const rootMatch = block.match(/root\s+([^;]+);/)
      if (!domainMatch || !rootMatch) continue

      const domain = domainMatch[1]
      if (domain === 'localhost' || domain === '_') continue

      const root = rootMatch[1].trim()
      const hasSsl = block.includes('ssl_certificate') || block.includes('listen 443')

      // Get disk usage of the root directory
      let diskUsage = 'N/A'
      try {
        const { stdout: du } = await execAsync(`du -sh ${root} 2>/dev/null`)
        diskUsage = du.split('\t')[0] || 'N/A'
      } catch { /* disk usage unavailable */ }

      sites.push({ domain, root, ssl: hasSsl, diskUsage })
    }

    return sites
  } catch {
    return []
  }
}

export interface DiskUsageEntry {
  name: string
  path: string
  size: string
  bytes: number
  category: 'project' | 'system' | 'other'
}

export interface DiskUsageResponse {
  entries: DiskUsageEntry[]
  totalDisk: number
  usedDisk: number
}

let cachedDiskUsage: DiskUsageResponse | null = null
let lastDiskCheck = 0

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

function parseDuLines(stdout: string, category: DiskUsageEntry['category']): DiskUsageEntry[] {
  const entries: DiskUsageEntry[] = []
  for (const line of stdout.trim().split('\n')) {
    if (!line) continue
    const [bytesStr, dirPath] = line.split('\t')
    if (!bytesStr || !dirPath) continue
    const bytes = parseInt(bytesStr, 10)
    if (isNaN(bytes) || bytes === 0) continue
    const cleanPath = dirPath.replace(/\/$/, '')
    const name = cleanPath.split('/').pop() || cleanPath
    entries.push({ name, path: cleanPath, size: formatSize(bytes), bytes, category })
  }
  return entries
}

export async function getDiskUsage(): Promise<DiskUsageResponse> {
  // Cache for 5 minutes
  if (Date.now() - lastDiskCheck < 300000 && cachedDiskUsage) {
    return cachedDiskUsage
  }

  try {
    // Run all du commands in parallel + get disk totals
    const [optResult, systemResult, dfResult] = await Promise.all([
      // Projects in /opt/
      execAsync('du -sb /opt/*/ 2>/dev/null | sort -rn', { timeout: 30000 }),
      // Major system directories
      execAsync(
        'du -sb /var/log /var/lib /var/cache /var/backups /usr /tmp /root /home /snap 2>/dev/null | sort -rn',
        { timeout: 30000 }
      ),
      // Total disk info
      execAsync("df -B1 / | tail -1 | awk '{print $2, $3}'"),
    ])

    const entries: DiskUsageEntry[] = [
      ...parseDuLines(optResult.stdout, 'project'),
      ...parseDuLines(systemResult.stdout, 'system'),
    ]

    // Sort all by size descending
    entries.sort((a, b) => b.bytes - a.bytes)

    // Parse df output for total/used
    const [totalStr, usedStr] = dfResult.stdout.trim().split(/\s+/)
    const totalDisk = parseInt(totalStr, 10) || 0
    const usedDisk = parseInt(usedStr, 10) || 0

    cachedDiskUsage = { entries, totalDisk, usedDisk }
    lastDiskCheck = Date.now()
    return cachedDiskUsage
  } catch {
    return cachedDiskUsage || { entries: [], totalDisk: 0, usedDisk: 0 }
  }
}

// Map PM2 PIDs to their nginx domains and HTTP status
export async function getProcessHttpStatus(pids: { pm_id: number; pid: number }[]): Promise<Map<number, { domain: string; httpStatus: number | null; httpOk: boolean }>> {
  const result = new Map<number, { domain: string; httpStatus: number | null; httpOk: boolean }>()
  if (pids.length === 0) return result

  try {
    // 1. Parse nginx config: domain → upstream port
    const { stdout: nginxConfig } = await execAsync('nginx -T 2>/dev/null')
    const domainPortMap = new Map<number, string>() // port → domain
    const blocks = nginxConfig.split(/(?=server\s*\{)/)

    for (const block of blocks) {
      if (!block.includes('server {') && !block.includes('server{')) continue
      const domainMatch = block.match(/server_name\s+([a-z0-9._-]+)/i)
      const proxyMatch = block.match(/proxy_pass\s+https?:\/\/[^:]+:(\d+)/)
      if (!domainMatch || !proxyMatch) continue
      const domain = domainMatch[1]
      const port = parseInt(proxyMatch[1])
      if (domain !== 'localhost' && domain !== '_') {
        domainPortMap.set(port, domain)
      }
    }

    // 2. Get listening port → PID mapping using ss, then resolve to PM2 process via process tree
    const activePids = pids.filter(p => p.pid > 0)
    if (activePids.length === 0) return result

    const { stdout: ssOutput } = await execAsync('ss -tlnp 2>/dev/null')
    const portListenerPid = new Map<number, number>() // port → listener pid

    for (const line of ssOutput.split('\n')) {
      const portMatch = line.match(/:(\d+)\s/)
      const pidMatch = line.match(/pid=(\d+)/)
      if (portMatch && pidMatch) {
        const port = parseInt(portMatch[1])
        const pid = parseInt(pidMatch[1])
        if (domainPortMap.has(port)) {
          portListenerPid.set(port, pid)
        }
      }
    }

    // Build child→ancestor map using ps to walk process trees
    // Get all process parent relationships at once
    const { stdout: psOutput } = await execAsync('ps -eo pid,ppid --no-headers 2>/dev/null')
    const parentMap = new Map<number, number>() // child pid → parent pid
    for (const line of psOutput.trim().split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 2) {
        parentMap.set(parseInt(parts[0]), parseInt(parts[1]))
      }
    }

    // For each listener PID, walk up to find PM2 process ancestor
    function findPm2Ancestor(listenerPid: number): number | null {
      let current = listenerPid
      const visited = new Set<number>()
      while (current > 1 && !visited.has(current)) {
        visited.add(current)
        for (const { pid } of activePids) {
          if (current === pid) return pid
        }
        const parent = parentMap.get(current)
        if (!parent) break
        current = parent
      }
      return null
    }

    // 3. Match: port → listener PID → ancestor PM2 PID → pm_id → domain
    const checksToRun: { pm_id: number; domain: string }[] = []
    for (const [port, listenerPid] of portListenerPid) {
      const domain = domainPortMap.get(port)
      if (!domain) continue
      const ancestorPid = findPm2Ancestor(listenerPid)
      if (ancestorPid) {
        const proc = activePids.find(p => p.pid === ancestorPid)
        if (proc) {
          checksToRun.push({ pm_id: proc.pm_id, domain })
        }
      }
    }

    // 4. Run HTTP checks for matched domains (use cached sites if available)
    const cachedMap = new Map(cachedSites.map(s => [s.domain, s]))
    const uncachedChecks = checksToRun.filter(c => !cachedMap.has(c.domain))

    // For uncached, do quick HTTP checks
    const freshChecks = await Promise.all(
      uncachedChecks.map(async (c) => {
        const httpResult = await checkHttp(c.domain)
        return { domain: c.domain, status: httpResult.status, ok: httpResult.status !== null && httpResult.status >= 200 && httpResult.status < 400 }
      })
    )
    const freshMap = new Map(freshChecks.map(c => [c.domain, c]))

    for (const { pm_id, domain } of checksToRun) {
      const cached = cachedMap.get(domain)
      const fresh = freshMap.get(domain)
      if (cached) {
        result.set(pm_id, { domain, httpStatus: cached.httpStatus, httpOk: cached.httpOk })
      } else if (fresh) {
        result.set(pm_id, { domain, httpStatus: fresh.status, httpOk: fresh.ok })
      }
    }
  } catch {
    // If mapping fails, return empty — PM2 status is still shown
  }

  return result
}

let cachedSites: SiteStatus[] = []
let lastCheck = 0

export async function checkAllSites(): Promise<SiteStatus[]> {
  // Cache for 60 seconds
  if (Date.now() - lastCheck < 60000 && cachedSites.length > 0) {
    return cachedSites
  }

  const domains = await getNginxDomains()

  const results = await Promise.all(
    domains.map(async (domain): Promise<SiteStatus> => {
      const [httpResult, sslResult] = await Promise.all([
        checkHttp(domain),
        checkSSL(domain),
      ])

      return {
        domain,
        httpStatus: httpResult.status,
        httpOk: httpResult.status !== null && httpResult.status >= 200 && httpResult.status < 400,
        responseTime: httpResult.time,
        ssl: sslResult,
        error: httpResult.error,
      }
    })
  )

  cachedSites = results.sort((a, b) => {
    // Problems first
    const aScore = (a.httpOk ? 0 : 2) + (a.ssl?.valid ? 0 : 1)
    const bScore = (b.httpOk ? 0 : 2) + (b.ssl?.valid ? 0 : 1)
    if (aScore !== bScore) return bScore - aScore
    return a.domain.localeCompare(b.domain)
  })
  lastCheck = Date.now()
  return cachedSites
}
