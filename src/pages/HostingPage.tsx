import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { useHostingSites } from '../hooks/useHosting'
import SiteHostingCard from '../components/SiteHostingCard'
import NewSiteWizard from '../components/NewSiteWizard'
import panicMeme from '../assets/panic-www.png'

export default function HostingPage() {
  const { sites, loading, error, refresh } = useHostingSites()
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">Hosting</h2>
          <p className="text-sm text-text-muted">{sites.length} static site{sites.length === 1 ? '' : 's'} · zip upload &amp; file management</p>
        </div>
        <button onClick={() => setWizardOpen(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors shrink-0">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add site</span><span className="sm:hidden">Site</span>
        </button>
      </div>

      {error && <div className="text-sm text-accent-red bg-accent-red/10 rounded-lg px-3 py-2 mb-4">{error}</div>}

      {loading && sites.length === 0 ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-text-muted" /></div>
      ) : sites.length === 0 ? (
        <div className="bg-bg-card rounded-xl border border-border border-dashed p-8 sm:p-10 flex flex-col items-center text-center gap-4">
          <img src={panicMeme} alt="" className="w-full max-w-sm rounded-xl border border-border shadow-lg" />
          <h3 className="text-lg font-semibold text-text-primary">No sites yet</h3>
          <p className="text-sm text-text-muted max-w-md">Upload a .zip with a static site, connect a domain and SSL — all from the UI, no terminal needed.</p>
          <button onClick={() => setWizardOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors mt-1">
            <Plus className="w-4 h-4" /> Add your first site
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
