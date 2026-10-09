// Shared between server/billing.ts and the frontend.

export interface BillingProject {
  id: string
  name: string
  client?: string
  email?: string
  currency: string
  hourlyRate?: number
  linkedProcesses: string[]
  linkedSites: string[]
  note?: string
  archived: boolean
  createdAt: string
}

export interface WorkEntry {
  id: string
  projectId: string
  date: string            // YYYY-MM-DD
  description: string
  amount: number
  hours?: number
  invoiceId?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export type InvoiceStatus = 'issued' | 'paid'

export interface Invoice {
  id: string
  projectId: string
  number?: string
  issuedAt: string        // YYYY-MM-DD
  entryIds: string[]
  total: number
  currency: string
  status: InvoiceStatus
  paidAt?: string         // YYYY-MM-DD
  note?: string
  createdAt: string
}

export interface BillingDB {
  version: 1
  projects: BillingProject[]
  entries: WorkEntry[]
  invoices: Invoice[]
  meta: { lastDigestSentAt?: string }
}

// Derived, never stored: no invoice → unbilled, issued → invoiced, paid → paid
export type EntryStatus = 'unbilled' | 'invoiced' | 'paid'

export type WorkEntryView = WorkEntry & { status: EntryStatus }

export type ProjectSummary = BillingProject & {
  unbilledTotal: number
  unbilledCount: number
  oldestUnbilledDate?: string
  invoicedTotal: number   // issued, not yet paid
  lastEntryDate?: string
}

export interface BillingSummary {
  totals: Record<string, { unbilled: number; invoiced: number }>
  projects: ProjectSummary[]
}

export interface ProjectsMeta {
  processes: string[]
  sites: string[]
}
