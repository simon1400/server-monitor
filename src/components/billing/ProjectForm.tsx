import { useState, useEffect, type FormEvent } from 'react'
import { Loader2, Save, X, Server, Globe } from 'lucide-react'
import type { BillingProject, ProjectsMeta } from '../../types/billing'
import { createProject, updateProject, getProjectsMeta, type ProjectInput } from '../../hooks/useBilling'
import { CURRENCIES, parseAmountInput } from './format'

interface Props {
  project?: BillingProject          // edit mode when given
  hasEntries?: boolean              // currency is locked once entries exist
  onCancel: () => void
  onSaved: (project: BillingProject) => void
}

function ChipPicker({ icon: Icon, label, options, value, onChange }: {
  icon: typeof Server
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [filter, setFilter] = useState('')
  // Keep already-linked names visible even if they no longer exist on the server
  const all = [...new Set([...value, ...options])]
  const shown = all.filter(o => !filter || o.toLowerCase().includes(filter.toLowerCase()))
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-xs text-text-muted flex items-center gap-1"><Icon className="w-3 h-3" /> {label}{value.length > 0 && ` (${value.length})`}</label>
        {all.length > 8 && (
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="filter…"
            className="w-28 bg-bg-secondary border border-border rounded px-2 py-0.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50" />
        )}
      </div>
      {all.length === 0 ? (
        <p className="text-xs text-text-muted/70">none available</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {shown.map(o => {
            const on = value.includes(o)
            return (
              <button type="button" key={o} onClick={() => toggle(o)}
                className={`text-xs font-mono px-2 py-1 rounded-full border transition-colors ${on ? 'bg-accent-blue/15 border-accent-blue/40 text-accent-blue' : 'border-border text-text-muted hover:text-text-primary'}`}>
                {o}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ProjectForm({ project, hasEntries, onCancel, onSaved }: Props) {
  const [name, setName] = useState(project?.name || '')
  const [client, setClient] = useState(project?.client || '')
  const [email, setEmail] = useState(project?.email || '')
  const [currency, setCurrency] = useState(project?.currency || 'CZK')
  const [rate, setRate] = useState(project?.hourlyRate != null ? String(project.hourlyRate) : '')
  const [linkedProcesses, setLinkedProcesses] = useState<string[]>(project?.linkedProcesses || [])
  const [linkedSites, setLinkedSites] = useState<string[]>(project?.linkedSites || [])
  const [note, setNote] = useState(project?.note || '')
  const [meta, setMeta] = useState<ProjectsMeta | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getProjectsMeta()
      .then(m => { if (!cancelled) setMeta(m) })
      .catch(() => { if (!cancelled) setMeta({ processes: [], sites: [] }) })
    return () => { cancelled = true }
  }, [])

  const rateNum = parseAmountInput(rate)
  const rateValid = rateNum === null || !Number.isNaN(rateNum)
  const currencyOptions = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !rateValid) return
    setBusy(true)
    setError(null)
    const input: ProjectInput = {
      name: name.trim(),
      client: client.trim() || null,
      email: email.trim() || null,
      currency,
      hourlyRate: rateNum,
      linkedProcesses,
      linkedSites,
      note: note.trim() || null,
    }
    const res = project ? await updateProject(project.id, input) : await createProject(input)
    setBusy(false)
    if (!res.success || !res.project) { setError(res.error || 'Failed to save'); return }
    onSaved(res.project)
  }

  const inputCls = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-muted block mb-1">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100} autoFocus={!project} placeholder="Burger Festival" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">Client</label>
          <input value={client} onChange={e => setClient(e.target.value)} maxLength={200} placeholder="Company or person" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={200} className={inputCls} />
        </div>
        <div className="flex gap-2">
          <div className="w-24 shrink-0">
            <label className="text-xs text-text-muted block mb-1">Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} disabled={hasEntries}
              title={hasEntries ? 'Currency cannot be changed once the project has entries' : undefined}
              className={`${inputCls} px-2 disabled:opacity-60`}>
              {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-xs text-text-muted block mb-1">Hourly rate</label>
            <input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder="optional"
              className={`${inputCls} ${!rateValid ? 'border-accent-red/60' : ''}`} />
          </div>
        </div>
      </div>

      {meta ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ChipPicker icon={Server} label="Linked PM2 processes" options={meta.processes} value={linkedProcesses} onChange={setLinkedProcesses} />
          <ChipPicker icon={Globe} label="Linked hosting sites" options={meta.sites} value={linkedSites} onChange={setLinkedSites} />
        </div>
      ) : (
        <p className="text-xs text-text-muted flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading server projects…</p>
      )}

      <div>
        <label className="text-xs text-text-muted block mb-1">Note</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={2} className={`${inputCls} resize-y`} />
      </div>

      {error && <div className="text-xs text-accent-red bg-accent-red/10 rounded-lg px-3 py-2">{error}</div>}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">
          <X className="w-4 h-4" /> Cancel
        </button>
        <button type="submit" disabled={busy || !name.trim() || !rateValid} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {project ? 'Save' : 'Create project'}
        </button>
      </div>
    </form>
  )
}
