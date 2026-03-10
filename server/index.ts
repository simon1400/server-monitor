import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPM2Processes, getPM2Logs, restartProcess, stopProcess } from './pm2.js'
import { getSystemInfo, getSystemHistory, startSystemHistoryCollection } from './system.js'
import { checkAllSites, getStaticSites, getDiskUsage } from './sites.js'
import { deployProcess } from './deploy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4400

app.use(cors())
app.use(express.json())

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
}

// API routes
app.get('/api/monitor', async (_req, res) => {
  try {
    const [processes, system] = await Promise.all([
      getPM2Processes(),
      getSystemInfo(),
    ])
    res.json({ processes, system, timestamp: Date.now() })
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

app.post('/api/processes/:name/deploy', async (req, res) => {
  try {
    const result = await deployProcess(req.params.name)
    res.json(result)
  } catch {
    res.status(500).json({ success: false, error: 'Deploy failed unexpectedly' })
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


// Catch-all for SPA in production
if (process.env.NODE_ENV === 'production') {
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
  })
}

// Start history collection (every 30s)
startSystemHistoryCollection()

app.listen(PORT, () => {
  console.log(`Server Monitor API running on port ${PORT}`)
})
