import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Plus, Lock, Loader2, AlertTriangle, Wallet, FileText, FolderOpen, Archive } from 'lucide-react'
import type { BillingSummary, ProjectSummary } from '../types/billing'
import { useBillingLock, useBillingSummary, lockBilling } from '../hooks/useBilling'
import BillingLock from '../components/billing/BillingLock'
import LogWorkModal from '../components/billing/LogWorkModal'
import ProjectCard from '../components/billing/ProjectCard'
import ProjectView, { type ProjectTab } from '../components/billing/ProjectView'
import ProjectForm from '../components/billing/ProjectForm'
import { formatAmount } from '../components/billing/format'

function StatTile({ label, icon: Icon, lines, accent }: { label: string; icon: typeof Wallet; lines: string[]; accent: string }) {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-3 sm:p-4 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1"><Icon className={`w-3.5 h-3.5 ${accent}`} /> {label}</div>
      {lines.map(l => <div key={l} className="text-lg sm:text-2xl font-bold text-text-primary whitespace-nowrap truncate">{l}</div>)}
    </div>
  )
}

function Overview({ summary, onOpen, onCreate }: { summary: BillingSummary; onOpen: (id: string) => void; onCreate: () => void }) {
  const active = summary.projects.filter(p => !p.archived)
  const currencies = Object.keys(summary.totals)
  const unbilledLines = currencies.length ? currencies.map(c => formatAmount(summary.totals[c].unbilled, c)) : ['0 CZK']
  const invoicedLines = currencies.length ? currencies.map(c => formatAmount(summary.totals[c].invoiced, c)) : ['0 CZK']
  const withUnbilled = active.filter(p => p.unbilledCount > 0).length

  if (active.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl border border-border border-dashed p-8 sm:p-10 flex flex-col items-center text-center gap-3">
        <Wallet className="w-10 h-10 text-text-muted" />
        <h3 className="text-lg font-semibold text-text-primary">No billing projects yet</h3>
        <p className="text-sm text-text-muted max-w-md">
          Create a project per client, then log every small paid change right after you finish it.
          When it's time to invoice, batch the unbilled items in one go.
        </p>
        <button onClick={onCreate} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors mt-1">
          <Plus className="w-4 h-4" /> Create project
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="Unbilled" icon={Wallet} accent="text-accent-blue" lines={unbilledLines} />
        <StatTile label="Invoiced, unpaid" icon={FileText} accent="text-accent-yellow" lines={invoicedLines} />
        <div className="col-span-2 sm:col-span-1">
          <StatTile label="Projects with unbilled work" icon={FolderOpen} accent="text-accent-cyan" lines={[`${withUnbilled} / ${active.length}`]} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {active.map(p => <ProjectCard key={p.id} project={p} onOpen={() => onOpen(p.id)} />)}
      </div>
    </div>
  )
}

function ProjectsManager({ projects, creating, setCreating, onOpen, onChanged }: {
  projects: ProjectSummary[]
  creating: boolean
  setCreating: (v: boolean) => void
  onOpen: (id: string) => void
  onChanged: () => void
}) {
  const [showArchived, setShowArchived] = useState(false)
  const shown = projects.filter(p => showArchived || !p.archived).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
  const archivedCount = projects.filter(p => p.archived).length

  return (
    <div className="space-y-3">
      {creating ? (
        <div className="bg-bg-card rounded-xl border border-accent-blue/40 p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">New project</h3>
          <ProjectForm onCancel={() => setCreating(false)} onSaved={p => { setCreating(false); onChanged(); onOpen(p.id) }} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-accent-blue w-4 h-4" />
            Show archived{archivedCount > 0 && ` (${archivedCount})`}
          </label>
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New project
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        !creating && <p className="text-sm text-text-muted text-center py-8">No projects yet.</p>
      ) : (
        <div className="bg-bg-card rounded-xl border border-border divide-y divide-border">
          {shown.map(p => (
            <button key={p.id} onClick={() => onOpen(p.id)} className={`w-full text-left flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-bg-card-hover transition-colors ${p.archived ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary truncate">{p.name}</span>
                  {p.archived && <Archive className="w-3.5 h-3.5 text-text-muted shrink-0" />}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {[p.client, p.currency, p.hourlyRate != null ? `${formatAmount(p.hourlyRate, p.currency)}/h` : null, [...p.linkedProcesses, ...p.linkedSites].join(', ') || null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="text-sm font-semibold text-text-primary whitespace-nowrap">{formatAmount(p.unbilledTotal, p.currency)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BillingContent() {
  const [params, setParams] = useSearchParams()
  const projectId = params.get('project')
  const view = projectId ? 'project' : params.get('view') === 'projects' ? 'projects' : 'overview'
  const tabParam = params.get('tab')
  const tab: ProjectTab = tabParam === 'invoices' || tabParam === 'all' ? tabParam : 'unbilled'
  const creating = params.get('new') === '1'

  const { summary, loading, error, refresh } = useBillingSummary(15000)
  const [version, setVersion] = useState(0)
  const [logOpen, setLogOpen] = useState(false)

  const onChanged = () => { refresh(); setVersion(v => v + 1) }
  const goOverview = () => setParams({})
  const goProjects = (startCreating = false) => setParams(startCreating ? { view: 'projects', new: '1' } : { view: 'projects' })
  const openProject = (id: string) => setParams({ project: id })
  const setTab = (t: ProjectTab) => setParams(t === 'unbilled' ? { project: projectId! } : { project: projectId!, tab: t })

  const activeProjects = summary?.projects.filter(p => !p.archived) || []
  const current = projectId ? summary?.projects.find(p => p.id === projectId) : undefined

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-text-primary mb-1">Billing</h2>
          <p className="text-sm text-text-muted truncate">Small paid changes → one invoice later</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => lockBilling()} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-bg-card-hover rounded-lg transition-colors" title="Lock billing">
            <Lock className="w-4 h-4" /> <span className="hidden sm:inline">Lock</span>
          </button>
          <button onClick={() => setLogOpen(true)} className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Log work
          </button>
        </div>
      </div>

      {view !== 'project' && (
        <div className="flex items-center gap-1 bg-bg-card border border-border rounded-lg p-1 mb-4 w-fit">
          {([['overview', 'Overview'], ['projects', 'Projects']] as const).map(([key, label]) => (
            <button key={key} onClick={() => (key === 'overview' ? goOverview() : goProjects())}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === key ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-muted hover:text-text-primary'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-accent-red bg-accent-red/10 border border-accent-red/30 rounded-lg px-3 py-2 mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span className="break-words min-w-0">{error}</span>
        </div>
      )}

      {loading && !summary ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-text-muted" /></div>
      ) : !summary ? null : view === 'project' ? (
        current ? (
          <ProjectView
            key={current.id}
            project={current}
            version={version}
            tab={tab}
            onTabChange={setTab}
            onBack={goOverview}
            onChanged={onChanged}
            onLogWork={() => setLogOpen(true)}
          />
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-text-muted">Project not found.</p>
            <button onClick={goOverview} className="text-sm text-accent-blue hover:underline">Back to overview</button>
          </div>
        )
      ) : view === 'projects' ? (
        <ProjectsManager
          projects={summary.projects}
          creating={creating}
          setCreating={v => goProjects(v)}
          onOpen={openProject}
          onChanged={onChanged}
        />
      ) : (
        <Overview summary={summary} onOpen={openProject} onCreate={() => goProjects(true)} />
      )}

      {/* Mobile FAB */}
      <button onClick={() => setLogOpen(true)} aria-label="Log work"
        className="sm:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-accent-blue hover:bg-accent-blue/90 text-white shadow-lg shadow-black/40 flex items-center justify-center">
        <Plus className="w-6 h-6" />
      </button>

      {logOpen && summary && (
        <LogWorkModal
          projects={activeProjects}
          defaultProjectId={current && !current.archived ? current.id : undefined}
          onClose={() => setLogOpen(false)}
          onLogged={onChanged}
          onCreateProject={() => { setLogOpen(false); goProjects(true) }}
        />
      )}
    </>
  )
}

export default function BillingPage() {
  const { state, error } = useBillingLock()

  if (state === 'checking') {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-text-muted" /></div>
  }
  if (state === 'error') {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="bg-bg-card rounded-xl border border-accent-red/30 p-6 max-w-md text-center">
          <AlertTriangle className="w-8 h-8 text-accent-red mx-auto mb-2" />
          <h2 className="text-lg font-bold text-accent-red mb-1">Billing unavailable</h2>
          <p className="text-sm text-text-secondary">{error}</p>
        </div>
      </div>
    )
  }
  if (state === 'locked') return <BillingLock />
  return <BillingContent />
}
