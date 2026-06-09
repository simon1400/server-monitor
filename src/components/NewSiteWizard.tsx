import { useState } from 'react'
import { X, Loader2, CheckCircle, XCircle, Globe, FileArchive, ArrowRight, PartyPopper } from 'lucide-react'
import { createSite, uploadZip, setupDomain } from '../hooks/useHosting'
import type { StepResult } from '../types/hosting'

interface Props {
  onClose: () => void
  onDone: () => void
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
        <div className="text-xs text-accent-red bg-accent-red/10 rounded p-2">{result.error}</div>
      )}
    </div>
  )
}

export default function NewSiteWizard({ onClose, onDone }: Props) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [www, setWww] = useState(true)
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<StepResult | null>(null)
  const [domainResult, setDomainResult] = useState<StepResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const createAndNext = async () => {
    setError(null)
    if (!name.trim()) { setError('Введите название сайта'); return }
    setBusy(true)
    const res = await createSite(name.trim(), domain.trim())
    setBusy(false)
    if (!res.success || !res.slug) { setError(res.error || 'Не удалось создать сайт'); return }
    setSlug(res.slug)
    setStep(2)
  }

  const doUpload = async () => {
    if (!file) { setError('Выберите .zip архив'); return }
    setError(null)
    setBusy(true)
    setProgress(0)
    setUploadResult(null)
    const res = await uploadZip(slug, file, 'replace', setProgress)
    setUploadResult(res)
    setBusy(false)
    if (res.success) setTimeout(() => setStep(3), 700)
  }

  const doDomain = async () => {
    if (!domain.trim()) { setError('Введите домен'); return }
    setError(null)
    setBusy(true)
    setDomainResult(null)
    const res = await setupDomain(slug, domain.trim(), www)
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

  const steps = ['Сайт', 'Файлы', 'Домен', 'Готово']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl mx-2 sm:mx-4" onClick={e => e.stopPropagation()}>
        {/* Header + step indicator */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Новый сайт</h2>
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

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-secondary block mb-1.5">Название</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Например: Ducati 100"
                  className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50"
                />
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1.5">Домен <span className="text-text-muted">(можно указать позже)</span></label>
                <input
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="example.cz"
                  className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50"
                />
                <p className="text-xs text-text-muted mt-1.5">Домен должен указывать (A-запись) на этот сервер.</p>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">Загрузите .zip с файлами сайта (внутри должен быть <span className="font-mono text-text-primary">index.html</span>).</p>
              <label
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-10 px-4 cursor-pointer transition-colors ${dragOver ? 'border-accent-blue bg-accent-blue/5' : 'border-border hover:border-accent-blue/40'}`}
              >
                <FileArchive className="w-8 h-8 text-text-muted" />
                {file ? (
                  <span className="text-sm text-text-primary font-medium">{file.name} <span className="text-text-muted">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                ) : (
                  <span className="text-sm text-text-muted">Перетащите .zip сюда или нажмите для выбора</span>
                )}
                <input type="file" accept=".zip,application/zip" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              {busy && (
                <div>
                  <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-accent-blue transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-text-muted mt-1">{progress < 100 ? `Загрузка ${progress}%` : 'Распаковка на сервере…'}</p>
                </div>
              )}
              {uploadResult && <StepLog result={uploadResult} />}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">Подключим домен и выпустим бесплатный SSL (Let's Encrypt).</p>
              <div>
                <label className="text-sm text-text-secondary block mb-1.5">Домен</label>
                <input
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="example.cz"
                  className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-blue/50"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" checked={www} onChange={e => setWww(e.target.checked)} className="accent-accent-blue w-4 h-4" />
                Также подключить <span className="font-mono text-text-primary">www.{domain || 'example.cz'}</span>
              </label>
              <p className="text-xs text-text-muted">Проверим DNS → создадим nginx-конфиг → выпустим сертификат → перезагрузим nginx.</p>
              {busy && (
                <div className="flex items-center gap-2 text-sm text-accent-blue"><Loader2 className="w-4 h-4 animate-spin" /> Настройка домена и SSL… (может занять до минуты)</div>
              )}
              {domainResult && <StepLog result={domainResult} />}
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <PartyPopper className="w-12 h-12 text-accent-green" />
              <h3 className="text-lg font-semibold text-text-primary">Сайт опубликован!</h3>
              <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="text-accent-cyan hover:underline flex items-center gap-1 font-mono">
                <Globe className="w-4 h-4" /> https://{domain}
              </a>
              <p className="text-sm text-text-muted">Файлы можно править в карточке сайта в любой момент.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 shrink-0 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors">
            {step === 4 ? 'Закрыть' : 'Отмена'}
          </button>
          <div className="flex items-center gap-2">
            {step === 1 && (
              <button onClick={createAndNext} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Далее
              </button>
            )}
            {step === 2 && (
              <>
                <button onClick={() => setStep(3)} disabled={busy} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">Пропустить</button>
                <button onClick={doUpload} disabled={busy || !file} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Загрузить
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <button onClick={() => setStep(4)} disabled={busy} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">Пропустить</button>
                <button onClick={doDomain} disabled={busy || !domain.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />} Подключить
                </button>
              </>
            )}
            {step === 4 && (
              <button onClick={onDone} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-green hover:bg-accent-green/90 text-white rounded-lg transition-colors">
                <CheckCircle className="w-4 h-4" /> Готово
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
