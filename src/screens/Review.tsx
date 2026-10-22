import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { doneCount, useStore } from '../store'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'
import { SaveFailedBanner, SaveIndicator } from '../components/SaveIndicator'
import { wordDiff } from '../diff'
import { NotFound } from './Translating'
import type { Paragraph } from '../types'

export function Review({ docId }: { docId?: string }) {
  const { docs, updateParagraph, setDocStatus } = useStore()
  const doc = docs.find((d) => d.id === docId)
  const [active, setActive] = useState(-1)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 2500)
    return () => window.clearTimeout(t)
  }, [notice])

  if (!doc) return <NotFound />

  const total = doc.paragraphs.length
  const done = doneCount(doc)
  const isDocDone = doc.status === 'done'

  const nextUnreviewed = () => {
    const n = doc.paragraphs.length
    for (let k = 1; k <= n; k++) {
      const i = (active + k + n) % n
      if (!doc.paragraphs[i].done) {
        setActive(i)
        const el = document.getElementById(`para-${doc.paragraphs[i].id}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const ta = el?.querySelector('textarea')
        ta?.focus({ preventScroll: true })
        ta?.setSelectionRange(ta.value.length, ta.value.length)
        return
      }
    }
    setNotice('All paragraphs are marked done.')
  }

  const toggleDocDone = () => {
    if (isDocDone) {
      setDocStatus(doc.id, 'in_review')
      return
    }
    if (done < total && !window.confirm(`${total - done} paragraph(s) aren’t marked done yet. Mark the document done anyway?`))
      return
    setDocStatus(doc.id, 'done')
    setNotice('Document marked done. You can still edit it.')
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-gray-400 bg-white/95 backdrop-blur">
        <SaveFailedBanner />
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <a href="#/docs" className="shrink-0 text-sm underline" aria-label="Back to documents">
                ←
              </a>
              <h1 className="truncate text-lg font-semibold">{doc.title}</h1>
              <StatusBadge status={doc.status} />
            </div>
            <SaveIndicator />
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2">
              <ProgressBar value={done} total={total} />
              <span className="whitespace-nowrap text-xs text-gray-600">
                {done} / {total} done
              </span>
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1 sm:flex-none" onClick={nextUnreviewed}>
                Next unreviewed ↓
              </button>
              <button className={`btn flex-1 sm:flex-none ${isDocDone ? '' : 'btn-primary'}`} onClick={toggleDocDone}>
                {isDocDone ? '✓ Document done · Undo' : 'Mark document done'}
              </button>
            </div>
          </div>
          {notice && (
            <div className="mt-2 rounded border border-gray-400 bg-gray-100 px-2 py-1 text-xs" role="status">
              {notice}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <div className="mb-2 hidden grid-cols-2 gap-4 md:grid">
          <div className="label">Arabic (source, read-only)</div>
          <div className="label">English (editable)</div>
        </div>
        <ol className="space-y-4">
          {doc.paragraphs.map((p, i) => (
            <PairRow
              key={p.id}
              index={i}
              p={p}
              active={i === active}
              onFocus={() => setActive(i)}
              onChange={(patch) => updateParagraph(doc.id, p.id, patch)}
            />
          ))}
        </ol>
      </main>
    </>
  )
}

function PairRow({
  index,
  p,
  active,
  onFocus,
  onChange,
}: {
  index: number
  p: Paragraph
  active: boolean
  onFocus: () => void
  onChange: (patch: Partial<Paragraph>) => void
}) {
  const [showDiff, setShowDiff] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const machine = p.machine ?? ''
  const edited = p.current !== machine

  // Auto-grow the textarea to fit its content
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [p.current])

  return (
    <li
      id={`para-${p.id}`}
      className={`box p-3 ${active ? 'outline outline-2 outline-offset-2 outline-gray-900' : ''} ${p.done ? 'bg-gray-50' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>¶ {index + 1}</span>
        <span>
          {edited ? 'Edited' : 'Machine text'}
          {p.done && ' · Done'}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="label mb-1 md:hidden">Arabic</div>
          <p
            dir="rtl"
            lang="ar"
            className="rounded border border-gray-300 bg-gray-100 md:h-full p-2 font-arabic text-lg leading-loose"
          >
            {p.ar}
          </p>
        </div>
        <div>
          <div className="label mb-1 md:hidden">English</div>
          <textarea
            ref={ref}
            dir="ltr"
            lang="en"
            rows={2}
            aria-label={`English translation, paragraph ${index + 1}`}
            className="block w-full resize-none overflow-hidden rounded border border-gray-500 p-2 text-base leading-relaxed focus:outline focus:outline-2 focus:outline-gray-900"
            value={p.current}
            onFocus={onFocus}
            onChange={(e) => onChange({ current: e.target.value })}
          />
          {showDiff && <DiffView a={machine} b={p.current} />}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 pt-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={p.done} onChange={(e) => onChange({ done: e.target.checked })} />
          Mark done
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
          Show diff
        </label>
        <button
          className="ml-auto text-sm underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
          disabled={!edited}
          onClick={() => {
            if (window.confirm('Discard your edits and restore the machine translation?')) onChange({ current: machine })
          }}
        >
          ↺ Reset to machine text
        </button>
      </div>
    </li>
  )
}

function DiffView({ a, b }: { a: string; b: string }) {
  const ops = wordDiff(a, b)
  const changed = ops.some((o) => o.type !== 'same')
  return (
    <div className="mt-2 rounded border border-dashed border-gray-500 bg-white p-2 text-sm leading-relaxed">
      <div className="label mb-1">Machine → current</div>
      {!changed ? (
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
