import { useState } from 'react'
import { Pencil, Trash2, Lock, Save, X, Loader2, Clock } from 'lucide-react'
import type { WorkEntryView, EntryStatus } from '../../types/billing'
import { updateEntry, deleteEntry } from '../../hooks/useBilling'
import { formatAmount, formatDate, parseAmountInput } from './format'

const STATUS_CLS: Record<EntryStatus, string> = {
  unbilled: 'bg-accent-blue/15 text-accent-blue',
  invoiced: 'bg-accent-yellow/15 text-accent-yellow',
  paid: 'bg-accent-green/15 text-accent-green',
}

export function StatusPill({ status }: { status: EntryStatus }) {
  return <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${STATUS_CLS[status]}`}>{status}</span>
}

interface Props {
  entries: WorkEntryView[]
  currency: string
  showStatus?: boolean
  readOnly?: boolean
  selected?: Set<string>
  onToggle?: (id: string) => void
  onChanged: () => void
}

function EntryRow({ entry, currency, showStatus, readOnly, checked, onToggle, onChanged }: {
  entry: WorkEntryView
  currency: string
  showStatus?: boolean
  readOnly?: boolean
  checked?: boolean
  onToggle?: () => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(entry.date)
  const [description, setDescription] = useState(entry.description)
  const [amount, setAmount] = useState(String(entry.amount))
  const [hours, setHours] = useState(entry.hours != null ? String(entry.hours) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = !!entry.invoiceId

  const startEdit = () => {
    setDate(entry.date)
    setDescription(entry.description)
    setAmount(String(entry.amount))
    setHours(entry.hours != null ? String(entry.hours) : '')
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    const a = parseAmountInput(amount)
    const h = parseAmountInput(hours)
    if (a === null || Number.isNaN(a)) { setError('Amount is not a number'); return }
    if (h !== null && Number.isNaN(h)) { setError('Hours is not a number'); return }
    setBusy(true)
    const res = await updateEntry(entry.id, { date, description: description.trim(), amount: a, hours: h })
    setBusy(false)
    if (!res.success) { setError(res.error || 'Failed to save'); return }
    setEditing(false)
    onChanged()
  }

  const remove = async () => {
    if (!confirm(`Delete "${entry.description}" (${formatAmount(entry.amount, currency)})?`)) return
    const res = await deleteEntry(entry.id)
    if (!res.success) { alert(res.error || 'Failed to delete'); return }
    onChanged()
  }

  const inputCls = 'bg-bg-secondary border border-border rounded-lg px-2 py-1.5 text-base sm:text-sm text-text-primary focus:outline-none focus:border-accent-blue/50'

  if (editing) {
    return (
      <div className="p-3 space-y-2 bg-bg-secondary/40" onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}>
        <input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} autoFocus className={`${inputCls} w-full`} />
        <div className="flex flex-wrap gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${inputCls} w-[9.5rem] [color-scheme:dark]`} />
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount" className={`${inputCls} w-28`} />
          <input value={hours} onChange={e => setHours(e.target.value)} inputMode="decimal" placeholder="Hours" className={`${inputCls} w-20`} />
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => setEditing(false)} className="p-2 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
            <button onClick={save} disabled={busy || !description.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 ${checked === false ? 'opacity-50' : ''}`}>
      {onToggle && (
        <input type="checkbox" checked={!!checked} onChange={onToggle} className="accent-accent-blue w-4 h-4 mt-1 shrink-0 cursor-pointer" />
      )}
      <div className="flex-1 min-w-0" onClick={onToggle} role={onToggle ? 'button' : undefined}>
        <p className="text-sm text-text-primary break-words">{entry.description}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-text-muted">
          <span className="font-mono">{formatDate(entry.date)}</span>
          {entry.hours != null && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{entry.hours} h</span>}
          {showStatus && <StatusPill status={entry.status} />}
        </div>
      </div>
      <div className="text-sm font-semibold text-text-primary whitespace-nowrap mt-0.5">{formatAmount(entry.amount, currency)}</div>
      {!readOnly && (
        locked ? (
          <span className="p-1.5 text-text-muted shrink-0" title="On an invoice — remove from invoice first"><Lock className="w-4 h-4" /></span>
        ) : (
          <div className="flex items-center shrink-0 -my-1">
            <button onClick={startEdit} className="p-1.5 rounded-lg hover:bg-accent-blue/10 text-text-muted hover:text-accent-blue transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
            <button onClick={remove} className="p-1.5 rounded-lg hover:bg-accent-red/10 text-text-muted hover:text-accent-red transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
          </div>
        )
      )}
    </div>
  )
}

export default function EntryList({ entries, currency, showStatus, readOnly, selected, onToggle, onChanged }: Props) {
  if (entries.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">No entries</p>
  }
  return (
    <div className="divide-y divide-border">
      {entries.map(e => (
        <EntryRow
          key={`${e.id}:${e.updatedAt}`}
          entry={e}
          currency={currency}
          showStatus={showStatus}
          readOnly={readOnly}
          checked={selected ? selected.has(e.id) : undefined}
          onToggle={onToggle ? () => onToggle(e.id) : undefined}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}
