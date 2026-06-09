import { readFileSync } from 'fs'
import os from 'os'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPM2Processes, getPM2Logs, restartProcess, stopProcess, resetProcessRestarts } from './pm2.js'
import { getSystemInfo, getSystemHistory, startSystemHistoryCollection } from './system.js'
import { checkAllSites, getStaticSites, getDiskUsage, getProcessHttpStatus } from './sites.js'
import { deployProcess } from './deploy.js'
import { getProcessEnv, saveProcessEnv } from './env.js'
import { authMiddleware, login, logout, checkAuth } from './auth.js'
import {
  listManagedSites, createSite, updateSiteAdmin, uploadZip, setupDomain, deleteSite,
  listTree, readTextFile, writeTextFile, makeDir, renameEntry, deleteEntry,
  saveUploadedFiles, getDownload,
} from './hosting.js'
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

// Multipart upload (zip & individual files) → temp dir, generous size cap
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 350 * 1024 * 1024 } })

app.use(cors())
app.use(express.json({ limit: '5mb' }))

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


// --- Hosting (self-service static sites) ---

app.get('/api/hosting/sites', async (_req, res) => {
  try {
    res.json(await listManagedSites())
  } catch {
    res.status(500).json({ error: 'Failed to list sites' })
  }
})

app.post('/api/hosting/sites', async (req, res) => {
  try {
    const { name, domain, hostingCost, hostingCurrency, nextPaymentDate } = req.body
    const result = await createSite(name, domain, { hostingCost, hostingCurrency, nextPaymentDate })
    if (!result.success) { res.status(400).json(result); return }
    res.json(result)
  } catch {
    res.status(500).json({ success: false, error: 'Failed to create site' })
  }
})

app.patch('/api/hosting/sites/:slug/admin', async (req, res) => {
  try {
    const result = await updateSiteAdmin(String(req.params.slug), req.body || {})
    if (!result.success) { res.status(400).json(result); return }
    res.json(result)
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update admin info' })
  }
})

app.post('/api/hosting/sites/:slug/upload', upload.single('file'), async (req, res) => {
  req.setTimeout(600000)
  res.setTimeout(600000)
  if (!req.file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return }
  try {
    const mode = req.query.mode === 'merge' ? 'merge' : 'replace'
    const result = await uploadZip(String(req.params.slug), req.file.path, mode)
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ success: false, steps: [], error: e?.message || 'Upload failed' })
  } finally {
    if (req.file) await import('fs').then(fs => fs.promises.unlink(req.file!.path).catch(() => {}))
  }
})

app.post('/api/hosting/sites/:slug/domain', async (req, res) => {
  req.setTimeout(600000)
  res.setTimeout(600000)
  try {
    const { domain, www, redirectWww } = req.body
    const result = await setupDomain(String(req.params.slug), domain, www !== false, redirectWww === true)
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ success: false, steps: [], error: e?.message || 'Domain setup failed' })
  }
})

app.delete('/api/hosting/sites/:slug', async (req, res) => {
  try {
    const result = await deleteSite(req.params.slug, req.query.removeCert === 'true')
    if (!result.success) { res.status(400).json(result); return }
    res.json(result)
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete site' })
  }
})

// File manager
app.get('/api/hosting/sites/:slug/files', async (req, res) => {
  try {
    res.json(await listTree(req.params.slug, String(req.query.path || '')))
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to list files' })
  }
})

app.get('/api/hosting/sites/:slug/file', async (req, res) => {
  try {
    const p = String(req.query.path || '')
    if (req.query.download === '1') {
      const { stream, name, size } = await getDownload(req.params.slug, p)
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`)
      res.setHeader('Content-Length', String(size))
      stream.pipe(res)
      return
    }
    res.json(await readTextFile(req.params.slug, p))
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to read file' })
  }
})

app.put('/api/hosting/sites/:slug/file', async (req, res) => {
  try {
    const { path: p, content } = req.body
    if (typeof p !== 'string' || typeof content !== 'string') { res.status(400).json({ error: 'Invalid request' }); return }
    await writeTextFile(req.params.slug, p, content)
    res.json({ success: true })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to save file' })
  }
})

app.post('/api/hosting/sites/:slug/files/upload', upload.array('files'), async (req, res) => {
  req.setTimeout(600000)
  res.setTimeout(600000)
  try {
    const files = (req.files as Express.Multer.File[] | undefined) || []
    if (files.length === 0) { res.status(400).json({ success: false, error: 'No files uploaded' }); return }
    const count = await saveUploadedFiles(String(req.params.slug), String(req.query.path || ''), files)
    res.json({ success: true, count })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'Upload failed' })
  }
})

app.post('/api/hosting/sites/:slug/files/mkdir', async (req, res) => {
  try {
    await makeDir(req.params.slug, String(req.body.path || ''))
    res.json({ success: true })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to create folder' })
  }
})

app.post('/api/hosting/sites/:slug/files/rename', async (req, res) => {
  try {
    const { from, to } = req.body
    if (typeof from !== 'string' || typeof to !== 'string') { res.status(400).json({ error: 'Invalid request' }); return }
    await renameEntry(req.params.slug, from, to)
    res.json({ success: true })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to rename' })
  }
})

app.delete('/api/hosting/sites/:slug/files', async (req, res) => {
  try {
    await deleteEntry(req.params.slug, String(req.query.path || ''))
    res.json({ success: true })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to delete' })
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
