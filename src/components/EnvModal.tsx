import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Eye, EyeOff, Save, Loader2, AlertTriangle } from 'lucide-react'
import { getProcessEnv, saveProcessEnv } from '../hooks/useMonitor'

interface EnvEntry {
  key: string
  value: string
}

interface EnvModalProps {
  processName: string
  onClose: () => void
  onSaved: () => void
}

export default function EnvModal({ processName, onClose, onSaved }: EnvModalProps) {
  const [entries, setEntries] = useState<EnvEntry[]>([])
  const [cwd, setCwd] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [hasChanges, setHasChanges] = useState(false)
  const [originalEntries, setOriginalEntries] = useState<string>('')

  useEffect(() => {
    loadEnv()
  }, [processName])

  const loadEnv = async () => {
    setLoading(true)
    setError(null)
    const result = await getProcessEnv(processName)
    if (result) {
      setEntries(result.entries)
      setCwd(result.cwd)
      setOriginalEntries(JSON.stringify(result.entries))
    } else {
      setError('Failed to load environment variables')
    }
    setLoading(false)
  }

  const updateEntry = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...entries]
    updated[index] = { ...updated[index], [field]: val }
    setEntries(updated)
    setHasChanges(JSON.stringify(updated) !== originalEntries)
  }

  const addEntry = () => {
    const updated = [...entries, { key: '', value: '' }]
    setEntries(updated)
    setHasChanges(true)
  }

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index)
    setEntries(updated)
    setHasChanges(JSON.stringify(updated) !== originalEntries)
  }

  const toggleVisibility = (key: string) => {
    const next = new Set(visibleKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setVisibleKeys(next)
  }

  const handleSave = async () => {
    // Validate: no empty keys
    const invalid = entries.some(e => !e.key.trim())
    if (invalid) {
      setError('All keys must be non-empty')
      return
    }

    // Check duplicates
    const keys = entries.map(e => e.key.trim())
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
    if (dupes.length > 0) {
      setError(`Duplicate keys: ${[...new Set(dupes)].join(', ')}`)
      return
    }

    if (!confirm(`Save .env and restart "${processName}"?`)) return

    setSaving(true)
    setError(null)
    setSuccess(false)
    const result = await saveProcessEnv(processName, entries.map(e => ({ key: e.key.trim(), value: e.value })))
    setSaving(false)

    if (result.success) {
      setSuccess(true)
      setHasChanges(false)
      setOriginalEntries(JSON.stringify(entries))
      setTimeout(() => {
        setSuccess(false)
        onSaved()
      }, 2000)
    } else {
      setError(result.error || 'Save failed')
    }
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl mx-2 sm:mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Environment Variables</h2>
            <p className="text-xs text-text-muted font-mono mt-0.5">{processName} {cwd && `- ${cwd}/.env`}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
            </div>
          ) : (
            <div className="space-y-2">
              {entries.length === 0 && !error && (
                <p className="text-sm text-text-muted text-center py-8">No .env file found. Add variables below.</p>
              )}
              {entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-1.5 sm:gap-2 group">
                  <input
                    type="text"
                    value={entry.key}
                    onChange={e => updateEntry(i, 'key', e.target.value)}
                    placeholder="KEY"
                    className="w-[30%] sm:w-[35%] shrink-0 bg-bg-secondary border border-border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50"
                  />
                  <div className="flex-1 relative">
                    <input
                      type={visibleKeys.has(`${i}`) ? 'text' : 'password'}
                      value={entry.value}
                      onChange={e => updateEntry(i, 'value', e.target.value)}
                      placeholder="value"
                      className="w-full bg-bg-secondary border border-border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 pr-8 sm:pr-9 text-xs sm:text-sm font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(`${i}`)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                    >
                      {visibleKeys.has(`${i}`) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={() => removeEntry(i)}
                    className="p-1.5 sm:p-2 rounded-lg text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addEntry}
                className="flex items-center gap-1.5 text-sm text-text-muted hover:text-accent-blue transition-colors mt-3 px-1"
              >
                <Plus className="w-4 h-4" />
                Add variable
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 shrink-0">
          {error && (
            <div className="flex items-center gap-2 text-sm text-accent-red mb-3 bg-accent-red/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-accent-green mb-3 bg-accent-green/10 rounded-lg px-3 py-2">
              Saved & restarted successfully
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">
              {hasChanges ? 'Unsaved changes' : entries.length > 0 ? `${entries.length} variable${entries.length !== 1 ? 's' : ''}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save & Restart
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
