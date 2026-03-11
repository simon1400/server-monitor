import { RotateCw, CircleStop, ChevronDown, ChevronUp, AlertTriangle, Clock, Cpu, MemoryStick, Rocket, CheckCircle, XCircle, Loader2, Globe } from 'lucide-react'
import { useState } from 'react'
import type { PM2Process } from '../types'
import { restartProcess, stopProcess, deployProcess } from '../hooks/useMonitor'
import ProcessLogs from './ProcessLogs'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const statusColors: Record<string, string> = {
  online: 'bg-accent-green',
  stopping: 'bg-accent-yellow',
  stopped: 'bg-text-muted',
  errored: 'bg-accent-red',
  launching: 'bg-accent-blue',
}

const statusBg: Record<string, string> = {
  online: 'bg-accent-green/10 text-accent-green',
  stopping: 'bg-accent-yellow/10 text-accent-yellow',
  stopped: 'bg-text-muted/10 text-text-muted',
  errored: 'bg-accent-red/10 text-accent-red',
  launching: 'bg-accent-blue/10 text-accent-blue',
}

interface DeployResult {
  success: boolean
  steps: { name: string; success: boolean; output: string }[]
  error?: string
}

export default function ProcessCard({ process, onAction }: { process: PM2Process; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null)
  const isHttpBad = process.status === 'online' && process.httpOk === false
  const isProblematic = process.restarts > 5 || process.status === 'errored' || isHttpBad

  const handleRestart = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setActionLoading(true)
    await restartProcess(process.pm_id)
    setTimeout(onAction, 1500)
    setActionLoading(false)
  }

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Stop "${process.name}"?`)) return
    setActionLoading(true)
    await stopProcess(process.pm_id)
    setTimeout(onAction, 1500)
    setActionLoading(false)
  }

  const handleDeploy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Deploy "${process.name}"?\n\nThis will: git pull → npm install → npm run build → pm2 restart`)) return
    setDeploying(true)
    setDeployResult(null)
    setExpanded(true)
    const result = await deployProcess(process.name)
    setDeployResult(result)
    setDeploying(false)
    if (result.success) setTimeout(onAction, 2000)
  }

  return (
    <div className={`bg-bg-card rounded-xl border transition-all duration-200 ${isProblematic ? 'border-accent-red/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-border hover:border-border/80'}`}>
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColors[process.status]} ${process.status === 'online' ? 'animate-pulse' : ''}`} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-text-primary">{process.name}</h3>
                <span className="text-xs text-text-muted font-mono">#{process.pm_id}</span>
                {isProblematic && (
                  <AlertTriangle className="w-4 h-4 text-accent-red" />
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[process.status]}`}>
                {process.status}
              </span>
              {isHttpBad && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent-red/10 text-accent-red flex items-center gap-1" title={`${process.httpDomain} returned HTTP ${process.httpStatus ?? 'error'}`}>
                  <Globe className="w-3 h-3" />
                  HTTP {process.httpStatus ?? 'err'}
                </span>
              )}
              {process.status === 'online' && process.httpOk === true && process.httpDomain && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent-green/10 text-accent-green flex items-center gap-1" title={`${process.httpDomain} is healthy`}>
                  <Globe className="w-3 h-3" />
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Metrics */}
            <div className="hidden md:flex items-center gap-6">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-text-muted" />
                <span className={`font-mono text-sm ${process.cpu > 80 ? 'text-accent-red' : process.cpu > 50 ? 'text-accent-yellow' : 'text-text-secondary'}`}>
                  {process.cpu.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <MemoryStick className="w-3.5 h-3.5 text-text-muted" />
                <span className="font-mono text-sm text-text-secondary">{formatBytes(process.memory)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                <span className="font-mono text-sm text-text-secondary">{formatUptime(process.uptime)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RotateCw className="w-3.5 h-3.5 text-text-muted" />
                <span className={`font-mono text-sm ${process.restarts > 5 ? 'text-accent-red font-bold' : 'text-text-secondary'}`}>
                  {process.restarts}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleDeploy}
                disabled={actionLoading || deploying}
                className="p-1.5 rounded-lg hover:bg-accent-purple/10 text-text-muted hover:text-accent-purple transition-colors disabled:opacity-50"
                title="Deploy (pull + install + build + restart)"
              >
                {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              </button>
              <button
                onClick={handleRestart}
                disabled={actionLoading || deploying}
                className="p-1.5 rounded-lg hover:bg-accent-blue/10 text-text-muted hover:text-accent-blue transition-colors disabled:opacity-50"
                title="Restart"
              >
                <RotateCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleStop}
                disabled={actionLoading || deploying || process.status === 'stopped'}
                className="p-1.5 rounded-lg hover:bg-accent-red/10 text-text-muted hover:text-accent-red transition-colors disabled:opacity-50"
                title="Stop process"
              >
                <CircleStop className="w-4 h-4" />
              </button>
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              )}
            </div>
          </div>
        </div>

        {/* Mobile metrics */}
        <div className="flex md:hidden items-center gap-4 mt-3 text-xs">
          <span className="font-mono text-text-secondary">CPU: {process.cpu.toFixed(1)}%</span>
          <span className="font-mono text-text-secondary">MEM: {formatBytes(process.memory)}</span>
          <span className="font-mono text-text-secondary">↻ {process.restarts}</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border">
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-text-muted block">PID</span>
              <span className="font-mono text-text-primary">{process.pid}</span>
            </div>
            <div>
              <span className="text-text-muted block">Version</span>
              <span className="font-mono text-text-primary">{process.version}</span>
            </div>
            <div>
              <span className="text-text-muted block">Node</span>
              <span className="font-mono text-text-primary">{process.node_version}</span>
            </div>
            <div>
              <span className="text-text-muted block">Mode</span>
              <span className="font-mono text-text-primary">{process.exec_mode}</span>
            </div>
            {/* Heap info from axm_monitor */}
            {process.axm_monitor['Used Heap Size'] && (
              <>
                <div>
                  <span className="text-text-muted block">Heap Used</span>
                  <span className="font-mono text-text-primary">
                    {process.axm_monitor['Used Heap Size'].value} {process.axm_monitor['Used Heap Size'].unit}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block">Heap Total</span>
                  <span className="font-mono text-text-primary">
                    {process.axm_monitor['Heap Size'].value} {process.axm_monitor['Heap Size'].unit}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block">Heap Usage</span>
                  <span className="font-mono text-text-primary">
                    {process.axm_monitor['Heap Usage'].value}%
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block">Event Loop</span>
                  <span className="font-mono text-text-primary">
                    {process.axm_monitor['Event Loop Latency']?.value} {process.axm_monitor['Event Loop Latency']?.unit}
                  </span>
                </div>
              </>
            )}
          </div>
          {/* Deploy status */}
          {(deploying || deployResult) && (
            <div className="border-t border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Rocket className="w-4 h-4 text-accent-purple" />
                <span className="text-sm font-semibold text-text-primary">Deploy</span>
                {deploying && <Loader2 className="w-4 h-4 animate-spin text-accent-purple" />}
                {deployResult && !deploying && (
                  deployResult.success
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-accent-green/15 text-accent-green">Success</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-accent-red/15 text-accent-red">Failed</span>
                )}
              </div>
              {deployResult && (
                <div className="space-y-2">
                  {deployResult.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {step.success
                        ? <CheckCircle className="w-4 h-4 text-accent-green shrink-0 mt-0.5" />
                        : <XCircle className="w-4 h-4 text-accent-red shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-text-primary">{step.name}</span>
                        <pre className="text-xs text-text-muted mt-1 bg-[#0a0a0a] rounded p-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                          {step.output || 'OK'}
                        </pre>
                      </div>
                    </div>
                  ))}
                  {deployResult.error && (
                    <div className="text-xs text-accent-red bg-accent-red/10 rounded p-2 mt-2">
                      {deployResult.error}
                    </div>
                  )}
                </div>
              )}
              {deploying && !deployResult && (
                <div className="text-sm text-text-muted">Running: git pull → npm install → build → restart...</div>
              )}
            </div>
          )}
          <ProcessLogs processId={process.pm_id} />
        </div>
      )}
    </div>
  )
}
