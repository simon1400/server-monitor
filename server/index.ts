import { readFileSync } from 'fs'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPM2Processes, getPM2Logs, restartProcess, stopProcess, resetProcessRestarts } from './pm2.js'
import { getSystemInfo, getSystemHistory, startSystemHistoryCollection } from './system.js'
import { checkAllSites, getStaticSites, getDiskUsage, getProcessHttpStatus } from './sites.js'
import { deployProcess } from './deploy.js'
import { getProcessEnv, saveProcessEnv } from './env.js'
import { authMiddleware, login, logout, checkAuth } from './auth.js'
import { initVapid, getVapidPublicKey, addPushSubscription, removePushSubscription, getNotificationStatus } from './notifications.js'
import { startAlerting, getAlertStates } from './alerting.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env file
try {
  const envPath = path.join(__dirname, '..', '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
} catch { /* .env not found, using process env */ }
const app = express()
const PORT = process.env.PORT || 4400

app.use(cors())
app.use(express.json())

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
}

// Auth routes (before middleware)
app.post('/api/login', login)
app.post('/api/logout', logout)
app.get('/api/auth/check', checkAuth)

// Auth middleware
app.use(authMiddleware)

// API routes
app.get('/api/monitor', async (_req, res) => {
  try {
    const [processes, system, sites] = await Promise.all([
      getPM2Processes(),
      getSystemInfo(),
      checkAllSites().catch(() => []),
    ])

    // Enrich processes with HTTP health check data
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
    } catch { /* HTTP check enrichment is non-critical */ }

    res.json({ processes, system, sites, timestamp: Date.now() })
  } catch (error) {
    console.error('Monitor error:', error)
    res.status(500).json({ error: 'Failed to fetch monitor data' })
  }
})

app.get('/api/processes', async (_req, res) => {
  try {
    const processes = await getPM2Processes()
    res.json(processes)
  } catch {
    res.status(500).json({ error: 'Failed to fetch processes' })
  }
})

app.get('/api/system', async (_req, res) => {
  try {
    const system = await getSystemInfo()
    res.json(system)
  } catch {
    res.status(500).json({ error: 'Failed to fetch system info' })
  }
})

app.get('/api/system/history', async (_req, res) => {
  try {
    const history = getSystemHistory()
    res.json(history)
  } catch {
    res.status(500).json({ error: 'Failed to fetch system history' })
  }
})

app.get('/api/processes/:id/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines as string) || 50
    const logs = await getPM2Logs(parseInt(req.params.id), lines)
    res.json(logs)
  } catch {
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})

app.post('/api/processes/:id/restart', async (req, res) => {
  try {
    await restartProcess(parseInt(req.params.id))
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to restart process' })
  }
})

app.post('/api/processes/:id/stop', async (req, res) => {
  try {
    await stopProcess(parseInt(req.params.id))
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to stop process' })
  }
})

app.post('/api/processes/:id/reset-restarts', async (req, res) => {
  try {
    await resetProcessRestarts(parseInt(req.params.id))
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to reset restart counter' })
  }
})

app.post('/api/processes/:name/deploy', async (req, res) => {
  // Deploy can take several minutes (git pull + npm install + build)
  req.setTimeout(600000)
  res.setTimeout(600000)
  try {
    const result = await deployProcess(req.params.name)
    res.json(result)
  } catch {
    res.status(500).json({ success: false, error: 'Deploy failed unexpectedly' })
  }
})

app.get('/api/processes/:name/env', async (req, res) => {
  try {
    const result = await getProcessEnv(req.params.name)
    if (!result) {
      res.status(404).json({ error: 'Process not found' })
      return
    }
    res.json(result)
  } catch {
    res.status(500).json({ error: 'Failed to read env' })
  }
})

app.put('/api/processes/:name/env', async (req, res) => {
  try {
    const { entries } = req.body
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'Invalid entries' })
      return
    }
    const result = await saveProcessEnv(req.params.name, entries)
    res.json(result)
  } catch {
    res.status(500).json({ error: 'Failed to save env' })
  }
})

app.get('/api/sites', async (_req, res) => {
  try {
    const sites = await checkAllSites()
    res.json(sites)
  } catch {
    res.status(500).json({ error: 'Failed to check sites' })
  }
})

app.get('/api/static-sites', async (_req, res) => {
  try {
    const sites = await getStaticSites()
    res.json(sites)
  } catch {
    res.status(500).json({ error: 'Failed to fetch static sites' })
  }
})

app.get('/api/disk-usage', async (_req, res) => {
  try {
    const usage = await getDiskUsage()
    res.json(usage)
  } catch {
    res.status(500).json({ error: 'Failed to fetch disk usage' })
  }
})


// --- Notification endpoints ---

// Get VAPID public key (needed by frontend to subscribe)
app.get('/api/notifications/vapid-key', (_req, res) => {
  const key = getVapidPublicKey()
  res.json({ key })
})

// Get notification status
app.get('/api/notifications/status', (_req, res) => {
  const status = getNotificationStatus()
  const alerts = getAlertStates()
  res.json({ ...status, alerts })
})

// Subscribe to web push
app.post('/api/notifications/subscribe', (req, res) => {
  const { subscription } = req.body
  if (!subscription?.endpoint || !subscription?.keys) {
    res.status(400).json({ error: 'Invalid subscription' })
    return
  }
  addPushSubscription(subscription)
  res.json({ success: true })
})

// Unsubscribe from web push
app.post('/api/notifications/unsubscribe', (req, res) => {
  const { endpoint } = req.body
  if (!endpoint) {
    res.status(400).json({ error: 'Missing endpoint' })
    return
  }
  removePushSubscription(endpoint)
  res.json({ success: true })
})

// Test notification (sends a test alert)
app.post('/api/notifications/test', async (_req, res) => {
  const { sendAlert } = await import('./notifications.js')
  await sendAlert({
    level: 'warning',
    title: 'Test Notification',
    message: 'If you see this, notifications are working!',
    tag: 'test',
  })
  res.json({ success: true })
})

// Catch-all for SPA in production
if (process.env.NODE_ENV === 'production') {
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
  })
}

// Start history collection (every 30s)
startSystemHistoryCollection()

// Init notifications & alerting
initVapid()
startAlerting()

app.listen(PORT, () => {
  console.log(`Server Monitor API running on port ${PORT}`)
})
