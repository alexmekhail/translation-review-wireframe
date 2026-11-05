import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'
import { wordDiff } from '../diff'
import { api, ApiError, type ApiBook, type ApiParagraph, type MyEdit } from './api'
import { BackendBanner, ErrorBox, RequestLogPanel } from './RequestLog'
import { toDocStatus } from './status'

type Load = { state: 'loading' } | { state: 'error'; error: ApiError } | { state: 'ok'; book: ApiBook }

/** #/live/:id — one real book: aligned paragraphs (R4), save corrections (R6), rename (R8), retry (R5), done (R7). */
export function LiveBook({ bookId }: { bookId?: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  const refresh = useCallback(async () => {
    if (!bookId) return
    try {
      setLoad({ state: 'ok', book: await api.getBook(bookId) })
    } catch (e) {
      setLoad({ state: 'error', error: e as ApiError })
    }
  }, [bookId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll while drafts are being produced.
  const pipeline = load.state === 'ok' ? load.book.pipeline_status : null
  useEffect(() => {
    if (pipeline !== 'uploaded' && pipeline !== 'translating') return
    const t = window.setInterval(() => void refresh(), 1000)
    return () => window.clearInterval(t)
  }, [pipeline, refresh])

  const replaceEdit = (paragraphId: string, edit: MyEdit) =>
    setLoad((l) =>
      l.state === 'ok'
        ? { ...l, book: { ...l.book, paragraphs: l.book.paragraphs.map((p) => (p.id === paragraphId ? { ...p, my_edit: edit } : p)) } }
        : l,
    )

  return (
    <main className="mx-auto max-w-6xl p-4">
      <BackendBanner />
      <a href="#/live" className="text-sm underline">
        ← Back to live books
      </a>
      {load.state === 'loading' && <p className="mt-3 text-sm text-gray-500">Loading book…</p>}
      {load.state === 'error' && (
        <div className="mt-3">
          <ErrorBox error={load.error} onRetry={() => void refresh()} />
        </div>
      )}
      {load.state === 'ok' && <BookView book={load.book} onChanged={refresh} onEditSaved={replaceEdit} />}
      <RequestLogPanel />
    </main>
  )
}

function BookView({
  book,
  onChanged,
  onEditSaved,
}: {
  book: ApiBook
  onChanged: () => Promise<void>
  onEditSaved: (paragraphId: string, edit: MyEdit) => void
}) {
  const [actionError, setActionError] = useState<ApiError | null>(null)
  const total = book.paragraphs.length
  const translated = book.paragraphs.filter((p) => p.translation_status === 'translated').length
  const done = book.paragraphs.filter((p) => p.my_edit?.is_done).length
  const reviewable = book.pipeline_status === 'ready'

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setActionError(e as ApiError)
    }
  }

  return (
    <>
      <header className="mt-2 flex flex-wrap items-center gap-2">
        <TitleEditor book={book} onRenamed={onChanged} />
        <StatusBadge status={toDocStatus(book.pipeline_status, book.completed_at)} />
      </header>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <ProgressBar value={reviewable ? done : translated} total={total} />
          <span className="whitespace-nowrap text-xs text-gray-600" data-testid="progress">
            {reviewable ? `${done} / ${total} done` : `${translated} / ${total} translated`}
          </span>
        </div>
        {book.pipeline_status === 'failed' && (
          <button className="btn" onClick={() => void act(() => api.retry(book.id))}>
            ↻ Retry failed
          </button>
        )}
        {reviewable && (
          <button
            className={`btn ${book.completed_at ? '' : 'btn-primary'}`}
            onClick={() => void act(() => api.setCompleted(book.id, !book.completed_at))}
          >
            {book.completed_at ? '✓ Book done · Undo' : 'Mark book done'}
          </button>
        )}
      </div>
      {actionError && (
        <div className="mt-2">
          <ErrorBox error={actionError} />
        </div>
      )}
      {!reviewable && (
        <p className="mt-2 border-l-4 border-gray-900 pl-2 text-sm" role="status">
          {book.pipeline_status === 'failed'
            ? 'Some paragraphs could not be translated. Retry them before reviewing.'
            : 'Machine drafts are being produced. This page refreshes every second.'}
        </p>
      )}

      <div className="mb-2 mt-4 hidden grid-cols-2 gap-4 md:grid">
        <div className="label">Arabic (source, read-only)</div>
        <div className="label">English (your correction)</div>
      </div>
      <ol className="space-y-4" data-testid="paragraphs">
        {book.paragraphs.map((p) => (
          <ParagraphRow key={p.id} bookId={book.id} p={p} editable={reviewable} onSaved={(e) => onEditSaved(p.id, e)} />
        ))}
      </ol>
    </>
  )
}

function TitleEditor({ book, onRenamed }: { book: ApiBook; onRenamed: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(book.title)
  const [error, setError] = useState<ApiError | null>(null)

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold" data-testid="book-title">
          {book.title}
        </h1>
        {book.is_owner && (
          <button className="text-xs underline" onClick={() => (setTitle(book.title), setEditing(true))}>
            Rename
          </button>
        )}
      </div>
    )
  }
  const save = async () => {
    try {
      await api.rename(book.id, title)
      setEditing(false)
      setError(null)
      await onRenamed()
    } catch (e) {
      setError(e as ApiError)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        aria-label="Book title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded border border-gray-500 px-2 py-1 text-lg"
      />
      <button className="btn btn-primary" onClick={() => void save()}>
        Save title
      </button>
      <button className="btn" onClick={() => (setEditing(false), setError(null))}>
        Cancel
      </button>
      {error && <span className="text-sm font-semibold">⚠ {error.message}</span>}
    </div>
  )
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; error: ApiError } | { kind: 'conflict'; current: MyEdit | null }

function ParagraphRow({
  bookId,
  p,
  editable,
  onSaved,
}: {
  bookId: string
  p: ApiParagraph
  editable: boolean
  onSaved: (edit: MyEdit) => void
}) {
  const saved = p.my_edit?.text_en ?? p.machine_en ?? ''
  const [draft, setDraft] = useState(saved)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [showDiff, setShowDiff] = useState(false)
  // Shown immediately while a done-toggle is in flight; cleared (reverted) when the save settles.
  const [pendingDone, setPendingDone] = useState<boolean | null>(null)
  const dirty = draft !== saved
  const version = p.my_edit?.version ?? 0

  // Pick up machine text when it arrives (translating → ready) unless the reviewer has typed.
  useEffect(() => {
    if (!dirty) setDraft(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const send = async (body: { text_en?: string; is_done?: boolean }) => {
    setSave({ kind: 'saving' })
    if (body.is_done !== undefined) setPendingDone(body.is_done)
    try {
      const edit = await api.saveEdit(bookId, p.id, { base_version: version, ...body })
      onSaved(edit)
      setSave({ kind: 'saved' })
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'version_conflict') setSave({ kind: 'conflict', current: (err.body.current as MyEdit | null) ?? null })
      else setSave({ kind: 'failed', error: err }) // the draft stays in the box
    } finally {
      setPendingDone(null)
    }
  }

  return (
    <li className={`box p-3 ${p.my_edit?.is_done ? 'bg-gray-50' : ''}`} data-testid={`paragraph-${p.position}`}>
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>¶ {p.position}</span>
        <span>
          {p.translation_status !== 'translated'
            ? p.translation_status === 'failed'
              ? '✕ translation failed'
              : '◌ waiting for draft'
            : p.my_edit && p.my_edit.text_en !== p.machine_en
              ? `Edited · v${p.my_edit.version}`
              : 'Machine text'}
          {p.my_edit?.is_done && ' · Done'}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <p dir="rtl" lang="ar" className="rounded border border-gray-300 bg-gray-100 p-2 font-arabic text-lg leading-loose">
          {p.source_ar}
        </p>
        <div>
          <textarea
            dir="ltr"
            lang="en"
            rows={3}
            aria-label={`English translation, paragraph ${p.position}`}
            disabled={!editable || p.translation_status !== 'translated'}
            className="block w-full rounded border border-gray-500 p-2 text-base leading-relaxed disabled:bg-gray-50"
            value={draft}
            onChange={(e) => (setDraft(e.target.value), save.kind === 'saved' && setSave({ kind: 'idle' }))}
          />
          {showDiff && p.machine_en && <Diff a={p.machine_en} b={draft} />}
        </div>
      </div>
      {editable && p.translation_status === 'translated' && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 pt-2 text-sm">
          <button className="btn btn-primary" disabled={!dirty || save.kind === 'saving'} onClick={() => void send({ text_en: draft })}>
            {save.kind === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={pendingDone ?? p.my_edit?.is_done ?? false}
              disabled={save.kind === 'saving'}
              onChange={(e) => void send({ is_done: e.target.checked })}
            />
            Mark done
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
            Show diff
          </label>
          <span className="ml-auto text-xs" role="status" data-testid={`save-state-${p.position}`}>
            {save.kind === 'saved' && !dirty && 'Saved ✓'}
            {dirty && save.kind !== 'conflict' && save.kind !== 'failed' && 'Unsaved changes'}
          </span>
        </div>
      )}
      {save.kind === 'failed' && (
        <div className="mt-2 rounded border-2 border-dashed border-gray-900 bg-gray-100 p-2 text-sm" role="alert">
          ⚠ Save failed: {save.error.message} Your text is still in the box.{' '}
          <button className="underline" onClick={() => void send({ text_en: draft })}>
            Retry
          </button>
        </div>
      )}
      {save.kind === 'conflict' && (
        <div className="mt-2 rounded border-2 border-dashed border-gray-900 bg-gray-100 p-2 text-sm" role="alert" data-testid="conflict">
          ⚠ This paragraph was saved somewhere else since you loaded it. Saved version
          {save.current ? ` (v${save.current.version})` : ''}: <q>{save.current?.text_en ?? '—'}</q>. Your text is still in the box.{' '}
          <button
            className="underline"
            onClick={() => {
              if (save.current) {
                onSaved(save.current)
                setDraft(save.current.text_en)
              }
              setSave({ kind: 'idle' })
            }}
          >
            Use the saved version
          </button>
          {' · '}
          <button
            className="underline"
            onClick={() => {
              if (save.current) onSaved(save.current) // adopt the server version number, keep my text
              setSave({ kind: 'idle' })
            }}
          >
            Keep mine (then Save)
          </button>
        </div>
      )}
    </li>
  )
}

function Diff({ a, b }: { a: string; b: string }) {
  const ops = wordDiff(a, b)
  return (
    <div className="mt-2 rounded border border-dashed border-gray-500 p-2 text-sm leading-relaxed">
      <div className="label mb-1">Machine → yours</div>
      {ops.every((o) => o.type === 'same') ? (
        <span className="text-gray-500">No changes from machine text.</span>
      ) : (
        ops.map((o, i) => (
          <span key={i}>
            {o.type === 'del' ? (
              <del className="bg-red-100 text-red-700">{o.text}</del>
            ) : o.type === 'ins' ? (
              <ins className="bg-green-100 text-green-800 no-underline">{o.text}</ins>
            ) : (
              o.text
            )}{' '}
          </span>
        ))
      )}
    </div>
  )
}
