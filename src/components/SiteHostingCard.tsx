import { useState, useRef } from 'react'
import {
  Globe, ExternalLink, FolderTree, FileArchive, ShieldCheck, ShieldAlert, ShieldX,
  HardDrive, Files, Trash2, ChevronDown, ChevronUp, Loader2, CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react'
import type { ManagedSite, StepResult } from '../types/hosting'
import { uploadZip, setupDomain, deleteSite } from '../hooks/useHosting'
import FileManagerModal from './FileManagerModal'

function StepLog({ result }: { result: StepResult }) {
  return (
    <div className="space-y-2">
      {result.steps.map((s, i) => (
        <div key={i} className="flex items-start gap-2">
          {s.success ? <CheckCircle className="w-4 h-4 text-accent-green shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-accent-red shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-text-primary">{s.name}</span>
            {s.output && <pre className="text-xs text-text-muted mt-1 bg-bg-primary rounded p-2 overflow-x-auto max-h-28 overflow-y-auto whitespace-pre-wrap break-all">{s.output}</pre>}
          </div>
        </div>
      ))}
      {result.error && <div className="text-xs text-accent-red bg-accent-red/10 rounded p-2">{result.error}</div>}
    </div>
  )
}

export default function SiteHostingCard({ site, onAction }: { site: ManagedSite; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploadResult, setUploadResult] = useState<StepResult | null>(null)
  const [domain, setDomain] = useState(site.domain)
  const [www, setWww] = useState(site.www)
  const [domainBusy, setDomainBusy] = useState(false)
  const [domainResult, setDomainResult] = useState<StepResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const httpOk = site.http?.ok ?? null
  const isProblematic = (site.domain && httpOk === false) || (site.sslInfo && !site.sslInfo.valid)
  const statusColor = !site.domain ? 'bg-text-muted' : httpOk === false ? 'bg-accent-red' : httpOk ? 'bg-accent-green' : 'bg-accent-yellow'

  const handleReupload = async (file: File) => {
    if (!confirm(`Re-upload "${site.name}"?\n\nCurrent files will be replaced with the archive contents (a backup is created automatically).`)) return
    setExpanded(true)
    setProgress(0)
    setUploadResult(null)
    const res = await uploadZip(site.slug, file, 'replace', setProgress)
    setProgress(null)
    setUploadResult(res)
    if (res.success) setTimeout(onAction, 1500)
  }

  const handleDomain = async () => {
    if (!domain.trim()) return
    setDomainBusy(true)
    setDomainResult(null)
    const res = await setupDomain(site.slug, domain.trim(), www)
    setDomainBusy(false)
    setDomainResult(res)
    if (res.success) setTimeout(onAction, 1500)
  }

  const handleDelete = async () => {
    if (!confirm(`Delete site "${site.name}"?\n\nFiles and the nginx config will be removed. This cannot be undone.`)) return
    const removeCert = site.ssl ? confirm('Also delete the Let\'s Encrypt SSL certificate?') : false
    const res = await deleteSite(site.slug, removeCert)
    if (res.success) onAction()
    else alert(res.error || 'Failed to delete')
  }

  return (
    <div className={`bg-bg-card rounded-xl border transition-all duration-200 ${isProblematic ? 'border-accent-red/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-border hover:border-border/80'}`}>
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleReupload(f); e.target.value = '' }} />

      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor} ${httpOk ? 'animate-pulse' : ''}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-text-primary text-sm sm:text-base truncate">{site.name}</h3>
                {isProblematic && <AlertTriangle className="w-4 h-4 text-accent-red shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {site.domain ? (
                  <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer"
                    className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 hover:underline ${httpOk === false ? 'bg-accent-red/10 text-accent-red' : 'bg-accent-cyan/10 text-accent-cyan'}`}>
                    <Globe className="w-3 h-3" /> {site.domain}
                  </a>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-text-muted/10 text-text-muted">no domain connected</span>
                )}
                {site.http && (
                  httpOk
                    ? <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-green/15 text-accent-green">{site.http.status}</span>
                    : <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-red/15 text-accent-red">{site.http.status ?? 'DOWN'}</span>
                )}
                {site.sslInfo
                  ? (!site.sslInfo.valid
                    ? <span className="flex items-center gap-1 text-xs text-accent-red font-medium"><ShieldAlert className="w-3 h-3" /> SSL {site.sslInfo.daysLeft <= 0 ? 'Expired' : 'Invalid'}</span>
                    : site.sslInfo.daysLeft <= 14
                      ? <span className="flex items-center gap-1 text-xs text-accent-yellow font-medium"><ShieldAlert className="w-3 h-3" /> {site.sslInfo.daysLeft}d</span>
                      : <span className="flex items-center gap-1 text-xs text-accent-green"><ShieldCheck className="w-3 h-3" /> {site.sslInfo.daysLeft}d</span>)
                  : site.domain && <span className="flex items-center gap-1 text-xs text-text-muted"><ShieldX className="w-3 h-3" /> No SSL</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-5 shrink-0">
            <div className="hidden md:flex items-center gap-5">
              <div className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-text-muted" /><span className="font-mono text-sm text-text-secondary">{site.diskUsage}</span></div>
              <div className="flex items-center gap-1.5"><Files className="w-3.5 h-3.5 text-text-muted" /><span className="font-mono text-sm text-text-secondary">{site.fileCount}</span></div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setFilesOpen(true)} className="p-1.5 rounded-lg hover:bg-accent-blue/10 text-text-muted hover:text-accent-blue transition-colors" title="Files"><FolderTree className="w-4 h-4" /></button>
              <button onClick={() => fileRef.current?.click()} className="p-1.5 rounded-lg hover:bg-accent-purple/10 text-text-muted hover:text-accent-purple transition-colors" title="Re-upload zip"><FileArchive className="w-4 h-4" /></button>
              {site.domain && (
                <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-accent-cyan/10 text-text-muted hover:text-accent-cyan transition-colors" title="Open site"><ExternalLink className="w-4 h-4" /></a>
              )}
              <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-accent-red/10 text-text-muted hover:text-accent-red transition-colors" title="Delete site"><Trash2 className="w-4 h-4" /></button>
              <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted transition-colors">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex md:hidden items-center gap-4 mt-2 text-xs">
          <span className="font-mono text-text-secondary flex items-center gap-1"><HardDrive className="w-3 h-3" /> {site.diskUsage}</span>
          <span className="font-mono text-text-secondary flex items-center gap-1"><Files className="w-3 h-3" /> {site.fileCount} files</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-3 sm:p-4 space-y-4">
          {/* Domain & SSL */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-accent-cyan" />
              <span className="text-sm font-semibold text-text-primary">Domain &amp; SSL</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com"
                className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50" />
              <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer shrink-0">
                <input type="checkbox" checked={www} onChange={e => setWww(e.target.checked)} className="accent-accent-blue w-4 h-4" /> www
              </label>
              <button onClick={handleDomain} disabled={domainBusy || !domain.trim()} className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50 shrink-0">
                {domainBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {site.ssl ? 'Renew SSL' : 'Connect'}
              </button>
            </div>
            {domainBusy && <p className="text-xs text-text-muted mt-2 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Setting up… (up to a minute)</p>}
            {domainResult && <div className="mt-3"><StepLog result={domainResult} /></div>}
          </div>

          {/* Re-upload progress */}
          {(progress !== null || uploadResult) && (
            <div>
              <div className="flex items-center gap-2 mb-2"><FileArchive className="w-4 h-4 text-accent-purple" /><span className="text-sm font-semibold text-text-primary">Re-uploading files</span></div>
              {progress !== null && (
                <div>
                  <div className="h-2 bg-bg-secondary rounded-full overflow-hidden"><div className="h-full bg-accent-purple transition-all" style={{ width: `${progress}%` }} /></div>
                  <p className="text-xs text-text-muted mt-1">{progress < 100 ? `Uploading ${progress}%` : 'Extracting…'}</p>
                </div>
              )}
              {uploadResult && <StepLog result={uploadResult} />}
            </div>
          )}

          <p className="text-xs text-text-muted">Created: {new Date(site.createdAt).toLocaleDateString('en-GB')} · /opt/static-sites/{site.slug}</p>
        </div>
      )}

      {filesOpen && <FileManagerModal slug={site.slug} siteName={site.name} onClose={() => { setFilesOpen(false); onAction() }} />}
    </div>
  )
}
