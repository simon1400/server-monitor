import { useState } from 'react'
import { X, Loader2, CheckCircle, XCircle, Globe, FileArchive, ArrowRight, ArrowLeft, PartyPopper, ShieldCheck, AlertTriangle } from 'lucide-react'
import { createSite, uploadZip, setupDomain } from '../hooks/useHosting'
import type { StepResult } from '../types/hosting'
import panicMeme from '../assets/panic-www.png'

interface Props {
  onClose: () => void
  onDone: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Derive a default site name from a domain: ducati100.cz -> ducati100-cz
function deriveName(domain: string): string {
  return domain.toLowerCase().trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function StepLog({ result }: { result: StepResult }) {
  return (
    <div className="space-y-2 mt-3">
      {result.steps.map((s, i) => (
        <div key={i} className="flex items-start gap-2">
          {s.success
            ? <CheckCircle className="w-4 h-4 text-accent-green shrink-0 mt-0.5" />
            : <XCircle className="w-4 h-4 text-accent-red shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-text-primary">{s.name}</span>
            {s.output && (
              <pre className="text-xs text-text-muted mt-1 bg-bg-primary rounded p-2 overflow-x-auto max-h-28 overflow-y-auto whitespace-pre-wrap break-all">{s.output}</pre>
            )}
          </div>
        </div>
      ))}
      {result.error && (
        <div className="text-xs text-accent-red bg-accent-red/10 rounded p-2 whitespace-pre-wrap">{result.error}</div>
      )}
    </div>
  )
}

export default function NewSiteWizard({ onClose, onDone }: Props) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [domain, setDomain] = useState('')
  const [www, setWww] = useState(true)
  const [redirectWww, setRedirectWww] = useState(true)
  const [dnsAck, setDnsAck] = useState(false)
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<StepResult | null>(null)
  const [domainResult, setDomainResult] = useState<StepResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const onDomainChange = (v: string) => {
    setDomain(v)
    if (!nameEdited) setName(deriveName(v))
  }
  const onNameChange = (v: string) => {
    setName(v)
    setNameEdited(v.trim().length > 0) // empty again → resume auto-fill from domain
  }

  const createAndNext = async () => {
    setError(null)
    if (!name.trim()) { setError('Enter a site name'); return }
    if (slug) { setStep(2); return } // already created — just move on
    setBusy(true)
    const res = await createSite(name.trim(), domain.trim())
    setBusy(false)
    if (!res.success || !res.slug) { setError(res.error || 'Failed to create site'); return }
    setSlug(res.slug)
    setStep(2)
  }

  // After Files: go to Confirm if a domain was set, otherwise finish.
  const proceedAfterFiles = () => {
    setError(null)
    setStep(domain.trim() ? 3 : 4)
  }

  const doUpload = async () => {
    if (!file) { setError('Select a .zip archive'); return }
    setError(null)
    setBusy(true)
    setProgress(0)
    setUploadResult(null)
    const res = await uploadZip(slug, file, 'replace', setProgress)
    setUploadResult(res)
    setBusy(false)
    if (res.success) setTimeout(proceedAfterFiles, 700)
  }

  const doDomain = async () => {
    setError(null)
    setBusy(true)
    setDomainResult(null)
    const res = await setupDomain(slug, domain.trim(), www, redirectWww)
    setDomainResult(res)
    setBusy(false)
    if (res.success) setTimeout(() => setStep(4), 700)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }

  const steps = ['Site', 'Files', 'Confirm', 'Done']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl mx-2 sm:mx-4" onClick={e => e.stopPropagation()}>
        {/* Header + step indicator */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">New site</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-1 px-4 py-3 border-b border-border shrink-0">
          {steps.map((label, i) => {
            const n = i + 1
            const active = step === n
            const done = step > n
            return (
              <div key={label} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center gap-1.5 ${active ? 'text-accent-blue' : done ? 'text-accent-green' : 'text-text-muted'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${active ? 'bg-accent-blue/20' : done ? 'bg-accent-green/20' : 'bg-bg-secondary'}`}>
                    {done ? '✓' : n}
                  </span>
                  <span className="text-xs font-medium hidden sm:inline">{label}</span>
                </div>
                {i < steps.length - 1 && <div className={`h-px flex-1 ${done ? 'bg-accent-green/40' : 'bg-border'}`} />}
              </div>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="text-sm text-accent-red bg-accent-red/10 rounded-lg px-3 py-2 mb-3">{error}</div>
          )}

          {/* Step 1 — Site (domain first, then name + domain options) */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-secondary block mb-1.5">Domain <span className="text-text-muted">(optional, can set later)</span></label>
                <input
                  autoFocus
                  value={domain}
                  onChange={e => onDomainChange(e.target.value)}
                  placeholder="example.com"
                  className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50"
                />
                <p className="text-xs text-text-muted mt-1.5">The domain must point (A record) to this server.</p>
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={e => onNameChange(e.target.value)}
                  placeholder="e.g. my-site"
                  className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50"
                />
                <p className="text-xs text-text-muted mt-1.5">Auto-filled from the domain — edit for a custom name.</p>
              </div>
              {domain.trim() && (
                <div className="space-y-3 pt-1 border-t border-border">
                  <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer pt-2">
                    <input type="checkbox" checked={www} onChange={e => setWww(e.target.checked)} className="accent-accent-blue w-4 h-4" />
                    Also connect <span className="font-mono text-text-primary">www.{domain.trim()}</span>
                  </label>
                  {www && (
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer pl-6">
                      <input type="checkbox" checked={redirectWww} onChange={e => setRedirectWww(e.target.checked)} className="accent-accent-blue w-4 h-4" />
                      Redirect <span className="font-mono text-text-primary">www</span> → <span className="font-mono text-text-primary">{domain.trim()}</span>
                    </label>
                  )}
                  {www && <p className="text-xs text-text-muted">Requires that <span className="font-mono">www.*</span> also points (A-record) to this server.</p>}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Files */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">Upload a .zip with the site files (it must contain <span className="font-mono text-text-primary">index.html</span>).</p>
              <label
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-10 px-4 cursor-pointer transition-colors ${dragOver ? 'border-accent-blue bg-accent-blue/5' : 'border-border hover:border-accent-blue/40'}`}
              >
                <FileArchive className="w-8 h-8 text-text-muted" />
                {file ? (
                  <span className="text-sm text-text-primary font-medium">{file.name} <span className="text-text-muted">({formatBytes(file.size)})</span></span>
                ) : (
                  <span className="text-sm text-text-muted">Drag a .zip here or click to choose</span>
                )}
                <input type="file" accept=".zip,application/zip" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              {busy && (
                <div>
                  <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-accent-blue transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-text-muted mt-1">{progress < 100 ? `Uploading ${progress}%` : 'Extracting on server…'}</p>
                </div>
              )}
              {uploadResult && <StepLog result={uploadResult} />}
            </div>
          )}

          {/* Step 3 — Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              <img src={panicMeme} alt="" className="w-full max-w-[280px] mx-auto rounded-xl border border-border shadow-lg" />

              <div className="bg-bg-secondary/60 border border-border rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2"><span className="text-text-muted">Site</span><span className="text-text-primary font-medium">{name}</span></div>
                <div className="flex justify-between gap-2"><span className="text-text-muted">Domain</span><span className="text-text-primary font-mono">{domain}</span></div>
                <div className="flex justify-between gap-2"><span className="text-text-muted">www</span><span className="text-text-primary">{www ? (redirectWww ? `redirects → ${domain}` : 'serves the site') : 'off'}</span></div>
              </div>

              <div className="bg-accent-yellow/10 border border-accent-yellow/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-accent-yellow shrink-0 mt-0.5" />
                <p className="text-xs text-text-secondary">
                  We'll verify DNS, create the nginx config, request a <strong>real Let's Encrypt certificate</strong> (counts toward rate limits), and reload nginx. Make sure DNS is set first, or issuance will fail.
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" checked={dnsAck} onChange={e => setDnsAck(e.target.checked)} className="accent-accent-blue w-4 h-4 mt-0.5" />
                <span>I confirm that <span className="font-mono text-text-primary">{domain}</span>{www ? <> and <span className="font-mono text-text-primary">www.{domain}</span></> : ''} point to this server (DNS A-record).</span>
              </label>

              {busy && (
                <div className="flex items-center gap-2 text-sm text-accent-blue"><Loader2 className="w-4 h-4 animate-spin" /> Setting up domain &amp; SSL… (can take up to a minute)</div>
              )}
              {domainResult && <StepLog result={domainResult} />}
            </div>
          )}

          {/* Step 4 — Done */}
          {step === 4 && (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <PartyPopper className="w-12 h-12 text-accent-green" />
              <h3 className="text-lg font-semibold text-text-primary">{domain ? 'Site published!' : 'Site created!'}</h3>
              {domain
                ? <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="text-accent-cyan hover:underline flex items-center gap-1 font-mono"><Globe className="w-4 h-4" /> https://{domain}</a>
                : <p className="text-sm text-text-muted">You can connect a domain later from the site card.</p>}
              <p className="text-sm text-text-muted">You can edit files from the site card anytime.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 shrink-0 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors">
            {step === 4 ? 'Close' : 'Cancel'}
          </button>
          <div className="flex items-center gap-2">
            {step === 1 && (
              <button onClick={createAndNext} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Next
              </button>
            )}
            {step === 2 && (
              <>
                <button onClick={() => setStep(1)} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"><ArrowLeft className="w-4 h-4" /> Back</button>
                <button onClick={proceedAfterFiles} disabled={busy} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">Skip</button>
                <button onClick={doUpload} disabled={busy || !file} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Upload
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <button onClick={() => { setStep(2); setDomainResult(null) }} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"><ArrowLeft className="w-4 h-4" /> Back</button>
                <button onClick={doDomain} disabled={busy || !dnsAck} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Publish
                </button>
              </>
            )}
            {step === 4 && (
              <button onClick={onDone} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-green hover:bg-accent-green/90 text-white rounded-lg transition-colors">
                <CheckCircle className="w-4 h-4" /> Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
