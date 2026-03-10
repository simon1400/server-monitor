import { exec } from 'child_process'
import pm2 from 'pm2'

interface DeployResult {
  success: boolean
  steps: { name: string; success: boolean; output: string }[]
  error?: string
}

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

function execCmd(cmd: string, cwd: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, output: (stderr || stdout || err.message).slice(-2000) })
      } else {
        resolve({ success: true, output: (stdout || stderr).slice(-2000) })
      }
    })
  })
}

// Resolve the working directory for a PM2 process
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

// Detect if project uses npm or yarn
function detectPackageManager(cwd: string): string {
  return 'npm'
}

export async function deployProcess(processName: string): Promise<DeployResult> {
  const steps: DeployResult['steps'] = []

  // 1. Find process working directory
  const cwd = await getProcessCwd(processName)
  if (!cwd) {
    return { success: false, steps, error: `Process "${processName}" not found or has no working directory` }
  }

  // 2. Git pull
  const gitPull = await execCmd('git pull origin main 2>&1 || git pull origin master 2>&1', cwd)
  steps.push({ name: 'git pull', ...gitPull })
  if (!gitPull.success && !gitPull.output.includes('Already up to date')) {
    return { success: false, steps, error: 'Git pull failed' }
  }

  // 3. Install dependencies
  const install = await execCmd('npm install 2>&1', cwd)
  steps.push({ name: 'npm install', ...install })
  if (!install.success) {
    return { success: false, steps, error: 'npm install failed' }
  }

  // 4. Build
  const build = await execCmd('npm run build 2>&1', cwd)
  steps.push({ name: 'npm run build', ...build })
  if (!build.success) {
    return { success: false, steps, error: 'Build failed' }
  }

  // 5. Restart PM2 process
  try {
    await connectPM2()
    await new Promise<void>((resolve, reject) => {
      pm2.restart(processName, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    pm2.disconnect()
    steps.push({ name: 'pm2 restart', success: true, output: `Process "${processName}" restarted` })
  } catch (err: any) {
    pm2.disconnect()
    steps.push({ name: 'pm2 restart', success: false, output: err.message })
    return { success: false, steps, error: 'PM2 restart failed' }
  }

  return { success: true, steps }
}
