import type { DocStatus } from '../types'

export const statusLabel: Record<DocStatus, string> = {
  uploaded: 'Uploaded',
  translating: 'Translating',
  in_review: 'In review',
  done: 'Done',
  failed: 'Translation failed',
}

export function StatusBadge({ status }: { status: DocStatus }) {
  const style =
    status === 'failed'
      ? 'border-dashed border-gray-900 font-semibold'
      : status === 'done'
        ? 'border-gray-900 bg-gray-900 text-white'
        : 'border-gray-500'
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs ${style}`}>
      {status === 'failed' && '⚠ '}
      {statusLabel[status]}
    </span>
  )
}
