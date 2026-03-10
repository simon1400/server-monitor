import { useState, useEffect, useCallback } from 'react'
import { Routes, Route } from 'react-router'
import { useMonitor } from './hooks/useMonitor'
import Header from './components/Header'
import OverviewPage from './pages/OverviewPage'
import SitesPage from './pages/SitesPage'
import DiskPage from './pages/DiskPage'
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
    <div className="min-h-screen">
      <Header
        lastUpdate={lastUpdate}
        loading={loading}
        error={error}
        onRefresh={refresh}
        processCount={data.processes.length}
      />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<OverviewPage data={data} />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/disk" element={<DiskPage />} />
          <Route path="/processes" element={<ProcessesPage data={data} onAction={refresh} />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/check')
      const json = await res.json()
      setAuthenticated(json.authenticated)
    } catch {
      setAuthenticated(false)
    }
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

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
