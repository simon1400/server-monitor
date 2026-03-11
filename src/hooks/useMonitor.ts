import { useState, useEffect, useCallback, useRef } from 'react'
import type { MonitorData, ProcessLog } from '../types'

const API_BASE = '/api'

export function useMonitor(interval = 5000) {
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number>(0)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/monitor`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastUpdate(Date.now())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, interval)
    return () => clearInterval(id)
  }, [fetchData, interval])

  return { data, loading, error, lastUpdate, refresh: fetchData }
}

export function useSystemHistory() {
  const [history, setHistory] = useState<any[]>([])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/system/history`)
      if (!res.ok) return
      const json = await res.json()
      setHistory(json)
    } catch {}
  }, [])

  useEffect(() => {
    fetchHistory()
    const id = setInterval(fetchHistory, 30000)
    return () => clearInterval(id)
  }, [fetchHistory])

  return history
}

export function useProcessLogs(processId: number | null, lines = 100) {
  const [logs, setLogs] = useState<ProcessLog[]>([])
  const [loading, setLoading] = useState(false)

  const fetchLogs = useCallback(async () => {
    if (processId === null) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/processes/${processId}/logs?lines=${lines}`)
      if (!res.ok) return
      const json = await res.json()
      setLogs(json)
    } catch {} finally {
      setLoading(false)
    }
  }, [processId, lines])

  useEffect(() => {
    fetchLogs()
    const id = setInterval(fetchLogs, 10000)
    return () => clearInterval(id)
  }, [fetchLogs])

  return { logs, loading, refresh: fetchLogs }
}

export async function restartProcess(id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/processes/${id}/restart`, { method: 'POST' })
    return res.ok
  } catch {
    return false
  }
}

export async function stopProcess(id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/processes/${id}/stop`, { method: 'POST' })
    return res.ok
  } catch {
    return false
  }
}

export async function getProcessEnv(name: string): Promise<{ entries: { key: string; value: string }[]; cwd: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/processes/${encodeURIComponent(name)}/env`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function saveProcessEnv(name: string, entries: { key: string; value: string }[]): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/processes/${encodeURIComponent(name)}/env`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export async function deployProcess(name: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/processes/${encodeURIComponent(name)}/deploy`, { method: 'POST' })
    return await res.json()
  } catch {
    return { success: false, steps: [], error: 'Network error' }
  }
}
