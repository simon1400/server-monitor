import { exec } from 'child_process'
import { getProcessCwd, restartProcessByName } from './pm2.js'

interface DeployResult {
  success: boolean
  steps: { name: string; success: boolean; output: string }[]
  error?: string
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

  // 4. Build (Strapi needs extra heap for webpack)
  const isStrapi = processName.includes('strapi')
  const buildCmd = isStrapi
    ? 'NODE_OPTIONS="--max-old-space-size=4096" npm run build 2>&1'
    : 'npm run build 2>&1'
  const build = await execCmd(buildCmd, cwd)
  steps.push({ name: 'npm run build', ...build })
  if (!build.success) {
    return { success: false, steps, error: 'Build failed' }
  }

  // 5. Restart PM2 process
  try {
    await restartProcessByName(processName)
    steps.push({ name: 'pm2 restart', success: true, output: `Process "${processName}" restarted` })
  } catch (err: any) {
    steps.push({ name: 'pm2 restart', success: false, output: err.message })
    return { success: false, steps, error: 'PM2 restart failed' }
  }

  return { success: true, steps }
}
