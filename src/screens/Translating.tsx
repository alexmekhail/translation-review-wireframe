import { useStore } from '../store'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'
import type { TStatus } from '../types'

const icon: Record<TStatus, string> = { pending: '◌', translated: '✓', failed: '✕' }

export function Translating({ docId }: { docId?: string }) {
  const { docs, retryFailed } = useStore()
  const doc = docs.find((d) => d.id === docId)
  if (!doc) return <NotFound />

  const total = doc.paragraphs.length
  const translated = doc.paragraphs.filter((p) => p.tstatus === 'translated').length
  const failed = doc.paragraphs.filter((p) => p.tstatus === 'failed').length
  const pending = total - translated - failed
  const ready = doc.status === 'in_review' || doc.status === 'done'

  return (
    <main className="mx-auto max-w-3xl p-4">
      <a href="#/docs" className="text-sm underline">
        ← Back to documents
      </a>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{doc.title}</h1>
        <StatusBadge status={doc.status} />
      </div>

      <div className="box mt-4 p-3">
        <ProgressBar value={translated} total={total} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>✓ {translated} translated</span>
          <span>◌ {pending} pending</span>
          <span className={failed ? 'font-semibold' : ''}>✕ {failed} failed</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" disabled={failed === 0} onClick={() => retryFailed(doc.id)}>
            ↻ Retry failed ({failed})
          </button>
          <a
            href={`#/review/${doc.id}`}
            className={`btn btn-primary ${ready ? '' : 'pointer-events-none opacity-40'}`}
            aria-disabled={!ready}
          >
            Open review →
          </a>
        </div>
        {doc.status === 'failed' && (
          <p role="alert" className="mt-3 border-l-4 border-gray-900 pl-2 text-sm">
            Some paragraphs couldn’t be translated. Retry them before reviewing.
          </p>
        )}
        {!ready && doc.status !== 'failed' && (
          <p className="mt-3 text-xs text-gray-500">You can leave this page; translation continues in the background.</p>
        )}
      </div>

      <ol className="mt-4 space-y-2">
        {doc.paragraphs.map((p, i) => (
          <li
            key={p.id}
            className={`box flex items-start gap-3 p-2 text-sm ${p.tstatus === 'failed' ? 'border-2 border-dashed border-gray-900' : ''}`}
          >
            <span className="w-6 shrink-0 text-gray-500">{i + 1}.</span>
            <span dir="rtl" lang="ar" className="flex-1 font-arabic text-base leading-relaxed">
              {p.ar}
            </span>
            <span
              className={`shrink-0 whitespace-nowrap text-xs ${p.tstatus === 'failed' ? 'font-semibold' : 'text-gray-600'}`}
            >
              {icon[p.tstatus]} {p.tstatus}
            </span>
          </li>
        ))}
      </ol>
    </main>
  )
}

export function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-4 text-sm">
      Document not found.{' '}
      <a className="underline" href="#/docs">
        Back to documents
      </a>
    </main>
  )
}
