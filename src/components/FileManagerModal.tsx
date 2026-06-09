import { useState, useEffect, useCallback } from 'react'
import {
  X, Folder, FileText, ChevronRight, Home, Upload, FolderPlus, RotateCw,
  Trash2, Download, Pencil, Save, Loader2, ArrowLeft,
} from 'lucide-react'
import {
  listFiles, readFile, writeFile, uploadFiles, makeDir, renameEntry, deleteFile, downloadUrl,
} from '../hooks/useHosting'
import type { FileEntry } from '../types/hosting'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const join = (a: string, b: string) => (a ? `${a}/${b}` : b)

interface Props {
  slug: string
  siteName: string
  onClose: () => void
}

export default function FileManagerModal({ slug, siteName, onClose }: Props) {
  const [cwd, setCwd] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [openPath, setOpenPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editable, setEditable] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (dir: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await listFiles(slug, dir)
      setEntries(res.entries)
      setCwd(res.path)
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { load('') }, [load])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !openPath) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, openPath])

  const openFile = async (name: string) => {
    const p = join(cwd, name)
    setBusy(true)
    try {
      const res = await readFile(slug, p)
      setOpenPath(p)
      setContent(res.content)
      setEditable(res.editable)
      setDirty(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to open file')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!openPath) return
    setSaving(true)
    const res = await writeFile(slug, openPath, content)
    setSaving(false)
    if (res.success) { setDirty(false) }
    else setError(res.error || 'Failed to save')
  }

  const closeEditor = () => {
    if (dirty && !confirm('Unsaved changes will be lost. Close?')) return
    setOpenPath(null)
    setContent('')
  }

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    const res = await uploadFiles(slug, cwd, files)
    setBusy(false)
    if (res.success) load(cwd)
    else setError(res.error || 'Upload error')
  }

  const onMkdir = async () => {
    const name = prompt('New folder name:')
    if (!name) return
    setBusy(true)
    const res = await makeDir(slug, join(cwd, name))
    setBusy(false)
    if (res.success) load(cwd)
    else setError(res.error || 'Failed to create folder')
  }

  const onRename = async (entry: FileEntry) => {
    const next = prompt('New name:', entry.name)
    if (!next || next === entry.name) return
    setBusy(true)
    const res = await renameEntry(slug, join(cwd, entry.name), join(cwd, next))
    setBusy(false)
    if (res.success) load(cwd)
    else setError(res.error || 'Failed to rename')
  }

  const onDelete = async (entry: FileEntry) => {
    if (!confirm(`Delete ${entry.type === 'dir' ? 'folder' : 'file'} "${entry.name}"?`)) return
    setBusy(true)
    const res = await deleteFile(slug, join(cwd, entry.name))
    setBusy(false)
    if (res.success) load(cwd)
    else setError(res.error || 'Failed to delete')
  }

  const crumbs = cwd ? cwd.split('/') : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl mx-2 sm:mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-primary truncate">Files — {siteName}</h2>
            <p className="text-xs text-text-muted font-mono">/opt/static-sites/{slug}/{cwd}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="text-sm text-accent-red bg-accent-red/10 px-4 py-2 shrink-0">{error}</div>
        )}

        {openPath ? (
          /* ── Editor ── */
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border shrink-0">
              <button onClick={closeEditor} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to files
              </button>
              <span className="text-xs font-mono text-text-secondary truncate flex-1 text-center">{openPath}{dirty ? ' •' : ''}</span>
              {editable && (
                <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              )}
            </div>
            <div className="flex-1 overflow-hidden p-2">
              {editable ? (
                <textarea
                  value={content}
                  onChange={e => { setContent(e.target.value); setDirty(true) }}
                  spellCheck={false}
                  className="w-full h-full resize-none bg-bg-primary border border-border rounded-lg p-3 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-blue/50"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-text-muted">
                  <FileText className="w-10 h-10" />
                  <p className="text-sm">This file can't be edited in the browser (binary or too large).</p>
                  <a href={downloadUrl(slug, openPath)} className="flex items-center gap-1.5 text-accent-blue hover:underline text-sm">
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── File list ── */
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0 flex-wrap">
              <div className="flex items-center gap-1 text-sm min-w-0 flex-1 overflow-x-auto">
                <button onClick={() => load('')} className="p-1 rounded hover:bg-bg-secondary text-text-muted hover:text-text-primary shrink-0"><Home className="w-4 h-4" /></button>
                {crumbs.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="w-3 h-3 text-text-muted" />
                    <button onClick={() => load(crumbs.slice(0, i + 1).join('/'))} className="text-text-secondary hover:text-text-primary truncate max-w-[120px]">{c}</button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => load(cwd)} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors" title="Refresh"><RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
                <button onClick={onMkdir} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-accent-blue transition-colors" title="New folder"><FolderPlus className="w-4 h-4" /></button>
                <label className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-accent-green transition-colors cursor-pointer" title="Upload files">
                  <Upload className="w-4 h-4" />
                  <input type="file" multiple className="hidden" onChange={e => { onUpload(e.target.files); e.target.value = '' }} />
                </label>
              </div>
            </div>

            {/* Listing */}
            <div className="flex-1 overflow-y-auto p-2">
              {loading && entries.length === 0 ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
              ) : entries.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-12">This folder is empty. Upload files using the button above.</p>
              ) : (
                <div className="space-y-0.5">
                  {entries.map(entry => (
                    <div key={entry.name} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-card-hover transition-colors">
                      <button
                        onClick={() => entry.type === 'dir' ? load(join(cwd, entry.name)) : openFile(entry.name)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        {entry.type === 'dir'
                          ? <Folder className="w-4 h-4 text-accent-blue shrink-0" />
                          : <FileText className="w-4 h-4 text-text-muted shrink-0" />}
                        <span className="text-sm text-text-primary truncate">{entry.name}</span>
                      </button>
                      <span className="text-xs text-text-muted shrink-0 hidden sm:block">{entry.type === 'file' ? formatBytes(entry.size) : ''}</span>
                      <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {entry.type === 'file' && (
                          <a href={downloadUrl(slug, join(cwd, entry.name))} className="p-1.5 rounded text-text-muted hover:text-accent-blue hover:bg-bg-secondary transition-colors" title="Download"><Download className="w-3.5 h-3.5" /></a>
                        )}
                        <button onClick={() => onRename(entry)} className="p-1.5 rounded text-text-muted hover:text-accent-yellow hover:bg-bg-secondary transition-colors" title="Rename"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onDelete(entry)} className="p-1.5 rounded text-text-muted hover:text-accent-red hover:bg-bg-secondary transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {busy && (
              <div className="px-4 py-2 border-t border-border text-xs text-text-muted flex items-center gap-2 shrink-0"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
