import crypto from 'crypto'
import { promises as fs, readFileSync, mkdirSync, chmodSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { format } from 'date-fns'
import type {
  BillingDB, BillingProject, WorkEntry, WorkEntryView, Invoice, EntryStatus,
  BillingSummary, ProjectSummary,
} from '../src/types/billing.js'

// ── Storage ───────────────────────────────────────────────────────────────
// One JSON document in <repo>/data/billing.json (gitignored, mode 600).
// Loaded once at startup; every mutation rewrites the whole file atomically
// (tmp + rename), serialized through a promise queue. A corrupt file is never
// overwritten — billing routes answer 500 until it is fixed by hand.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const DB_FILE = path.join(DATA_DIR, 'billing.json')
const KEEP_BACKUPS = 60

let db: BillingDB = emptyDB()
let loadError: string | null = null
let lastBackupDay: string | null = null
let writeQueue: Promise<unknown> = Promise.resolve()

function emptyDB(): BillingDB {
  return { version: 1, projects: [], entries: [], invoices: [], meta: {} }
}

export class BillingError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function initBilling(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  } catch (e) {
    console.error('[billing] Cannot create data dir:', e)
  }

  let raw: string
  try {
    raw = readFileSync(DB_FILE, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') { db = emptyDB(); return }
    loadError = `Cannot read ${DB_FILE}: ${e instanceof Error ? e.message : e}`
    console.error(`\n[billing] !!! ${loadError}\n`)
    return
  }

  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.entries) || !Array.isArray(parsed.invoices)) {
      throw new Error('unexpected structure (expected version 1 with projects/entries/invoices arrays)')
    }
    db = { ...parsed, meta: parsed.meta || {} }
    try { chmodSync(DB_FILE, 0o600) } catch { /* best effort */ }
  } catch (e) {
    loadError = `${DB_FILE} is corrupt (${e instanceof Error ? e.message : e}). The file was left untouched — fix it or restore from data/backups/ and restart the server.`
    console.error('\n' + '!'.repeat(80))
    console.error(`[billing] ${loadError}`)
    console.error('!'.repeat(80) + '\n')
  }
}

function ensureLoaded(): void {
  if (loadError) throw new BillingError(500, loadError)
}

async function maybeBackup(): Promise<void> {
  const day = todayStr()
  if (lastBackupDay === day) return
  const target = path.join(BACKUP_DIR, `billing-${day}.json`)
  try {
    await fs.access(DB_FILE)
  } catch {
    return // nothing to back up yet
  }
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 })
  try {
    await fs.access(target)
  } catch {
    await fs.copyFile(DB_FILE, target)
    await fs.chmod(target, 0o600)
  }
  lastBackupDay = day

  // Keep the newest KEEP_BACKUPS files (names sort chronologically)
  const files = (await fs.readdir(BACKUP_DIR)).filter(f => /^billing-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
    await fs.unlink(path.join(BACKUP_DIR, old)).catch(() => {})
  }
}

async function persist(next: BillingDB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
  await maybeBackup()
  const tmp = DB_FILE + '.tmp'
  const fh = await fs.open(tmp, 'w', 0o600)
  try {
    await fh.writeFile(JSON.stringify(next, null, 2), 'utf-8')
    await fh.sync()
  } finally {
    await fh.close()
  }
  await fs.chmod(tmp, 0o600)
  await fs.rename(tmp, DB_FILE)
}

// Run a mutation on a copy of the DB; the copy replaces the in-memory DB only
// after it has been written to disk, so a failed write changes nothing.
function mutate<T>(fn: (draft: BillingDB) => T): Promise<T> {
  const run = async () => {
    ensureLoaded()
    const draft = structuredClone(db)
    const result = fn(draft)
    await persist(draft)
    db = draft
    return result
  }
  const p = writeQueue.then(run, run)
  writeQueue = p.catch(() => {})
  return p
}

// ── Validation helpers ────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_AMOUNT = 100_000_000

function bad(message: string): never {
  throw new BillingError(400, message)
}

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function parseDate(v: unknown, field: string): string {
  if (typeof v !== 'string' || !isRealDate(v)) bad(`${field} must be a valid date (YYYY-MM-DD)`)
  return v
}

function parseAmount(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) bad(`${field} must be a number >= 0`)
  if (v > MAX_AMOUNT) bad(`${field} is too large`)
  return round2(v)
}

function parseRequiredText(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string') bad(`${field} is required`)
  const t = v.trim()
  if (t.length < 1) bad(`${field} is required`)
  if (t.length > max) bad(`${field} must be at most ${max} characters`)
  return t
}

// Optional text for create/patch: undefined → untouched, null/'' → cleared
function parseOptionalText(v: unknown, field: string, max: number): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') bad(`${field} must be a string`)
  const t = v.trim()
  if (t.length > max) bad(`${field} must be at most ${max} characters`)
  return t || null
}

function parseStringList(v: unknown, field: string): string[] {
  if (!Array.isArray(v)) bad(`${field} must be an array of strings`)
  const out = new Set<string>()
  for (const item of v) {
    if (typeof item !== 'string') bad(`${field} must be an array of strings`)
    const t = item.trim()
    if (!t) continue
    if (t.length > 100) bad(`${field} item is too long`)
    out.add(t)
  }
  if (out.size > 50) bad(`${field} has too many items`)
  return [...out]
}

function setOptional<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | null | undefined) {
  if (value === undefined) return
  if (value === null) delete obj[key]
  else obj[key] = value
}

function body(b: unknown): Record<string, unknown> {
  return b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {}
}

// ── Derived data ──────────────────────────────────────────────────────────
function entryInvoice(d: BillingDB, e: WorkEntry): Invoice | undefined {
  return e.invoiceId ? d.invoices.find(i => i.id === e.invoiceId) : undefined
}

function entryStatus(d: BillingDB, e: WorkEntry): EntryStatus {
  const inv = entryInvoice(d, e)
  if (!inv) return 'unbilled'
  return inv.status === 'paid' ? 'paid' : 'invoiced'
}

function toView(d: BillingDB, e: WorkEntry): WorkEntryView {
  return { ...e, status: entryStatus(d, e) }
}

function liveEntries(d: BillingDB): WorkEntry[] {
  return d.entries.filter(e => !e.deletedAt)
}

function findProject(d: BillingDB, id: string): BillingProject {
  const p = d.projects.find(x => x.id === id)
  if (!p) throw new BillingError(404, 'Project not found')
  return p
}

function findEntry(d: BillingDB, id: string): WorkEntry {
  const e = d.entries.find(x => x.id === id && !x.deletedAt)
  if (!e) throw new BillingError(404, 'Entry not found')
  return e
}

function findInvoice(d: BillingDB, id: string): Invoice {
  const inv = d.invoices.find(x => x.id === id)
  if (!inv) throw new BillingError(404, 'Invoice not found')
  return inv
}

function byDateDesc(a: WorkEntry, b: WorkEntry): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

// ── Summary ───────────────────────────────────────────────────────────────
export function getSummary(includeArchived: boolean): BillingSummary {
  ensureLoaded()
  const totals: BillingSummary['totals'] = {}
  const bucket = (cur: string) => (totals[cur] ??= { unbilled: 0, invoiced: 0 })
  const entries = liveEntries(db)

  const projects: ProjectSummary[] = db.projects
    .filter(p => includeArchived || !p.archived)
    .map(p => {
      const mine = entries.filter(e => e.projectId === p.id)
      const unbilled = mine.filter(e => entryStatus(db, e) === 'unbilled')
      const unpaid = db.invoices.filter(i => i.projectId === p.id && i.status === 'issued')
      const unbilledTotal = round2(unbilled.reduce((s, e) => s + e.amount, 0))
      const invoicedTotal = round2(unpaid.reduce((s, i) => s + i.total, 0))
      if (unbilledTotal || invoicedTotal) {
        const t = bucket(p.currency)
        t.unbilled = round2(t.unbilled + unbilledTotal)
        t.invoiced = round2(t.invoiced + invoicedTotal)
      }
      const oldest = unbilled.reduce<string | undefined>((m, e) => (!m || e.date < m ? e.date : m), undefined)
      const last = mine.reduce<string | undefined>((m, e) => (!m || e.date > m ? e.date : m), undefined)
      return {
        ...p,
        unbilledTotal,
        unbilledCount: unbilled.length,
        oldestUnbilledDate: oldest,
        invoicedTotal,
        lastEntryDate: last,
      }
    })
    .sort((a, b) => b.unbilledTotal - a.unbilledTotal || a.name.localeCompare(b.name))

  return { totals, projects }
}

// ── Projects ──────────────────────────────────────────────────────────────
export function listProjects(includeArchived: boolean): BillingProject[] {
  ensureLoaded()
  return db.projects
    .filter(p => includeArchived || !p.archived)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
}

function archiveBlocker(d: BillingDB, projectId: string): string | null {
  const unbilled = liveEntries(d).filter(e => e.projectId === projectId && entryStatus(d, e) === 'unbilled').length
  const unpaid = d.invoices.filter(i => i.projectId === projectId && i.status === 'issued').length
  if (!unbilled && !unpaid) return null
  const parts: string[] = []
  if (unbilled) parts.push(`${unbilled} unbilled entr${unbilled === 1 ? 'y' : 'ies'}`)
  if (unpaid) parts.push(`${unpaid} unpaid invoice${unpaid === 1 ? '' : 's'}`)
  return `Project has ${parts.join(' and ')} — bill them or delete them before archiving`
}

function applyProjectFields(p: BillingProject, b: Record<string, unknown>, d: BillingDB) {
  if (b.name !== undefined) p.name = parseRequiredText(b.name, 'Name', 100)
  setOptional(p, 'client', parseOptionalText(b.client, 'Client', 200))
  const email = parseOptionalText(b.email, 'Email', 200)
  if (email && !EMAIL_RE.test(email)) bad('Email is not valid')
  setOptional(p, 'email', email)
  if (b.currency !== undefined) {
    if (typeof b.currency !== 'string' || !CURRENCY_RE.test(b.currency.trim().toUpperCase())) bad('Currency must be a 3-letter code, e.g. CZK')
    const cur = b.currency.trim().toUpperCase()
    if (p.createdAt && cur !== p.currency && liveEntries(d).some(e => e.projectId === p.id)) {
      throw new BillingError(409, 'Currency cannot be changed once the project has entries')
    }
    p.currency = cur
  }
  if (b.hourlyRate !== undefined) {
    setOptional(p, 'hourlyRate', b.hourlyRate === null || b.hourlyRate === '' ? null : parseAmount(b.hourlyRate, 'Hourly rate'))
  }
  if (b.linkedProcesses !== undefined) p.linkedProcesses = parseStringList(b.linkedProcesses, 'Linked processes')
  if (b.linkedSites !== undefined) p.linkedSites = parseStringList(b.linkedSites, 'Linked sites')
  setOptional(p, 'note', parseOptionalText(b.note, 'Note', 2000))
}

export function createProject(input: unknown): Promise<BillingProject> {
  const b = body(input)
  return mutate(d => {
    const p: BillingProject = {
      id: crypto.randomUUID(),
      name: parseRequiredText(b.name, 'Name', 100),
      currency: 'CZK',
      linkedProcesses: [],
      linkedSites: [],
      archived: false,
      createdAt: '',
    }
    applyProjectFields(p, b, d)
    p.createdAt = new Date().toISOString()
    d.projects.push(p)
    return p
  })
}

export function updateProject(id: string, input: unknown): Promise<BillingProject> {
  const b = body(input)
  return mutate(d => {
    const p = findProject(d, id)
    applyProjectFields(p, b, d)
    if (b.archived !== undefined) {
      if (typeof b.archived !== 'boolean') bad('archived must be a boolean')
      if (b.archived && !p.archived) {
        const blocker = archiveBlocker(d, p.id)
        if (blocker) throw new BillingError(409, blocker)
      }
      p.archived = b.archived
    }
    return p
  })
}

export function archiveProject(id: string): Promise<BillingProject> {
  return updateProject(id, { archived: true })
}

// ── Entries ───────────────────────────────────────────────────────────────
export interface EntryQuery {
  projectId?: string
  status?: string
  from?: string
  to?: string
  q?: string
}

export function listEntries(query: EntryQuery): WorkEntryView[] {
  ensureLoaded()
  if (query.status && !['unbilled', 'invoiced', 'paid'].includes(query.status)) bad('status must be unbilled, invoiced or paid')
  if (query.from) parseDate(query.from, 'from')
  if (query.to) parseDate(query.to, 'to')
  const needle = query.q?.trim().toLowerCase()

  return liveEntries(db)
    .filter(e => !query.projectId || e.projectId === query.projectId)
    .filter(e => !query.from || e.date >= query.from)
    .filter(e => !query.to || e.date <= query.to)
    .filter(e => !needle || e.description.toLowerCase().includes(needle))
    .map(e => toView(db, e))
    .filter(e => !query.status || e.status === query.status)
    .sort(byDateDesc)
}

function assertEditable(d: BillingDB, e: WorkEntry) {
  if (entryInvoice(d, e)) throw new BillingError(409, 'Entry is on an invoice — remove it from the invoice first')
}

export function createEntry(input: unknown): Promise<WorkEntryView> {
  const b = body(input)
  return mutate(d => {
    if (typeof b.projectId !== 'string') bad('projectId is required')
    const p = findProject(d, b.projectId)
    if (p.archived) throw new BillingError(409, 'Project is archived')
    const now = new Date().toISOString()
    const e: WorkEntry = {
      id: crypto.randomUUID(),
      projectId: p.id,
      date: b.date === undefined || b.date === null || b.date === '' ? todayStr() : parseDate(b.date, 'Date'),
      description: parseRequiredText(b.description, 'Description', 500),
      amount: parseAmount(b.amount, 'Amount'),
      createdAt: now,
      updatedAt: now,
    }
    if (b.hours !== undefined && b.hours !== null && b.hours !== '') e.hours = parseAmount(b.hours, 'Hours')
    d.entries.push(e)
    return toView(d, e)
  })
}

export function updateEntry(id: string, input: unknown): Promise<WorkEntryView> {
  const b = body(input)
  return mutate(d => {
    const e = findEntry(d, id)
    assertEditable(d, e)
    if (b.date !== undefined) e.date = parseDate(b.date, 'Date')
    if (b.description !== undefined) e.description = parseRequiredText(b.description, 'Description', 500)
    if (b.amount !== undefined) e.amount = parseAmount(b.amount, 'Amount')
    if (b.hours !== undefined) setOptional(e, 'hours', b.hours === null || b.hours === '' ? null : parseAmount(b.hours, 'Hours'))
    e.updatedAt = new Date().toISOString()
    return toView(d, e)
  })
}

export function deleteEntry(id: string): Promise<void> {
  return mutate(d => {
    const e = findEntry(d, id)
    assertEditable(d, e)
    e.deletedAt = new Date().toISOString()
    e.updatedAt = e.deletedAt
  })
}

// ── Invoices ──────────────────────────────────────────────────────────────
export function listInvoices(query: { projectId?: string; status?: string }): Invoice[] {
  ensureLoaded()
  if (query.status && !['issued', 'paid'].includes(query.status)) bad('status must be issued or paid')
  return db.invoices
    .filter(i => !query.projectId || i.projectId === query.projectId)
    .filter(i => !query.status || i.status === query.status)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.createdAt.localeCompare(a.createdAt))
}

export function createInvoice(input: unknown): Promise<Invoice> {
  const b = body(input)
  return mutate(d => {
    if (typeof b.projectId !== 'string') bad('projectId is required')
    const p = findProject(d, b.projectId)
    if (!Array.isArray(b.entryIds) || b.entryIds.length === 0) bad('Select at least one entry')
    if (b.entryIds.some(x => typeof x !== 'string')) bad('entryIds must be strings')
    const ids = [...new Set(b.entryIds as string[])]

    const entries = ids.map(id => {
      const e = d.entries.find(x => x.id === id && !x.deletedAt)
      if (!e) throw new BillingError(404, `Entry ${id} not found`)
      if (e.projectId !== p.id) bad('All entries must belong to the project')
      if (entryInvoice(d, e)) throw new BillingError(409, `"${e.description}" is already on an invoice`)
      return e
    })

    const inv: Invoice = {
      id: crypto.randomUUID(),
      projectId: p.id,
      issuedAt: b.issuedAt === undefined || b.issuedAt === null || b.issuedAt === '' ? todayStr() : parseDate(b.issuedAt, 'Issue date'),
      entryIds: ids,
      total: round2(entries.reduce((s, e) => s + e.amount, 0)),
      currency: p.currency,
      status: 'issued',
      createdAt: new Date().toISOString(),
    }
    setOptional(inv, 'number', parseOptionalText(b.number, 'Invoice number', 100))
    setOptional(inv, 'note', parseOptionalText(b.note, 'Note', 2000))

    const now = inv.createdAt
    for (const e of entries) { e.invoiceId = inv.id; e.updatedAt = now }
    d.invoices.push(inv)
    return inv
  })
}

export function updateInvoice(id: string, input: unknown): Promise<Invoice> {
  const b = body(input)
  return mutate(d => {
    const inv = findInvoice(d, id)
    setOptional(inv, 'number', parseOptionalText(b.number, 'Invoice number', 100))
    setOptional(inv, 'note', parseOptionalText(b.note, 'Note', 2000))
    if (b.issuedAt !== undefined) inv.issuedAt = parseDate(b.issuedAt, 'Issue date')

    if (b.status !== undefined && b.status !== 'issued' && b.status !== 'paid') bad('status must be issued or paid')
    const status = (b.status as Invoice['status'] | undefined) ?? inv.status
    const paidAt = b.paidAt === undefined || b.paidAt === null || b.paidAt === '' ? undefined : parseDate(b.paidAt, 'Paid date')

    if (status === 'paid') {
      inv.paidAt = paidAt ?? (inv.status === 'paid' ? inv.paidAt : undefined) ?? todayStr()
    } else {
      if (paidAt) bad('Paid date can only be set on a paid invoice')
      delete inv.paidAt
    }
    inv.status = status
    return inv
  })
}

export function deleteInvoice(id: string): Promise<{ released: number }> {
  return mutate(d => {
    const inv = findInvoice(d, id)
    const now = new Date().toISOString()
    let released = 0
    for (const e of d.entries) {
      if (e.invoiceId === inv.id) { delete e.invoiceId; e.updatedAt = now; released++ }
    }
    d.invoices = d.invoices.filter(i => i.id !== inv.id)
    return { released }
  })
}

// ── Plain-text export for the external invoicing tool ─────────────────────
export function formatAmount(n: number, currency: string): string {
  const isInt = Number.isInteger(n)
  const [int, dec] = (isInt ? String(Math.trunc(n)) : n.toFixed(2)).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${grouped}${dec ? ',' + dec : ''} ${currency}`
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

export function invoiceText(id: string): string {
  ensureLoaded()
  const inv = findInvoice(db, id)
  const entries = inv.entryIds
    .map(eid => db.entries.find(e => e.id === eid))
    .filter((e): e is WorkEntry => !!e)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const lines = entries.map(e => `${formatDate(e.date)} — ${e.description.replace(/\s+/g, ' ')} — ${formatAmount(e.amount, inv.currency)}`)
  lines.push(`Total: ${formatAmount(inv.total, inv.currency)}`)
  return lines.join('\n') + '\n'
}
