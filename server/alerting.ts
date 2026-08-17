import { getPM2Processes } from './pm2.js'
import { checkAllSites, getProcessHttpStatus, getSitesLastCheck } from './sites.js'
import { sendAlert, Alert } from './notifications.js'

const CHECK_INTERVAL = 30_000 // 30 seconds

const RESTART_THRESHOLD = 20

// A target must fail this many checks in a row before we alert.
// Protects against one-off network blips (~90s of real downtime to trigger).
const FAILURES_BEFORE_ALERT = 3

// If this share of all HTTP targets fails in the same cycle, the problem is
// almost certainly the monitoring host / network, not every site at once.
// Send one summary instead of a flood, and don't touch per-target state.
const GLOBAL_OUTAGE_RATIO = 0.5
const GLOBAL_OUTAGE_MIN_TARGETS = 4

// Hard cap on messages per cycle — anything above becomes one summary line.
const MAX_ALERTS_PER_CYCLE = 6

// Telegram throttles bursts to the same chat; space messages out.
const SEND_GAP_MS = 400

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Track previous state to detect transitions (avoid spamming)
interface ProcessState {
  status: string
  httpOk: boolean | undefined
  restartAlerted: boolean // already alerted for high restarts
  downStreak: number
  httpFailStreak: number
  downAlerted: boolean
  httpAlerted: boolean
}

interface SiteState {
  httpOk: boolean
  failStreak: number
  alerted: boolean
}

const processStates = new Map<string, ProcessState>()
const siteStates = new Map<string, SiteState>()

// Cooldown: don't re-alert the same issue within 10 minutes
const alertCooldowns = new Map<string, number>()
const COOLDOWN_MS = 10 * 60 * 1000

let globalOutageActive = false
let lastEvaluatedSiteCheck = 0

function canAlert(tag: string): boolean {
  const last = alertCooldowns.get(tag)
  if (last && Date.now() - last < COOLDOWN_MS) return false
  alertCooldowns.set(tag, Date.now())
  return true
}

function pruneCooldowns() {
  const cutoff = Date.now() - COOLDOWN_MS
  for (const [tag, at] of alertCooldowns) {
    if (at < cutoff) alertCooldowns.delete(tag)
  }
}

function emptyProcessState(status: string): ProcessState {
  return { status, httpOk: undefined, restartAlerted: false, downStreak: 0, httpFailStreak: 0, downAlerted: false, httpAlerted: false }
}

// Queue alerts for the whole cycle so we can cap / summarise before sending
async function flushAlerts(queue: Alert[]) {
  if (queue.length === 0) return

  const toSend = queue.slice(0, MAX_ALERTS_PER_CYCLE)
  const overflow = queue.length - toSend.length

  for (const alert of toSend) {
    await sendAlert(alert)
    await sleep(SEND_GAP_MS)
  }

  if (overflow > 0) {
    await sendAlert({
      level: 'warning',
      title: `+${overflow} more alerts suppressed`,
      message: `Too many events in one cycle. Open the dashboard for the full picture.`,
      tag: 'alert-overflow',
    })
  }
}

async function runChecks() {
  try {
    pruneCooldowns()

    const [processes, sites] = await Promise.all([
      getPM2Processes(),
      checkAllSites().catch(() => []),
    ])

    // Enrich processes with HTTP status
    try {
      const pids = processes
        .filter(p => p.status === 'online' && p.pid > 0)
        .map(p => ({ pm_id: p.pm_id, pid: p.pid }))
      const httpStatus = await getProcessHttpStatus(pids)
      for (const proc of processes) {
        const status = httpStatus.get(proc.pm_id)
        if (status) {
          proc.httpDomain = status.domain
          proc.httpStatus = status.httpStatus
          proc.httpOk = status.httpOk
        }
      }
    } catch { /* non-critical */ }

    // --- Global outage guard -------------------------------------------------
    // Count every HTTP target once (a process and a site can share a domain).
    const httpTargets = new Map<string, boolean>() // domain → ok
    for (const site of sites) httpTargets.set(site.domain, site.httpOk)
    for (const proc of processes) {
      if (proc.httpOk !== undefined && proc.httpDomain && !httpTargets.has(proc.httpDomain)) {
        httpTargets.set(proc.httpDomain, proc.httpOk)
      }
    }

    const totalTargets = httpTargets.size
    const failingTargets = [...httpTargets.values()].filter(ok => !ok).length
    const isGlobalOutage =
      totalTargets >= GLOBAL_OUTAGE_MIN_TARGETS &&
      failingTargets / totalTargets > GLOBAL_OUTAGE_RATIO

    if (isGlobalOutage) {
      // Everything "failing" at once means the monitor itself can't reach the
      // network. Don't record failures against individual targets and don't
      // spam — one message per cooldown window.
      globalOutageActive = true
      if (canAlert('global-outage')) {
        await sendAlert({
          level: 'critical',
          title: `Monitoring: ${failingTargets}/${totalTargets} targets unreachable`,
          message:
            `Almost everything failed in the same check — most likely a network or DNS problem on the monitoring host, not ${failingTargets} separate outages.\n` +
            `Per-site alerts are suppressed until this clears.`,
          tag: 'global-outage',
        })
      }
      return
    }

    if (globalOutageActive) {
      globalOutageActive = false
      alertCooldowns.delete('global-outage')
      await sendAlert({
        level: 'recovery',
        title: `Monitoring back to normal`,
        message: `${totalTargets - failingTargets}/${totalTargets} targets responding again.`,
        tag: 'global-outage-recovered',
      })
    }

    const queue: Alert[] = []

    // Domains already covered by a site alert — avoid duplicate process alerts
    const failingSiteDomains = new Set(sites.filter(s => !s.httpOk).map(s => s.domain))

    // --- Check Processes ---
    for (const proc of processes) {
      const key = proc.name
      const prev = processStates.get(key)
      const next = prev ? { ...prev } : emptyProcessState(proc.status)

      // Process went down
      if (proc.status !== 'online') {
        next.downStreak = (prev?.downStreak ?? 0) + 1
        if (next.downStreak >= FAILURES_BEFORE_ALERT && !next.downAlerted) {
          if (canAlert(`process-down:${key}`)) {
            next.downAlerted = true
            queue.push({
              level: 'critical',
              title: ` ${proc.name} is DOWN`,
              message: `Dan zhodil: ${proc.status}\nPID: ${proc.pid}`,
              tag: `process-down:${key}`,
            })
          }
        }
      } else {
        // Process recovered (only if we actually alerted about it)
        if (next.downAlerted) {
          if (canAlert(`process-up:${key}`)) {
            queue.push({
              level: 'recovery',
              title: ` ${proc.name} recovered`,
              message: `Konecne Dimi zvednul process`,
              tag: `process-up:${key}`,
            })
          }
        }
        next.downStreak = 0
        next.downAlerted = false
      }

      // HTTP check failed (process online but HTTP broken)
      if (proc.status === 'online' && proc.httpOk === false) {
        next.httpFailStreak = (prev?.httpFailStreak ?? 0) + 1
        const coveredBySiteAlert = !!proc.httpDomain && failingSiteDomains.has(proc.httpDomain)
        if (next.httpFailStreak >= FAILURES_BEFORE_ALERT && !next.httpAlerted && !coveredBySiteAlert) {
          if (canAlert(`http-down:${key}`)) {
            next.httpAlerted = true
            queue.push({
              level: 'critical',
              title: ` ${proc.name} HTTP failed`,
              message: `Dan posral HTTP u domain: ${proc.httpDomain || 'unknown'}\nHTTP status: ${proc.httpStatus || 'no response'}`,
              tag: `http-down:${key}`,
            })
          }
        }
      } else if (proc.httpOk === true) {
        // HTTP recovered (only if we actually alerted about it)
        if (next.httpAlerted) {
          if (canAlert(`http-up:${key}`)) {
            queue.push({
              level: 'recovery',
              title: `${proc.name} HTTP recovered`,
              message: `Konecne Dimi upravil domain: ${proc.httpDomain || 'unknown'}`,
              tag: `http-up:${key}`,
            })
          }
        }
        next.httpFailStreak = 0
        next.httpAlerted = false
      }

      // High restart count
      if (proc.restarts > RESTART_THRESHOLD) {
        if (!next.restartAlerted && canAlert(`restarts:${key}`)) {
          queue.push({
            level: 'warning',
            title: `${proc.name} high restarts`,
            message: `Dan furt restartuje: ${proc.restarts} (threshold: ${RESTART_THRESHOLD})`,
            tag: `restarts:${key}`,
          })
        }
      }

      // Update state
      next.status = proc.status
      next.httpOk = proc.httpOk
      next.restartAlerted = proc.restarts > RESTART_THRESHOLD
      processStates.set(key, next)
    }

    // Clean up removed processes
    for (const key of processStates.keys()) {
      if (!processes.find(p => p.name === key)) {
        processStates.delete(key)
      }
    }

    // --- Check Sites (domains not linked to PM2 processes) ---
    // checkAllSites() caches for 60s while we run every 30s — only evaluate a
    // given sweep once, otherwise one failure counts as two.
    const siteCheckTime = getSitesLastCheck()
    const sitesAreFresh = siteCheckTime !== lastEvaluatedSiteCheck
    lastEvaluatedSiteCheck = siteCheckTime

    for (const site of sitesAreFresh ? sites : []) {
      const key = site.domain
      const prev = siteStates.get(key)
      const next: SiteState = {
        httpOk: site.httpOk,
        failStreak: prev?.failStreak ?? 0,
        alerted: prev?.alerted ?? false,
      }

      if (!site.httpOk) {
        next.failStreak += 1
        if (next.failStreak >= FAILURES_BEFORE_ALERT && !next.alerted) {
          if (canAlert(`site-down:${key}`)) {
            next.alerted = true
            queue.push({
              level: 'critical',
              title: `Site ${site.domain} is DOWN`,
              message: `HTTP status: ${site.httpStatus || 'no response'}\nError: ${site.error || 'none'}`,
              tag: `site-down:${key}`,
            })
          }
        }
      } else {
        // Site recovered (only if we actually alerted about it)
        if (next.alerted && canAlert(`site-up:${key}`)) {
          queue.push({
            level: 'recovery',
            title: `Site ${site.domain} recovered`,
            message: `HTTP status: ${site.httpStatus}`,
            tag: `site-up:${key}`,
          })
        }
        next.failStreak = 0
        next.alerted = false
      }

      // SSL checks only make sense when the TLS handshake actually completed.
      // An unreachable host says nothing about its certificate.
      if (site.ssl?.reachable) {
        // SSL expiring soon (< 7 days)
        if (site.ssl.valid && site.ssl.daysLeft <= 7 && site.ssl.daysLeft > 0) {
          if (canAlert(`ssl-expiring:${key}`)) {
            queue.push({
              level: 'warning',
              title: `SSL expiring: ${site.domain}`,
              message: `Certificate expires in ${site.ssl.daysLeft} days`,
              tag: `ssl-expiring:${key}`,
            })
          }
        }

        // SSL expired / invalid
        if (!site.ssl.valid && canAlert(`ssl-invalid:${key}`)) {
          queue.push({
            level: 'critical',
            title: `SSL invalid: ${site.domain}`,
            message: `Error: ${site.ssl.error || 'Certificate invalid'}`,
            tag: `ssl-invalid:${key}`,
          })
        }
      }

      siteStates.set(key, next)
    }

    // Clean up removed sites
    for (const key of siteStates.keys()) {
      if (!sites.find(s => s.domain === key)) {
        siteStates.delete(key)
      }
    }

    await flushAlerts(queue)

  } catch (err) {
    console.error('Alerting check error:', err)
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null
let running = false

// Guard against overlapping runs — a slow cycle must not stack on the next one
async function runChecksSafe() {
  if (running) return
  running = true
  try {
    await runChecks()
  } finally {
    running = false
  }
}

export function startAlerting() {
  if (intervalId) return
  console.log(`Alerting started (check every ${CHECK_INTERVAL / 1000}s, ${FAILURES_BEFORE_ALERT} failures before alert)`)
  // First run after a short delay (let PM2 connect first)
  setTimeout(() => {
    runChecksSafe()
    intervalId = setInterval(runChecksSafe, CHECK_INTERVAL)
  }, 5000)
}

export function stopAlerting() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

// Get current alert states for the frontend
export function getAlertStates() {
  return {
    processes: Object.fromEntries(processStates),
    sites: Object.fromEntries(siteStates),
    cooldowns: alertCooldowns.size,
    globalOutage: globalOutageActive,
  }
}
