import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Pencil, Archive, ArchiveRestore, Plus, FileText, Loader2, Server, Globe, Mail, Search } from 'lucide-react'
import type { ProjectSummary, WorkEntryView, Invoice, EntryStatus } from '../../types/billing'
import { listEntries, listInvoices, archiveProject, updateProject } from '../../hooks/useBilling'
import { formatAmount, round2 } from './format'
import EntryList from './EntryList'
import InvoiceList from './InvoiceList'
import CreateInvoiceModal from './CreateInvoiceModal'
import ProjectForm from './ProjectForm'

export type ProjectTab = 'unbilled' | 'invoices' | 'all'

interface Props {
  project: ProjectSummary
  version: number                 // bumped by the page whenever billing data changes
  tab: ProjectTab
  onTabChange: (tab: ProjectTab) => void
  onBack: () => void
  onChanged: () => void
  onLogWork: () => void
}

function AllEntries({ projectId, currency, version, onChanged }: { projectId: string; currency: string; version: number; onChanged: () => void }) {
  const [status, setStatus] = useState<EntryStatus | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [entries, setEntries] = useState<WorkEntryView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    let cancelled = false
    listEntries({ projectId, status, from, to, q: debouncedQ })
      .then(list => { if (!cancelled) { setEntries(list); setError(null) } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load') })
    return () => { cancelled = true }
  }, [projectId, status, from, to, debouncedQ, version])

  const total = round2((entries || []).reduce((s, e) => s + e.amount, 0))
  const inputCls = 'bg-bg-secondary border border-border rounded-lg px-2 py-1.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50'

  return (
    <div className="bg-bg-card rounded-xl border border-border">
      <div className="p-3 flex flex-wrap items-center gap-2 border-b border-border">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className={`${inputCls} w-full pl-8`} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value as EntryStatus | '')} className={inputCls}>
          <option value="">All statuses</option>
          <option value="unbilled">Unbilled</option>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
        </select>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${inputCls} w-[9.5rem] [color-scheme:dark]`} title="From" />
          –
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${inputCls} w-[9.5rem] [color-scheme:dark]`} title="To" />
        </div>
      </div>
      {error && <div className="text-xs text-accent-red bg-accent-red/10 px-3 py-2">{error}</div>}
      {entries === null ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
      ) : (
        <>
          <EntryList entries={entries} currency={currency} showStatus onChanged={onChanged} />
          {entries.length > 0 && (
            <div className="flex justify-between px-3 py-2.5 border-t border-border text-sm">
              <span className="text-text-muted">{entries.length} item{entries.length === 1 ? '' : 's'}</span>
              <span className="font-semibold text-text-primary">{formatAmount(total, currency)}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ProjectView({ project, version, tab, onTabChange, onBack, onChanged, onLogWork }: Props) {
  const [entries, setEntries] = useState<WorkEntryView[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [invoiceOpen, setInvoiceOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const [e, i] = await Promise.all([listEntries({ projectId: project.id }), listInvoices(project.id)])
      setEntries(e)
      setInvoices(i)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => { load() }, [load, version])

  // Everything unbilled is selected by default; we only remember what was unticked
  const unbilled = entries.filter(e => e.status === 'unbilled')
  const selectedIds = unbilled.filter(e => !deselected.has(e.id)).map(e => e.id)
  const selected = new Set(selectedIds)
  const selectedTotal = round2(unbilled.filter(e => selected.has(e.id)).reduce((s, e) => s + e.amount, 0))
  const allSelected = unbilled.length > 0 && selectedIds.length === unbilled.length

  const toggle = (id: string) => setDeselected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAll = () => setDeselected(allSelected ? new Set(unbilled.map(e => e.id)) : new Set())

  const handleArchive = async () => {
    setActionError(null)
    if (project.archived) {
      const res = await updateProject(project.id, { archived: false })
      if (!res.success) setActionError(res.error || 'Failed to unarchive')
      else onChanged()
      return
    }
    if (!confirm(`Archive "${project.name}"? It will be hidden from the overview; you can unarchive it later.`)) return
    const res = await archiveProject(project.id)
    if (!res.success) setActionError(res.error || 'Failed to archive')
    else onChanged()
  }

  const unpaidCount = invoices.filter(i => i.status === 'issued').length
  const tabs: { key: ProjectTab; label: string; count?: number }[] = [
    { key: 'unbilled', label: 'Unbilled', count: unbilled.length },
    { key: 'invoices', label: 'Invoices', count: unpaidCount || undefined },
    { key: 'all', label: 'All entries' },
  ]

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">
        <ArrowLeft className="w-4 h-4" /> All projects
      </button>

      {/* Header */}
      <div className="bg-bg-card rounded-xl border border-border p-3 sm:p-4">
        {editing ? (
          <ProjectForm project={project} hasEntries={entries.length > 0} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged() }} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-bold text-text-primary truncate">{project.name}</h2>
                  {project.archived && <span className="text-[11px] px-1.5 py-0.5 rounded bg-text-muted/15 text-text-muted font-medium">archived</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted mt-0.5">
                  {project.client && <span className="text-text-secondary">{project.client}</span>}
                  {project.email && <a href={`mailto:${project.email}`} className="flex items-center gap-1 hover:text-accent-blue"><Mail className="w-3 h-3" />{project.email}</a>}
                  <span>{project.currency}</span>
                  {project.hourlyRate != null && <span>{formatAmount(project.hourlyRate, project.currency)}/h</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-accent-blue/10 text-text-muted hover:text-accent-blue transition-colors" title="Edit project"><Pencil className="w-4 h-4" /></button>
                <button onClick={handleArchive} className="p-1.5 rounded-lg hover:bg-accent-yellow/10 text-text-muted hover:text-accent-yellow transition-colors" title={project.archived ? 'Unarchive' : 'Archive'}>
                  {project.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {(project.linkedProcesses.length > 0 || project.linkedSites.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {project.linkedProcesses.map(p => <span key={p} className="text-xs font-mono px-2 py-0.5 rounded-full bg-accent-purple/10 text-accent-purple flex items-center gap-1"><Server className="w-3 h-3" />{p}</span>)}
                {project.linkedSites.map(s => <span key={s} className="text-xs font-mono px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan flex items-center gap-1"><Globe className="w-3 h-3" />{s}</span>)}
              </div>
            )}
            {project.note && <p className="text-xs text-text-secondary mt-2 whitespace-pre-wrap break-words">{project.note}</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm">
              <span><span className="text-text-muted">Unbilled </span><span className="font-semibold text-text-primary whitespace-nowrap">{formatAmount(project.unbilledTotal, project.currency)}</span></span>
              {project.invoicedTotal > 0 && <span><span className="text-text-muted">Unpaid </span><span className="font-semibold text-accent-yellow whitespace-nowrap">{formatAmount(project.invoicedTotal, project.currency)}</span></span>}
            </div>
          </>
        )}
        {actionError && <div className="text-xs text-accent-red bg-accent-red/10 rounded-lg px-3 py-2 mt-3">{actionError}</div>}
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-bg-card border border-border rounded-lg p-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => onTabChange(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-muted hover:text-text-primary'}`}>
              {t.label}{t.count != null && t.count > 0 && <span className="ml-1 text-xs opacity-80">{t.count}</span>}
            </button>
          ))}
        </div>
        {!project.archived && (
          <button onClick={onLogWork} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-colors shrink-0">
            <Plus className="w-4 h-4" /> Log work here
          </button>
        )}
      </div>

      {error && <div className="text-sm text-accent-red bg-accent-red/10 rounded-lg px-3 py-2">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : tab === 'unbilled' ? (
        <div className="bg-bg-card rounded-xl border border-border">
          {unbilled.length > 0 && (
            <label className="flex items-center gap-3 px-3 py-2 border-b border-border text-xs text-text-muted cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-accent-blue w-4 h-4" />
              Select all
            </label>
          )}
          <EntryList entries={unbilled} currency={project.currency} selected={selected} onToggle={toggle} onChanged={onChanged} />
          {unbilled.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-3 border-t border-border">
              <div className="text-sm">
                <span className="text-text-muted">Selected {selectedIds.length} of {unbilled.length}: </span>
                <span className="font-bold text-text-primary whitespace-nowrap">{formatAmount(selectedTotal, project.currency)}</span>
              </div>
              <button onClick={() => setInvoiceOpen(true)} disabled={selectedIds.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                <FileText className="w-4 h-4" /> Create invoice from selected
              </button>
            </div>
          )}
        </div>
      ) : tab === 'invoices' ? (
        <InvoiceList invoices={invoices} entries={entries} onChanged={onChanged} />
      ) : (
        <AllEntries projectId={project.id} currency={project.currency} version={version} onChanged={onChanged} />
      )}

      {invoiceOpen && (
        <CreateInvoiceModal
          projectId={project.id}
          entryIds={selectedIds}
          total={selectedTotal}
          currency={project.currency}
          onClose={() => setInvoiceOpen(false)}
          onCreated={() => { setInvoiceOpen(false); setDeselected(new Set()); onTabChange('invoices'); onChanged() }}
        />
      )}
    </div>
  )
}
