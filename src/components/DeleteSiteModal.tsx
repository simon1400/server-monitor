import { useState, useEffect } from 'react'
import { X, Trash2, AlertTriangle, FileX, Globe, ShieldOff, Info, Loader2 } from 'lucide-react'
import type { ManagedSite } from '../types/hosting'
import regretMeme from '../assets/regret-delete.png'

interface Props {
  site: ManagedSite
  onCancel: () => void
  onConfirm: (removeCert: boolean) => Promise<void>
}

export default function DeleteSiteModal({ site, onCancel, onConfirm }: Props) {
  const [typed, setTyped] = useState('')
  const [removeCert, setRemoveCert] = useState(false)
  const [busy, setBusy] = useState(false)
  const match = typed.trim() === site.name

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, busy])

  const confirm = async () => {
    if (!match || busy) return
    setBusy(true)
    await onConfirm(removeCert)
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => !busy && onCancel()}>
      <div className="bg-bg-card border border-accent-red/40 rounded-xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl mx-2 sm:mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-accent-red" />
            <h2 className="text-lg font-semibold text-text-primary">Delete this site?</h2>
          </div>
          <button onClick={onCancel} disabled={busy} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <img src={regretMeme} alt="" className="w-full max-w-[260px] mx-auto rounded-xl border border-border shadow-lg" />

          <p className="text-sm text-text-secondary text-center">
            You're about to permanently delete <span className="font-semibold text-text-primary">{site.name}</span>. This cannot be undone.
          </p>

          {/* What will happen */}
          <div className="bg-bg-secondary/60 border border-border rounded-lg p-3 space-y-2 text-sm">
            <div className="flex items-start gap-2 text-text-secondary">
              <FileX className="w-4 h-4 text-accent-red shrink-0 mt-0.5" />
              <span>All files in <span className="font-mono text-xs text-text-primary">/opt/static-sites/{site.slug}</span> ({site.fileCount} files, {site.diskUsage}) and the backup will be erased.</span>
            </div>
            {site.hasNginx ? (
              <div className="flex items-start gap-2 text-text-secondary">
                <Globe className="w-4 h-4 text-accent-yellow shrink-0 mt-0.5" />
                <span>Its nginx config (<span className="font-mono text-xs text-text-primary">static-{site.slug}</span>) is removed — {site.domain ? <span className="font-mono text-xs text-text-primary">{site.domain}</span> : 'the domain'} will stop responding.</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-accent-green">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>This site was never published — <span className="text-text-secondary">no nginx or SSL changes are made</span>. Only its files are removed; any other site on {site.domain ? <span className="font-mono text-xs text-text-primary">{site.domain}</span> : 'that domain'} is untouched.</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-text-muted">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>The DNS A-record is <span className="text-text-secondary">not</span> changed — manage it at your registrar.</span>
            </div>
          </div>

          {/* SSL option */}
          {site.ssl && (
            <label className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer bg-bg-secondary/40 border border-border rounded-lg p-3">
              <input type="checkbox" checked={removeCert} onChange={e => setRemoveCert(e.target.checked)} className="accent-accent-red w-4 h-4 mt-0.5" />
              <span className="flex items-center gap-1.5"><ShieldOff className="w-4 h-4 text-text-muted" /> Also delete the Let's Encrypt SSL certificate</span>
            </label>
          )}

          {/* Type-to-confirm */}
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">Type <span className="font-semibold text-text-primary">{site.name}</span> to confirm</label>
            <input
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirm() }}
              placeholder={site.name}
              className={`w-full bg-bg-secondary border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none ${match ? 'border-accent-red/60' : 'border-border focus:border-accent-blue/50'}`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 shrink-0 flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">Cancel</button>
          <button
            onClick={confirm}
            disabled={!match || busy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-red hover:bg-accent-red/90 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete site
          </button>
        </div>
      </div>
    </div>
  )
}
