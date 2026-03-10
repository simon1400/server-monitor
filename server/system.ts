import si from 'systeminformation'
import os from 'os'
import type { SystemInfo } from '../src/types/index.js'

interface HistoryPoint {
  timestamp: number
  cpuLoad: number
  memoryUsed: number
  memoryTotal: number
  networkRx: number
  networkTx: number
}

const history: HistoryPoint[] = []
const MAX_HISTORY = 120 // 1 hour at 30s intervals

export async function getSystemInfo(): Promise<SystemInfo> {
  const [cpu, cpuLoad, mem, disk, osInfo, networkStats] = await Promise.all([
    si.cpu(),
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.osInfo(),
    si.networkStats(),
  ])

  const rootDisk = disk.find((d) => d.mount === '/') || disk[0]
  const netStats = networkStats[0] || { rx_sec: 0, tx_sec: 0 }

  return {
    hostname: os.hostname(),
    platform: osInfo.platform,
    distro: osInfo.distro,
    kernel: osInfo.kernel,
    uptime: os.uptime(),
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.cores,
      speed: cpu.speed,
      currentLoad: cpuLoad.currentLoad,
      loadPerCore: cpuLoad.cpus.map((c) => c.load),
    },
    memory: {
      total: mem.total,
      used: mem.used,
      free: mem.free,
      available: mem.available,
      swapTotal: mem.swaptotal,
      swapUsed: mem.swapused,
    },
    disk: {
      total: rootDisk?.size ?? 0,
      used: rootDisk?.used ?? 0,
      available: (rootDisk?.size ?? 0) - (rootDisk?.used ?? 0),
      use: rootDisk?.use ?? 0,
      mount: rootDisk?.mount ?? '/',
    },
    network: {
      rx_sec: netStats.rx_sec ?? 0,
      tx_sec: netStats.tx_sec ?? 0,
    },
  }
}

export function getSystemHistory() {
  return history
}

export function startSystemHistoryCollection() {
  // Collect immediately
  collectHistoryPoint()
  // Then every 30 seconds
  setInterval(collectHistoryPoint, 30000)
}

async function collectHistoryPoint() {
  try {
    const [cpuLoad, mem, networkStats] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.networkStats(),
    ])

    const netStats = networkStats[0] || { rx_sec: 0, tx_sec: 0 }

    history.push({
      timestamp: Date.now(),
      cpuLoad: cpuLoad.currentLoad,
      memoryUsed: mem.used,
      memoryTotal: mem.total,
      networkRx: netStats.rx_sec ?? 0,
      networkTx: netStats.tx_sec ?? 0,
    })

    if (history.length > MAX_HISTORY) {
      history.shift()
    }
  } catch (error) {
    console.error('Failed to collect history point:', error)
  }
}
