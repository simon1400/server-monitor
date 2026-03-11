export interface PM2Process {
  pm_id: number
  name: string
  pid: number
  status: 'online' | 'stopping' | 'stopped' | 'errored' | 'launching'
  cpu: number
  memory: number
  uptime: number
  restarts: number
  version: string
  node_version: string
  exec_mode: string
  watching: boolean
  unstable_restarts: number
  created_at: number
  axm_monitor: Record<string, { value: string | number; unit?: string }>
  httpDomain?: string
  httpStatus?: number | null
  httpOk?: boolean
}

export interface SystemInfo {
  hostname: string
  platform: string
  distro: string
  kernel: string
  uptime: number
  cpu: {
    manufacturer: string
    brand: string
    cores: number
    speed: number
    currentLoad: number
    loadPerCore: number[]
  }
  memory: {
    total: number
    used: number
    free: number
    available: number
    swapTotal: number
    swapUsed: number
  }
  disk: {
    total: number
    used: number
    available: number
    use: number
    mount: string
  }
  network: {
    rx_sec: number
    tx_sec: number
  }
}

export interface ProcessLog {
  timestamp: string
  type: 'out' | 'err'
  message: string
}

export interface HistoryPoint {
  timestamp: number
  cpu: number
  memory: number
}

export interface SiteSSL {
  valid: boolean
  issuer: string
  notBefore: string
  notAfter: string
  daysLeft: number
  error: string | null
}

export interface SiteStatus {
  domain: string
  httpStatus: number | null
  httpOk: boolean
  responseTime: number
  ssl: SiteSSL | null
  error: string | null
}

export interface MonitorData {
  processes: PM2Process[]
  system: SystemInfo
  sites: SiteStatus[]
  timestamp: number
}

export type SortField = 'name' | 'cpu' | 'memory' | 'uptime' | 'restarts' | 'status'
export type SortDirection = 'asc' | 'desc'
