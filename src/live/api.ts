/// <reference types="vite/client" />
/**
 * Thin client for the real backend (backend/, routes R1 and R3–R9).
 * Every request is recorded so the page can show what was sent and what came back.
 */

export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1'

/**
 * SIMULATED identity: a dev token the backend maps to a seeded user (docs/decisions.md D1).
 * It is not a secret and grants nothing outside a dev backend. Real auth would replace this.
 */
export const DEV_TOKEN: string = import.meta.env.VITE_DEV_TOKEN ?? 'dev-alex'

export type PipelineStatus = 'uploaded' | 'translating' | 'ready' | 'failed'

export interface MyEdit {
  text_en: string
  is_done: boolean
  version: number
  updated_at: string
}

export interface ApiParagraph {
  id: string
  position: number
  source_ar: string
  machine_en: string | null
  translation_status: 'pending' | 'translated' | 'failed'
  my_edit: MyEdit | null
}

export interface ApiBookSummary {
  id: string
  title: string
  created_at: string
  pipeline_status: PipelineStatus
  completed_at: string | null
  is_owner: boolean
  paragraph_count: number
  translated_count: number
  done_count: number
}

export interface ApiBook {
  id: string
  title: string
  pipeline_status: PipelineStatus
  completed_at: string | null
  is_owner: boolean
  created_at: string
  paragraphs: ApiParagraph[]
}

export class ApiError extends Error {
  constructor(
    readonly status: number, // 0 = the backend could not be reached
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
    readonly requestId: string | null = null,
  ) {
    super(message)
  }
}

export interface LogEntry {
  id: number
  method: string
  path: string
  status: number | 'network error'
  ms: number
  requestId: string | null
  summary: string
}

// ---- request log (tiny observable store) ----
let nextId = 1
let entries: LogEntry[] = []
const listeners = new Set<() => void>()
export const requestLog = {
  get: () => entries,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  add(e: Omit<LogEntry, 'id'>) {
    entries = [{ ...e, id: nextId++ }, ...entries].slice(0, 12)
    listeners.forEach((fn) => fn())
  },
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${DEV_TOKEN}` }
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const started = performance.now()
  let res: Response
  try {
    res = await fetch(API_BASE + path, { method, headers, body: payload })
  } catch {
    requestLog.add({ method, path, status: 'network error', ms: Math.round(performance.now() - started), requestId: null, summary: 'no response' })
    throw new ApiError(0, 'unreachable', `Can't reach the backend at ${API_BASE}. Is it running, and does CORS_ORIGINS include this page's origin?`)
  }
  const requestId = res.headers.get('x-request-id')
  const text = await res.text()
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  const error = (json.error ?? null) as { code?: string; message?: string } | null
  requestLog.add({
    method,
    path,
    status: res.status,
    ms: Math.round(performance.now() - started),
    requestId,
    summary: error ? `${error.code}: ${error.message}` : summarize(json),
  })
  if (!res.ok) {
    throw new ApiError(res.status, error?.code ?? 'error', error?.message ?? `HTTP ${res.status}`, (error ?? {}) as Record<string, unknown>, requestId)
  }
  return json as T
}

function summarize(json: Record<string, unknown>): string {
  if (Array.isArray(json.books)) return `${json.books.length} book(s)`
  if (Array.isArray(json.paragraphs)) return `${json.paragraphs.length} paragraph(s), ${json.pipeline_status}`
  if (typeof json.version === 'number') return `saved, version ${json.version}`
  const s = JSON.stringify(json)
  return s === '{}' ? '(empty body)' : s.length > 80 ? s.slice(0, 77) + '…' : s
}

export const api = {
  listBooks: () => request<{ books: ApiBookSummary[] }>('GET', '/books'),
  getBook: (id: string) => request<ApiBook>('GET', `/books/${id}`),
  createBook: (file: File, title?: string) => {
    const form = new FormData()
    if (title) form.append('title', title)
    form.append('file', file)
    return request<{ id: string; title: string }>('POST', '/books', form)
  },
  saveEdit: (bookId: string, paragraphId: string, body: { base_version: number; text_en?: string; is_done?: boolean }) =>
    request<MyEdit>('PATCH', `/books/${bookId}/paragraphs/${paragraphId}/edits/me`, body),
  retry: (bookId: string) => request<{ retried_count: number }>('POST', `/books/${bookId}/translations/retry`),
  setCompleted: (bookId: string, completed: boolean) =>
    request<{ completed_at: string | null }>('PATCH', `/books/${bookId}/assignments/me`, { completed }),
  rename: (bookId: string, title: string) => request<{ id: string; title: string }>('PATCH', `/books/${bookId}`, { title }),
  deleteBook: (bookId: string) => request<Record<string, never>>('DELETE', `/books/${bookId}`),
}
