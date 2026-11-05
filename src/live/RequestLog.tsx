import { useSyncExternalStore } from 'react'
import { API_BASE, DEV_TOKEN, requestLog, type ApiError } from './api'

/** Shows where requests go and what came back: the page is a verification surface for the backend. */
export function BackendBanner() {
  return (
    <div className="box mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 bg-gray-50 px-3 py-2 text-xs" data-testid="backend-banner">
      <span>
        <span className="label">Backend</span> <code>{API_BASE}</code>
      </span>
      <span>
        <span className="label">Identity</span> <code>{DEV_TOKEN}</code> <span className="text-gray-500">(simulated dev token)</span>
      </span>
      <span className="text-gray-500">Translation provider is simulated (fake).</span>
    </div>
  )
}

export function RequestLogPanel() {
  const entries = useSyncExternalStore(requestLog.subscribe, requestLog.get)
  return (
    <section className="box mt-6 p-3" aria-label="Request log">
      <h2 className="label mb-2">Requests (newest first)</h2>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-500">No requests yet.</p>
      ) : (
        <ol className="space-y-1 font-mono text-xs" data-testid="request-log">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="w-14 font-semibold">{e.method}</span>
              <span className="min-w-0 flex-1 truncate">{e.path}</span>
              <span className={typeof e.status === 'number' && e.status < 400 ? '' : 'font-semibold'}>{e.status}</span>
              <span className="text-gray-500">{e.ms} ms</span>
              <span className="w-full truncate pl-16 text-gray-600">
                {e.summary}
                {e.requestId && <span className="text-gray-400"> · req {e.requestId.slice(0, 8)}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function ErrorBox({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded border-2 border-dashed border-gray-900 bg-gray-100 p-3 text-sm">
      <div className="font-semibold">
        ⚠ {error.status === 0 ? 'Backend unreachable' : `${error.status} ${error.code}`}
      </div>
      <div className="mt-1 text-gray-700">{error.message}</div>
      {error.requestId && <div className="mt-1 font-mono text-xs text-gray-500">request id {error.requestId}</div>}
      {onRetry && (
        <button className="btn mt-2" onClick={onRetry}>
          ↻ Try again
        </button>
      )}
    </div>
  )
}
