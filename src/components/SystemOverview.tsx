import { Cpu, HardDrive, MemoryStick, Network, Clock, Server } from 'lucide-react'
import type { SystemInfo } from '../types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function GaugeBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const barColor = pct > 90 ? 'bg-accent-red' : pct > 70 ? 'bg-accent-yellow' : color

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary font-mono">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function SystemOverview({ system }: { system: SystemInfo }) {

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {/* CPU */}
      <div className="bg-bg-card rounded-xl p-5 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent-blue/10 rounded-lg">
            <Cpu className="w-5 h-5 text-accent-blue" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-secondary">CPU</h3>
            <p className="text-xs text-text-muted">{system.cpu.brand}</p>
          </div>
        </div>
        <div className="text-xl sm:text-3xl font-bold font-mono mb-3">
          {system.cpu.currentLoad.toFixed(1)}%
        </div>
        <GaugeBar value={system.cpu.currentLoad} max={100} color="bg-accent-blue" label={`${system.cpu.cores} cores @ ${system.cpu.speed} GHz`} />
        <div className="mt-3 flex gap-1">
          {system.cpu.loadPerCore.map((load, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-8 bg-bg-primary rounded overflow-hidden flex flex-col-reverse">
                <div
                  className={`w-full transition-all duration-500 ${load > 90 ? 'bg-accent-red' : load > 70 ? 'bg-accent-yellow' : 'bg-accent-blue'}`}
                  style={{ height: `${load}%` }}
                />
              </div>
              <span className="text-[10px] text-text-muted">{i}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Memory */}
      <div className="bg-bg-card rounded-xl p-5 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent-purple/10 rounded-lg">
            <MemoryStick className="w-5 h-5 text-accent-purple" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-secondary">Memory</h3>
            <p className="text-xs text-text-muted">{formatBytes(system.memory.total)} total</p>
          </div>
        </div>
        <div className="text-xl sm:text-3xl font-bold font-mono mb-3">
          {formatBytes(system.memory.used)}
        </div>
        <GaugeBar value={system.memory.used} max={system.memory.total} color="bg-accent-purple" label="RAM Usage" />
        {system.memory.buffCache > 0 && (
          <p className="text-xs text-text-muted mt-1">
            Buffer/Cache: {formatBytes(system.memory.buffCache)}
          </p>
        )}
        {system.memory.swapTotal > 0 && (
          <div className="mt-2">
            <GaugeBar value={system.memory.swapUsed} max={system.memory.swapTotal} color="bg-accent-yellow" label={`Swap (${formatBytes(system.memory.swapTotal)})`} />
          </div>
        )}
      </div>

      {/* Disk */}
      <div className="bg-bg-card rounded-xl p-5 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent-cyan/10 rounded-lg">
            <HardDrive className="w-5 h-5 text-accent-cyan" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-secondary">Disk</h3>
            <p className="text-xs text-text-muted">{system.disk.mount}</p>
          </div>
        </div>
        <div className="text-xl sm:text-3xl font-bold font-mono mb-3">
          {system.disk.use.toFixed(1)}%
        </div>
        <GaugeBar value={system.disk.used} max={system.disk.total} color="bg-accent-cyan" label={`${formatBytes(system.disk.used)} / ${formatBytes(system.disk.total)}`} />
        <p className="text-xs text-text-muted mt-2">
          {formatBytes(system.disk.available)} available
        </p>
      </div>

      {/* Server Info */}
      <div className="bg-bg-card rounded-xl p-5 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent-green/10 rounded-lg">
            <Server className="w-5 h-5 text-accent-green" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-secondary">Server</h3>
            <p className="text-xs text-text-muted">{system.hostname}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-text-muted" />
            <span className="text-sm text-text-secondary">Uptime:</span>
            <span className="text-sm font-mono text-text-primary">{formatUptime(system.uptime)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-text-muted" />
            <span className="text-sm text-text-secondary">OS:</span>
            <span className="text-sm text-text-primary">{system.distro}</span>
          </div>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-text-muted" />
            <div className="text-sm">
              <span className="text-accent-green">↓ {formatBytes(system.network.rx_sec)}/s</span>
              <span className="text-text-muted mx-1">/</span>
              <span className="text-accent-blue">↑ {formatBytes(system.network.tx_sec)}/s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
