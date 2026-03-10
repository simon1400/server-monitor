import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useSystemHistory } from '../hooks/useMonitor'
import { Activity } from 'lucide-react'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024)
  return gb.toFixed(1) + ' GB'
}

export default function SystemChart() {
  const history = useSystemHistory()

  if (history.length < 2) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-accent-blue" />
          <h2 className="text-lg font-semibold">System History</h2>
        </div>
        <p className="text-text-muted text-sm text-center py-8">
          Collecting data... Chart will appear after a few data points.
        </p>
      </div>
    )
  }

  const data = history.map((h) => ({
    time: h.timestamp,
    cpu: h.cpuLoad,
    memory: (h.memoryUsed / h.memoryTotal) * 100,
    memoryUsed: h.memoryUsed,
  }))

  return (
    <div className="bg-bg-card rounded-xl border border-border p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-accent-blue" />
        <h2 className="text-lg font-semibold">System History</h2>
        <span className="text-xs text-text-muted ml-auto">{history.length} data points (30s interval)</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              stroke="#64748b"
              fontSize={11}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              stroke="#64748b"
              fontSize={11}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f1f5f9',
                fontSize: '12px',
              }}
              labelFormatter={(label: any) => formatTime(label as number)}
              formatter={(value: any, name: any) => {
                const v = Number(value)
                if (name === 'cpu') return [`${v.toFixed(1)}%`, 'CPU']
                if (name === 'memory') return [`${v.toFixed(1)}%`, 'Memory']
                return [v, name]
              }}
            />
            <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} name="cpu" />
            <Line type="monotone" dataKey="memory" stroke="#a855f7" strokeWidth={2} dot={false} name="memory" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-2 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-accent-blue rounded" />
          <span className="text-xs text-text-secondary">CPU</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-accent-purple rounded" />
          <span className="text-xs text-text-secondary">Memory</span>
        </div>
      </div>
    </div>
  )
}
