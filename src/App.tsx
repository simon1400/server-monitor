import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router'
import { useMonitor } from './hooks/useMonitor'
import Header from './components/Header'
import OverviewPage from './pages/OverviewPage'
import DiskPage from './pages/DiskPage'
import SeoPage from './pages/SeoPage'
import ProcessesPage from './pages/ProcessesPage'
import LoginPage from './components/LoginPage'
import { Loader2 } from 'lucide-react'

function Dashboard() {
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
    <div className="min-h-screen overflow-x-hidden">
      <Header
        lastUpdate={lastUpdate}
        loading={loading}
        error={error}
        onRefresh={refresh}
        processCount={data.processes.length}
      />
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Routes>
          <Route path="/" element={<OverviewPage data={data} />} />
          <Route path="/apps" element={<ProcessesPage data={data} onAction={refresh} />} />
          <Route path="/seo" element={<SeoPage />} />
          <Route path="/disk" element={<DiskPage />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/check')
      .then(res => res.json())
      .then(json => { if (!cancelled) setAuthenticated(json.authenticated) })
      .catch(() => { if (!cancelled) setAuthenticated(false) })
    return () => { cancelled = true }
  }, [])

  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
      </div>
    )
  }

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />
  }

  return <Dashboard />
}

export default App
