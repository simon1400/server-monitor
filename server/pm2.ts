import pm2 from 'pm2'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import type { PM2Process, ProcessLog } from '../src/types/index.js'

function connectPM2(): Promise<void> {
  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function listPM2(): Promise<pm2.ProcessDescription[]> {
  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) reject(err)
      else resolve(list)
    })
  })
}

export async function getPM2Processes(): Promise<PM2Process[]> {
  await connectPM2()

  try {
    const list = await listPM2()

    return list.map((proc) => {
      const env = proc.pm2_env as any
      return {
        pm_id: proc.pm_id ?? 0,
        name: proc.name ?? 'unknown',
        pid: proc.pid ?? 0,
        status: (env?.status ?? 'stopped') as PM2Process['status'],
        cpu: (proc as any).monit?.cpu ?? 0,
        memory: (proc as any).monit?.memory ?? 0,
        uptime: env?.pm_uptime ? Date.now() - env.pm_uptime : 0,
        restarts: env?.restart_time ?? 0,
        version: env?.version ?? 'N/A',
        node_version: env?.node_version ?? 'N/A',
        exec_mode: env?.exec_mode ?? 'fork',
        watching: env?.watch ?? false,
        unstable_restarts: env?.unstable_restarts ?? 0,
        created_at: env?.created_at ?? 0,
        axm_monitor: env?.axm_monitor ?? {},
      }
    }).sort((a, b) => a.pm_id - b.pm_id)
  } finally {
    pm2.disconnect()
  }
}

export async function getPM2Logs(processId: number, lines: number = 50): Promise<ProcessLog[]> {
  await connectPM2()

  try {
    const list = await listPM2()
    const proc = list.find((p) => p.pm_id === processId)
    if (!proc) return []

    const env = proc.pm2_env as any
    const logs: ProcessLog[] = []

    // Read error logs
    const errLogPath = env?.pm_err_log_path
    if (errLogPath && fs.existsSync(errLogPath)) {
      const content = fs.readFileSync(errLogPath, 'utf-8')
      const errLines = content.split('\n').filter(Boolean).slice(-lines)
      errLines.forEach((line) => {
        logs.push({
          timestamp: new Date().toISOString(),
          type: 'err',
          message: line,
        })
      })
    }

    // Read output logs
    const outLogPath = env?.pm_out_log_path
    if (outLogPath && fs.existsSync(outLogPath)) {
      const content = fs.readFileSync(outLogPath, 'utf-8')
      const outLines = content.split('\n').filter(Boolean).slice(-lines)
      outLines.forEach((line) => {
        logs.push({
          timestamp: new Date().toISOString(),
          type: 'out',
          message: line,
        })
      })
    }

    return logs.slice(-lines * 2)
  } finally {
    pm2.disconnect()
  }
}

export async function restartProcess(processId: number): Promise<void> {
  await connectPM2()
  try {
    return new Promise((resolve, reject) => {
      pm2.restart(processId, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  } finally {
    pm2.disconnect()
  }
}

export async function stopProcess(processId: number): Promise<void> {
  await connectPM2()
  try {
    return new Promise((resolve, reject) => {
      pm2.stop(processId, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  } finally {
    pm2.disconnect()
  }
}

export async function deleteProcess(processId: number): Promise<void> {
  await connectPM2()
  try {
    return new Promise((resolve, reject) => {
      pm2.delete(processId, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  } finally {
    pm2.disconnect()
  }
}
