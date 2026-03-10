import { useMonitor } from './hooks/useMonitor'
import Header from './components/Header'
import SystemOverview from './components/SystemOverview'
import SystemChart from './components/SystemChart'
import ProcessList from './components/ProcessList'
import SitesStatus from './components/SitesStatus'
import { Loader2 } from 'lucide-react'

function App() {
  const { data, loading, error, lastUpdate, refresh } = useMonitor(5000)

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
          <p className="text-text-muted">Connecting to server...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-bg-card rounded-xl border border-accent-red/30 p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-accent-red mb-2">Connection Error</h2>
          <p className="text-text-secondary mb-4">{error}</p>
          <p className="text-text-muted text-sm mb-4">
            Make sure the API server is running on port 4400.
          </p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-accent-blue rounded-lg text-white hover:bg-accent-blue/80 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen">
      <Header
        lastUpdate={lastUpdate}
        loading={loading}
        error={error}
        onRefresh={refresh}
        processCount={data.processes.length}
      />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <SystemOverview system={data.system} />
        <SitesStatus />
        <SystemChart />
        <div className="mb-4">
          <h2 className="text-xl font-bold text-text-primary mb-1">PM2 Processes</h2>
          <p className="text-sm text-text-muted">
            Total memory: {(data.processes.reduce((sum, p) => sum + p.memory, 0) / 1024 / 1024 / 1024).toFixed(2)} GB
          </p>
        </div>
        <ProcessList processes={data.processes} onAction={refresh} />
      </main>
    </div>
  )
}

export default App
