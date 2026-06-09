import { useState } from 'react'
import { Plus, Globe, Loader2 } from 'lucide-react'
import { useHostingSites } from '../hooks/useHosting'
import SiteHostingCard from '../components/SiteHostingCard'
import NewSiteWizard from '../components/NewSiteWizard'

export default function HostingPage() {
  const { sites, loading, error, refresh } = useHostingSites()
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">Хостинг</h2>
          <p className="text-sm text-text-muted">{sites.length} статических сайт{sites.length === 1 ? '' : sites.length >= 2 && sites.length <= 4 ? 'а' : 'ов'} · загрузка zip и управление файлами</p>
        </div>
        <button onClick={() => setWizardOpen(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors shrink-0">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Добавить сайт</span><span className="sm:hidden">Сайт</span>
        </button>
      </div>

      {error && <div className="text-sm text-accent-red bg-accent-red/10 rounded-lg px-3 py-2 mb-4">{error}</div>}

      {loading && sites.length === 0 ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-text-muted" /></div>
      ) : sites.length === 0 ? (
        <div className="bg-bg-card rounded-xl border border-border border-dashed p-10 flex flex-col items-center text-center gap-3">
          <Globe className="w-10 h-10 text-text-muted" />
          <h3 className="text-lg font-semibold text-text-primary">Пока нет сайтов</h3>
          <p className="text-sm text-text-muted max-w-md">Загрузите .zip со статическим сайтом, подключите домен и SSL — всё через интерфейс, без терминала.</p>
          <button onClick={() => setWizardOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors mt-1">
            <Plus className="w-4 h-4" /> Добавить первый сайт
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map(site => <SiteHostingCard key={site.slug} site={site} onAction={refresh} />)}
        </div>
      )}

      {wizardOpen && <NewSiteWizard onClose={() => { setWizardOpen(false); refresh() }} onDone={() => { setWizardOpen(false); refresh() }} />}
    </>
  )
}
