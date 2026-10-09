import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import type {
  BillingProject, BillingSummary, Invoice, ProjectsMeta, WorkEntryView, EntryStatus,
} from '../types/billing'

const API = '/api/billing'

// ── Lock state (second password) ──────────────────────────────────────────
// Shared across the page: any billing request answered with 401 flips the
// whole module back to the lock screen.

export type LockState = 'checking' | 'locked' | 'unlocked' | 'error'

let lockState: LockState = 'checking'
let lockError: string | null = null
const listeners = new Set<() => void>()

function setLock(state: LockState, error: string | null = null) {
  if (state === lockState && error === lockError) return
  lockState = state
  lockError = error
  listeners.forEach(l => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

async function billingFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, init)
  if (res.status === 401) setLock('locked')
  return res
}

export async function checkBilling(): Promise<void> {
  try {
    const res = await fetch(`${API}/check`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setLock('error', json.error || `HTTP ${res.status}`); return }
    setLock(json.unlocked ? 'unlocked' : 'locked')
  } catch {
    setLock('error', 'Connection error')
  }
}

export async function unlockBilling(password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) { setLock('unlocked'); return { success: true } }
    if (res.status === 500) setLock('error', json.error || 'Server error')
    return { success: false, error: json.error === 'Unauthorized' ? 'Session expired — reload the page' : json.error || `HTTP ${res.status}` }
  } catch {
    return { success: false, error: 'Connection error' }
  }
}

export async function lockBilling(): Promise<void> {
  try { await fetch(`${API}/lock`, { method: 'POST' }) } catch { /* lock locally anyway */ }
  setLock('locked')
}

export function useBillingLock() {
  const state = useSyncExternalStore(subscribe, () => lockState)
  const error = useSyncExternalStore(subscribe, () => lockError)
  useEffect(() => { checkBilling() }, [])
  return { state, error }
}

// ── Request helpers ───────────────────────────────────────────────────────
async function getJson<T>(path: string): Promise<T> {
  const res = await billingFetch(path)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json as T
}

type Result<T = object> = { success: boolean; error?: string } & Partial<T>

async function send<T = object>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await billingFetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (res.status === 401) return { success: false, error: 'Billing is locked' } as Result<T>
    if (!res.ok || json.success === false) return { success: false, error: json.error || `HTTP ${res.status}` } as Result<T>
    return { ...json, success: true }
  } catch {
    return { success: false, error: 'Network error' } as Result<T>
  }
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

// ── Summary (polling) ─────────────────────────────────────────────────────
export function useBillingSummary(interval = 15000, enabled = true) {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      // Archived projects are included; views filter them out where needed
      setSummary(await getJson<BillingSummary>('/summary?archived=1'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [refresh, interval, enabled])

  return { summary, loading, error, refresh }
}

// ── Projects ──────────────────────────────────────────────────────────────
export type ProjectInput = {
  name?: string
  client?: string | null
  email?: string | null
  currency?: string
  hourlyRate?: number | null
  linkedProcesses?: string[]
  linkedSites?: string[]
  note?: string | null
  archived?: boolean
}

export function getProjectsMeta(): Promise<ProjectsMeta> {
  return getJson<ProjectsMeta>('/projects/meta')
}

export function createProject(input: ProjectInput) {
  return send<{ project: BillingProject }>('POST', '/projects', input)
}

export function updateProject(id: string, input: ProjectInput) {
  return send<{ project: BillingProject }>('PATCH', `/projects/${id}`, input)
}

export function archiveProject(id: string) {
  return send<{ project: BillingProject }>('DELETE', `/projects/${id}`)
}

// ── Entries ───────────────────────────────────────────────────────────────
export interface EntryFilters {
  projectId?: string
  status?: EntryStatus | ''
  from?: string
  to?: string
  q?: string
}

export function listEntries(f: EntryFilters): Promise<WorkEntryView[]> {
  return getJson<WorkEntryView[]>(`/entries${query({ projectId: f.projectId, status: f.status || undefined, from: f.from, to: f.to, q: f.q })}`)
}

export type EntryInput = { projectId?: string; date?: string; description?: string; amount?: number; hours?: number | null }

export function createEntry(input: EntryInput) {
  return send<{ entry: WorkEntryView }>('POST', '/entries', input)
}

export function updateEntry(id: string, input: EntryInput) {
  return send<{ entry: WorkEntryView }>('PATCH', `/entries/${id}`, input)
}

export function deleteEntry(id: string) {
  return send('DELETE', `/entries/${id}`)
}

// ── Invoices ──────────────────────────────────────────────────────────────
export function listInvoices(projectId: string): Promise<Invoice[]> {
  return getJson<Invoice[]>(`/invoices${query({ projectId })}`)
}

export function createInvoice(input: { projectId: string; entryIds: string[]; number?: string; issuedAt?: string; note?: string }) {
  return send<{ invoice: Invoice }>('POST', '/invoices', input)
}

export function updateInvoice(id: string, input: { number?: string | null; issuedAt?: string; note?: string | null; status?: 'issued' | 'paid'; paidAt?: string }) {
  return send<{ invoice: Invoice }>('PATCH', `/invoices/${id}`, input)
}

export function deleteInvoice(id: string) {
  return send<{ released: number }>('DELETE', `/invoices/${id}`)
}

export async function getInvoiceText(id: string): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const res = await billingFetch(`/invoices/${id}/text`)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { success: false, error: json.error || `HTTP ${res.status}` }
    }
    return { success: true, text: await res.text() }
  } catch {
    return { success: false, error: 'Network error' }
  }
}
