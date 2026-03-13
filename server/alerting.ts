import { getPM2Processes } from './pm2.js'
import { checkAllSites, getProcessHttpStatus } from './sites.js'
import { sendAlert, type AlertLevel } from './notifications.js'

const CHECK_INTERVAL = 30_000 // 30 seconds
const RESTART_THRESHOLD = 20

// Track previous state to detect transitions (avoid spamming)
interface ProcessState {
  status: string
  httpOk: boolean | undefined
  restartAlerted: boolean // already alerted for high restarts
}

interface SiteState {
  httpOk: boolean
}

const processStates = new Map<string, ProcessState>()
const siteStates = new Map<string, SiteState>()

// Cooldown: don't re-alert the same issue within 10 minutes
const alertCooldowns = new Map<string, number>()
const COOLDOWN_MS = 10 * 60 * 1000

function canAlert(tag: string): boolean {
  const last = alertCooldowns.get(tag)
  if (last && Date.now() - last < COOLDOWN_MS) return false
  alertCooldowns.set(tag, Date.now())
  return true
}

async function runChecks() {
  try {
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

    // --- Check Processes ---
    for (const proc of processes) {
      const key = proc.name
      const prev = processStates.get(key)

      // Process went down
      if (proc.status !== 'online') {
        if (!prev || prev.status === 'online') {
          if (canAlert(`process-down:${key}`)) {
            await sendAlert({
              level: 'critical',
              title: `${proc.name} is DOWN`,
              message: `Status: ${proc.status}\nPID: ${proc.pid}`,
              tag: `process-down:${key}`,
            })
          }
        }
      }

      // Process recovered
      if (proc.status === 'online' && prev && prev.status !== 'online') {
        if (canAlert(`process-up:${key}`)) {
          await sendAlert({
            level: 'recovery',
            title: `${proc.name} recovered`,
            message: `Process is back online`,
            tag: `process-up:${key}`,
          })
        }
      }

      // HTTP check failed (process online but HTTP broken)
      if (proc.status === 'online' && proc.httpOk === false) {
        if (!prev || prev.httpOk !== false) {
          if (canAlert(`http-down:${key}`)) {
            await sendAlert({
              level: 'critical',
              title: `${proc.name} HTTP failed`,
              message: `Domain: ${proc.httpDomain || 'unknown'}\nHTTP status: ${proc.httpStatus || 'no response'}`,
              tag: `http-down:${key}`,
            })
          }
        }
      }

      // HTTP recovered
      if (proc.httpOk === true && prev && prev.httpOk === false) {
        if (canAlert(`http-up:${key}`)) {
          await sendAlert({
            level: 'recovery',
            title: `${proc.name} HTTP recovered`,
            message: `Domain: ${proc.httpDomain || 'unknown'}`,
            tag: `http-up:${key}`,
          })
        }
      }

      // High restart count
      if (proc.restarts > RESTART_THRESHOLD) {
        const wasAlerted = prev?.restartAlerted ?? false
        if (!wasAlerted) {
          if (canAlert(`restarts:${key}`)) {
            await sendAlert({
              level: 'warning',
              title: `${proc.name} high restarts`,
              message: `Restart count: ${proc.restarts} (threshold: ${RESTART_THRESHOLD})`,
              tag: `restarts:${key}`,
            })
          }
        }
      }

      // Update state
      processStates.set(key, {
        status: proc.status,
        httpOk: proc.httpOk,
        restartAlerted: proc.restarts > RESTART_THRESHOLD,
      })
    }

    // Clean up removed processes
    for (const key of processStates.keys()) {
      if (!processes.find(p => p.name === key)) {
        processStates.delete(key)
      }
    }

    // --- Check Sites (domains not linked to PM2 processes) ---
    for (const site of sites) {
      const key = site.domain
      const prev = siteStates.get(key)

      if (!site.httpOk) {
        if (!prev || prev.httpOk) {
          if (canAlert(`site-down:${key}`)) {
            await sendAlert({
              level: 'critical',
              title: `Site ${site.domain} is DOWN`,
              message: `HTTP status: ${site.httpStatus || 'no response'}\nError: ${site.error || 'none'}`,
              tag: `site-down:${key}`,
            })
          }
        }
      }

      // Site recovered
      if (site.httpOk && prev && !prev.httpOk) {
        if (canAlert(`site-up:${key}`)) {
          await sendAlert({
            level: 'recovery',
            title: `Site ${site.domain} recovered`,
            message: `HTTP status: ${site.httpStatus}`,
            tag: `site-up:${key}`,
          })
        }
      }

      // SSL expiring soon (< 7 days)
      if (site.ssl && site.ssl.valid && site.ssl.daysLeft <= 7 && site.ssl.daysLeft > 0) {
        if (canAlert(`ssl-expiring:${key}`)) {
          await sendAlert({
            level: 'warning',
            title: `SSL expiring: ${site.domain}`,
            message: `Certificate expires in ${site.ssl.daysLeft} days`,
            tag: `ssl-expiring:${key}`,
          })
        }
      }

      // SSL expired / invalid
      if (site.ssl && !site.ssl.valid) {
        if (!prev || (prev.httpOk)) { // only alert on transition
          if (canAlert(`ssl-invalid:${key}`)) {
            await sendAlert({
              level: 'critical',
              title: `SSL invalid: ${site.domain}`,
              message: `Error: ${site.ssl.error || 'Certificate invalid'}`,
              tag: `ssl-invalid:${key}`,
            })
          }
        }
      }

      siteStates.set(key, { httpOk: site.httpOk })
    }

  } catch (err) {
    console.error('Alerting check error:', err)
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function startAlerting() {
  if (intervalId) return
  console.log(`Alerting started (check every ${CHECK_INTERVAL / 1000}s)`)
  // First run after a short delay (let PM2 connect first)
  setTimeout(() => {
    runChecks()
    intervalId = setInterval(runChecks, CHECK_INTERVAL)
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
  }
}
