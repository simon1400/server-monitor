export interface HistoryEntry {
  at: string
  field: string
  from: string | null
  to: string | null
}

export interface ManagedSite {
  slug: string
  name: string
  domain: string
  www: boolean
  redirectWww?: boolean
  ssl: boolean
  createdAt: string
  hostingCost?: number
  hostingCurrency?: string
  nextPaymentDate?: string
  history?: HistoryEntry[]
  exists: boolean
  diskUsage: string
  fileCount: number
  hasNginx: boolean
  http: { status: number | null; ok: boolean } | null
  sslInfo: { valid: boolean; daysLeft: number; notAfter: string } | null
}

export interface StepResult {
  steps: { name: string; success: boolean; output: string }[]
  success: boolean
  error?: string
}

export interface FileEntry {
  name: string
  type: 'dir' | 'file'
  size: number
  mtime: number
}
