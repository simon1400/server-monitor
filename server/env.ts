import fs from 'fs'
import path from 'path'
import pm2 from 'pm2'

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

async function getProcessCwd(processName: string): Promise<string | null> {
  await connectPM2()
  try {
    const list = await listPM2()
    const proc = list.find((p) => p.name === processName)
    if (!proc) return null
    const env = proc.pm2_env as any
    return env?.pm_cwd || env?.PWD || null
  } finally {
    pm2.disconnect()
  }
}

export interface EnvEntry {
  key: string
  value: string
}

function parseEnvFile(content: string): { entries: EnvEntry[]; comments: string[] } {
  const entries: EnvEntry[] = []
  const comments: string[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) {
      comments.push(trimmed)
      continue
    }
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    entries.push({ key, value })
  }

  return { entries, comments }
}

function serializeEnvFile(entries: EnvEntry[], comments: string[]): string {
  const lines: string[] = []
  if (comments.length > 0) {
    lines.push(...comments, '')
  }
  for (const { key, value } of entries) {
    lines.push(`${key}=${value}`)
  }
  lines.push('') // trailing newline
  return lines.join('\n')
}

export async function getProcessEnv(processName: string): Promise<{ entries: EnvEntry[]; cwd: string } | null> {
  const cwd = await getProcessCwd(processName)
  if (!cwd) return null

  const envPath = path.join(cwd, '.env')
  if (!fs.existsSync(envPath)) {
    return { entries: [], cwd }
  }

  const content = fs.readFileSync(envPath, 'utf-8')
  const { entries } = parseEnvFile(content)
  return { entries, cwd }
}

export async function saveProcessEnv(processName: string, entries: EnvEntry[]): Promise<{ success: boolean; error?: string }> {
  const cwd = await getProcessCwd(processName)
  if (!cwd) return { success: false, error: 'Process not found or has no working directory' }

  const envPath = path.join(cwd, '.env')

  // Preserve comments from existing file
  let comments: string[] = []
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf-8')
    comments = parseEnvFile(existing).comments

    // Create backup
    const backupPath = envPath + '.bak'
    fs.copyFileSync(envPath, backupPath)
  }

  const content = serializeEnvFile(entries, comments)
  fs.writeFileSync(envPath, content, 'utf-8')

  // Restart PM2 process to pick up new env
  try {
    await connectPM2()
    await new Promise<void>((resolve, reject) => {
      pm2.restart(processName, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    pm2.disconnect()
  } catch (err: any) {
    pm2.disconnect()
    return { success: false, error: `Env saved but PM2 restart failed: ${err.message}` }
  }

  return { success: true }
}
