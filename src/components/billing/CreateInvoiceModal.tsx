import { useState, useEffect, type FormEvent } from 'react'
import { X, Loader2, FileText } from 'lucide-react'
import { createInvoice } from '../../hooks/useBilling'
import { formatAmount, todayStr } from './format'

interface Props {
  projectId: string
  entryIds: string[]
  total: number
  currency: string
  onClose: () => void
  onCreated: () => void
}

export default function CreateInvoiceModal({ projectId, entryIds, total, currency, onClose, onCreated }: Props) {
  const [number, setNumber] = useState('')
  const [issuedAt, setIssuedAt] = useState(todayStr)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, busy])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await createInvoice({ projectId, entryIds, number: number.trim() || undefined, issuedAt, note: note.trim() || undefined })
    setBusy(false)
    if (!res.success) { setError(res.error || 'Failed to create invoice'); return }
    onCreated()
  }

  const inputCls = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="bg-bg-card border border-border rounded-t-xl sm:rounded-xl w-full sm:max-w-md max-h-[90vh] flex flex-col shadow-2xl sm:mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent-blue" />
            <h2 className="text-lg font-semibold text-text-primary">Create invoice</h2>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="bg-bg-secondary/60 border border-border rounded-lg px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-text-secondary">{entryIds.length} item{entryIds.length === 1 ? '' : 's'}</span>
            <span className="font-bold text-text-primary">{formatAmount(total, currency)}</span>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Invoice number (from your invoicing tool, optional)</label>
            <input value={number} onChange={e => setNumber(e.target.value)} maxLength={100} autoFocus placeholder="2026-014" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Issue date</label>
            <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={2000} className={inputCls} />
          </div>
          {error && <div className="text-xs text-accent-red bg-accent-red/10 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy || !issuedAt} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Create invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
