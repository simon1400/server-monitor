import { useState, useEffect, useRef, type FormEvent } from 'react'
import { X, Loader2, Plus, Clock, CheckCircle } from 'lucide-react'
import type { BillingProject } from '../../types/billing'
import { createEntry } from '../../hooks/useBilling'
import { formatAmount, parseAmountInput, todayStr, round2 } from './format'

const LAST_PROJECT_KEY = 'billing:lastProjectId'

function readLastProject(): string | null {
  try { return localStorage.getItem(LAST_PROJECT_KEY) } catch { return null }
}

function writeLastProject(id: string) {
  try { localStorage.setItem(LAST_PROJECT_KEY, id) } catch { /* storage unavailable */ }
}

interface Props {
  projects: BillingProject[]       // active (non-archived) projects
  defaultProjectId?: string
  onClose: () => void
  onLogged: () => void
  onCreateProject: () => void
}

export default function LogWorkModal({ projects, defaultProjectId, onClose, onLogged, onCreateProject }: Props) {
  const [projectId, setProjectId] = useState(() => {
    const preferred = [defaultProjectId, readLastProject()].find(id => id && projects.some(p => p.id === id))
    return preferred || projects[0]?.id || ''
  })
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr)
  const [hours, setHours] = useState('')
  const [showHours, setShowHours] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const descRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const project = projects.find(p => p.id === projectId)
  const amountNum = parseAmountInput(amount)
  const amountValid = amountNum !== null && !Number.isNaN(amountNum)
  const hoursNum = parseAmountInput(hours)
  const hoursValid = hoursNum === null || !Number.isNaN(hoursNum)
  const canSubmit = !!project && description.trim().length > 0 && amountValid && hoursValid && !!date && !busy

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const onHoursChange = (v: string) => {
    setHours(v)
    const h = parseAmountInput(v)
    if (project?.hourlyRate && h !== null && !Number.isNaN(h)) setAmount(String(round2(h * project.hourlyRate)))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !project) return
    setBusy(true)
    setError(null)
    const res = await createEntry({
      projectId: project.id,
      date,
      description: description.trim(),
      amount: amountNum!,
      hours: hoursNum ?? undefined,
    })
    setBusy(false)
    if (!res.success) { setError(res.error || 'Failed to log work'); return }

    writeLastProject(project.id)
    setToast(`Logged ${formatAmount(amountNum!, project.currency)} → ${project.name}`)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
    setDescription('')
    setAmount('')
    setHours('')
    descRef.current?.focus()
    onLogged()
  }

  const inputCls = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-t-xl sm:rounded-xl w-full sm:max-w-md max-h-[90vh] flex flex-col shadow-2xl sm:mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Log work</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-text-muted">Create a project first — work is logged per project.</p>
            <button onClick={onCreateProject} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Create project
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Project</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1">What I did</label>
              <input
                ref={descRef}
                autoFocus
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={500}
                placeholder="Fixed the header on mobile"
                className={inputCls}
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-text-muted block mb-1">Amount{project ? `, ${project.currency}` : ''}</label>
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="500"
                  className={`${inputCls} ${amount && !amountValid ? 'border-accent-red/60' : ''}`}
                />
              </div>
              <div className="w-[9.5rem] shrink-0">
                <label className="text-xs text-text-muted block mb-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
              </div>
            </div>

            {showHours ? (
              <div>
                <label className="text-xs text-text-muted block mb-1">
                  Hours{project?.hourlyRate ? ` (× ${formatAmount(project.hourlyRate, project.currency)}/h fills the amount)` : ''}
                </label>
                <input
                  value={hours}
                  onChange={e => onHoursChange(e.target.value)}
                  inputMode="decimal"
                  placeholder="1.5"
                  className={`${inputCls} ${hours && !hoursValid ? 'border-accent-red/60' : ''}`}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setShowHours(true)} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-blue transition-colors">
                <Clock className="w-3.5 h-3.5" /> Add hours
              </button>
            )}

            {error && <div className="text-xs text-accent-red bg-accent-red/10 rounded-lg px-3 py-2">{error}</div>}
            {toast && (
              <div className="flex items-center gap-2 text-sm text-accent-green bg-accent-green/10 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 shrink-0" /> <span className="truncate">{toast}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Log{amountValid && project ? ` ${formatAmount(amountNum!, project.currency)}` : ''}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
