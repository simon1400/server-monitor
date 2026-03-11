import ProcessList from '../components/ProcessList'
import type { MonitorData } from '../types'

export default function ProcessesPage({ data, onAction }: { data: MonitorData; onAction: () => void }) {
  return (
    <>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-text-primary mb-1">Apps</h2>
        <p className="text-sm text-text-muted">
          {data.processes.length} processes &middot; {data.sites.length} domains &middot; Total memory: {(data.processes.reduce((sum, p) => sum + p.memory, 0) / 1024 / 1024 / 1024).toFixed(2)} GB
        </p>
      </div>
      <ProcessList processes={data.processes} sites={data.sites} onAction={onAction} />
    </>
  )
}
