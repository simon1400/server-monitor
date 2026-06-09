import { useState, useEffect, useCallback } from 'react'
import type { ManagedSite, StepResult, FileEntry } from '../types/hosting'

const API = '/api/hosting'

export function useHostingSites(interval = 15000) {
  const [sites, setSites] = useState<ManagedSite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sites`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSites(await res.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [refresh, interval])

  return { sites, loading, error, refresh }
}

export async function createSite(name: string, domain: string): Promise<{ success: boolean; slug?: string; error?: string }> {
  try {
    const res = await fetch(`${API}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, domain }),
    })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

// Upload zip with progress via XHR
export function uploadZip(
  slug: string,
  file: File,
  mode: 'replace' | 'merge',
  onProgress?: (pct: number) => void,
): Promise<StepResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/sites/${slug}/upload?mode=${mode}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)) }
      catch { resolve({ steps: [], success: false, error: `HTTP ${xhr.status}` }) }
    }
    xhr.onerror = () => resolve({ steps: [], success: false, error: 'Network error during upload' })
    const fd = new FormData()
    fd.append('file', file)
    xhr.send(fd)
  })
}

export async function setupDomain(slug: string, domain: string, www: boolean): Promise<StepResult> {
  try {
    const res = await fetch(`${API}/sites/${slug}/domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, www }),
    })
    return await res.json()
  } catch {
    return { steps: [], success: false, error: 'Network error' }
  }
}

export async function deleteSite(slug: string, removeCert: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/sites/${slug}?removeCert=${removeCert}`, { method: 'DELETE' })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

// ── File manager ──
export async function listFiles(slug: string, path: string): Promise<{ path: string; entries: FileEntry[] }> {
  const res = await fetch(`${API}/sites/${slug}/files?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
  return await res.json()
}

export async function readFile(slug: string, path: string): Promise<{ content: string; size: number; editable: boolean }> {
  const res = await fetch(`${API}/sites/${slug}/file?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
  return await res.json()
}

export async function writeFile(slug: string, path: string, content: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/sites/${slug}/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export async function uploadFiles(slug: string, path: string, files: FileList | File[]): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))
    const res = await fetch(`${API}/sites/${slug}/files/upload?path=${encodeURIComponent(path)}`, { method: 'POST', body: fd })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export async function makeDir(slug: string, path: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/sites/${slug}/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export async function renameEntry(slug: string, from: string, to: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/sites/${slug}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export async function deleteFile(slug: string, path: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/sites/${slug}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export function downloadUrl(slug: string, path: string): string {
  return `${API}/sites/${slug}/file?download=1&path=${encodeURIComponent(path)}`
}
