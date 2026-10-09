import { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle, Copy, Trash2, Loader2, Pencil, Save, X, Undo2 } from 'lucide-react'
import type { Invoice, WorkEntryView } from '../../types/billing'
import { updateInvoice, deleteInvoice, getInvoiceText } from '../../hooks/useBilling'
import { formatAmount, formatDate, todayStr } from './format'
import EntryList from './EntryList'

function InvoiceRow({ invoice, entries, onChanged }: { invoice: Invoice; entries: WorkEntryView[]; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [number, setNumber] = useState(invoice.number || '')
  const [issuedAt, setIssuedAt] = useState(invoice.issuedAt)
  const [paidAt, setPaidAt] = useState(invoice.paidAt || '')
  const [note, setNote] = useState(invoice.note || '')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallbackText, setFallbackText] = useState<string | null>(null)
  const paid = invoice.status === 'paid'

  const patch = async (input: Parameters<typeof updateInvoice>[1]) => {
    setBusy(true)
    setError(null)
    const res = await updateInvoice(invoice.id, input)
    setBusy(false)
    if (!res.success) { setError(res.error || 'Failed to update'); return false }
    onChanged()
    return true
  }

  const toggleEdit = () => {
    if (!editing) {
      setNumber(invoice.number || '')
      setIssuedAt(invoice.issuedAt)
      setPaidAt(invoice.paidAt || '')
      setNote(invoice.note || '')
    }
    setEditing(!editing)
    setExpanded(true)
  }

  const markPaid = () => patch({ status: 'paid', paidAt: todayStr() })
  const markUnpaid = () => { if (confirm('Mark this invoice as not paid?')) patch({ status: 'issued' }) }

  const saveEdit = async () => {
    const ok = await patch({
      number: number.trim() || null,
      issuedAt,
      note: note.trim() || null,
      ...(paid && paidAt ? { paidAt } : {}),
    })
    if (ok) setEditing(false)
  }

  const copyText = async () => {
    setError(null)
    const res = await getInvoiceText(invoice.id)
    if (!res.success || res.text == null) { setError(res.error || 'Failed to load text'); return }
    try {
      await navigator.clipboard.writeText(res.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setFallbackText(res.text) // clipboard blocked — show it for manual copy
    }
  }

  const remove = async () => {
    const msg = `Delete invoice ${invoice.number || 'without number'} (${formatAmount(invoice.total, invoice.currency)})?\n\n`
      + `Its ${invoice.entryIds.length} item${invoice.entryIds.length === 1 ? '' : 's'} go back to "Unbilled". `
      + 'This only removes the record here — nothing changes in your invoicing tool.'
    if (!confirm(msg)) return
    setBusy(true)
    const res = await deleteInvoice(invoice.id)
    setBusy(false)
    if (!res.success) { setError(res.error || 'Failed to delete'); return }
    onChanged()
  }

  const inputCls = 'bg-bg-secondary border border-border rounded-lg px-2 py-1.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50'

  return (
    <div className="bg-bg-card rounded-xl border border-border">
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <button onClick={() => setExpanded(!expanded)} className="min-w-0 text-left flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-text-primary">{invoice.number ? `#${invoice.number}` : <span className="text-text-muted font-normal">No number</span>}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${paid ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-yellow/15 text-accent-yellow'}`}>{invoice.status}</span>
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              issued {formatDate(invoice.issuedAt)}
              {paid && invoice.paidAt && <> · paid {formatDate(invoice.paidAt)}</>}
              {' · '}{invoice.entryIds.length} item{invoice.entryIds.length === 1 ? '' : 's'}
            </div>
            {invoice.note && <p className="text-xs text-text-secondary mt-1 break-words">{invoice.note}</p>}
          </button>
          <div className="text-right shrink-0">
            <div className="text-base sm:text-lg font-bold text-text-primary whitespace-nowrap">{formatAmount(invoice.total, invoice.currency)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {!paid ? (
            <button onClick={markPaid} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent-green/15 hover:bg-accent-green/25 text-accent-green rounded-lg transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Mark paid
            </button>
          ) : (
            <button onClick={markUnpaid} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary transition-colors disabled:opacity-50" title="Mark as not paid">
              <Undo2 className="w-3.5 h-3.5" /> Unpaid
            </button>
          )}
          <button onClick={copyText} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-text-secondary hover:text-accent-blue rounded-lg hover:bg-accent-blue/10 transition-colors">
            {copied ? <CheckCircle className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy as text'}
          </button>
          <div className="flex items-center gap-0.5 ml-auto">
            <button onClick={toggleEdit} className="p-1.5 rounded-lg hover:bg-accent-blue/10 text-text-muted hover:text-accent-blue transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
            <button onClick={remove} disabled={busy} className="p-1.5 rounded-lg hover:bg-accent-red/10 text-text-muted hover:text-accent-red transition-colors disabled:opacity-50" title="Delete invoice"><Trash2 className="w-4 h-4" /></button>
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && <div className="text-xs text-accent-red bg-accent-red/10 rounded-lg px-3 py-2 mt-2">{error}</div>}
        {fallbackText && (
          <div className="mt-2">
            <textarea readOnly value={fallbackText} rows={Math.min(10, fallbackText.split('\n').length)} onFocus={e => e.target.select()}
              className="w-full bg-bg-primary border border-border rounded-lg p-2 text-xs font-mono text-text-primary" />
            <button onClick={() => setFallbackText(null)} className="text-xs text-text-muted hover:text-text-primary">Close</button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border">
          {editing && (
            <div className="p-3 space-y-2 bg-bg-secondary/40 border-b border-border" onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}>
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1 text-xs text-text-muted">Number
                  <input value={number} onChange={e => setNumber(e.target.value)} maxLength={100} className={`${inputCls} w-32`} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">Issued
                  <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} className={`${inputCls} w-[9.5rem] [color-scheme:dark]`} />
                </label>
                {paid && (
                  <label className="flex flex-col gap-1 text-xs text-text-muted">Paid
                    <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className={`${inputCls} w-[9.5rem] [color-scheme:dark]`} />
                  </label>
                )}
              </div>
              <label className="flex flex-col gap-1 text-xs text-text-muted">Note
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={2000} className={`${inputCls} w-full`} />
              </label>
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => setEditing(false)} className="p-2 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
                <button onClick={saveEdit} disabled={busy || !issuedAt} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </div>
          )}
          <EntryList entries={entries} currency={invoice.currency} readOnly onChanged={onChanged} />
        </div>
      )}
    </div>
  )
}

export default function InvoiceList({ invoices, entries, onChanged }: { invoices: Invoice[]; entries: WorkEntryView[]; onChanged: () => void }) {
  if (invoices.length === 0) {
    return <p className="text-sm text-text-muted text-center py-8">No invoices yet — select unbilled items and create one.</p>
  }
  return (
    <div className="space-y-3">
      {invoices.map(inv => (
        <InvoiceRow
          key={inv.id}
          invoice={inv}
          entries={entries.filter(e => e.invoiceId === inv.id)}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}
