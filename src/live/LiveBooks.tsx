import { useCallback, useEffect, useRef, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'
import { go } from '../router'
import { api, ApiError, type ApiBookSummary } from './api'
import { BackendBanner, ErrorBox, RequestLogPanel } from './RequestLog'
import { toDocStatus } from './status'

type Load = { state: 'loading' } | { state: 'error'; error: ApiError } | { state: 'ok'; books: ApiBookSummary[] }

/** #/live — books from the real backend: list (R3), create (R1), delete (R9). */
export function LiveBooks() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoad((l) => (l.state === 'ok' ? l : { state: 'loading' }))
    try {
      setLoad({ state: 'ok', books: (await api.listBooks()).books })
    } catch (e) {
      setLoad({ state: 'error', error: e as ApiError })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const remove = async (b: ApiBookSummary) => {
    if (!window.confirm(`Delete “${b.title}” and all review work on it? This cannot be undone.`)) return
    try {
      await api.deleteBook(b.id)
      setNotice(`Deleted “${b.title}”.`)
      await refresh()
    } catch (e) {
      setNotice(`Delete failed: ${(e as ApiError).message}`)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4">
      <BackendBanner />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">My books (live)</h1>
        <button className="btn" onClick={() => void refresh()}>
          ↻ Refresh
        </button>
      </div>

      <UploadForm onCreated={(id) => go(`/live/${id}`)} />

      {notice && (
        <div className="mb-3 rounded border border-gray-400 bg-gray-100 px-2 py-1 text-sm" role="status">
          {notice}
        </div>
      )}

      {load.state === 'loading' && <p className="text-sm text-gray-500">Loading books…</p>}
      {load.state === 'error' && <ErrorBox error={load.error} onRetry={() => void refresh()} />}
      {load.state === 'ok' && load.books.length === 0 && (
        <div className="box border-dashed px-4 py-10 text-center text-sm text-gray-500" data-testid="empty-list">
          No books yet. Upload an Arabic .txt file above.
        </div>
      )}
      {load.state === 'ok' && load.books.length > 0 && (
        <ul className="space-y-3" data-testid="book-list">
          {load.books.map((b) => {
            const translating = b.pipeline_status !== 'ready'
            return (
              <li key={b.id} className="box p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <a href={`#/live/${b.id}`} className="font-medium underline">
                    {b.title}
                  </a>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={toDocStatus(b.pipeline_status, b.completed_at)} />
                    {b.is_owner && (
                      <button className="text-xs underline" onClick={() => void remove(b)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <ProgressBar value={translating ? b.translated_count : b.done_count} total={b.paragraph_count} />
                  <div className="mt-1 text-xs text-gray-600">
                    {translating
                      ? `${b.translated_count} / ${b.paragraph_count} paragraphs translated`
                      : `${b.done_count} / ${b.paragraph_count} paragraphs done`}
                    {' · '}uploaded {b.created_at.slice(0, 10)}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <RequestLogPanel />
    </main>
  )
}

function UploadForm({ onCreated }: { onCreated: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.createBook(file, title.trim() || undefined)
      onCreated(created.id)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="box mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="label">Arabic text file (.txt, paragraphs separated by blank lines)</span>
        <input ref={fileRef} type="file" accept=".txt,.docx,.pdf" required className="text-sm" data-testid="upload-file" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="label">Title (optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-gray-500 px-2 py-1" />
      </label>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload & translate'}
      </button>
      {error && (
        <div className="sm:w-full">
          <ErrorBox error={error} />
        </div>
      )}
    </form>
  )
}
