import { useStore } from '../store'

export function SaveIndicator() {
  const { saveState } = useStore()
  const text = {
    idle: 'All changes saved',
    saving: 'Saving…',
    saved: 'Saved',
    failed: 'Save failed – retrying',
  }[saveState]
  return (
    <span
      className={`whitespace-nowrap text-xs ${saveState === 'failed' ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
      aria-live="polite"
    >
      {saveState === 'saving' ? '◌ ' : saveState === 'failed' ? '⚠ ' : '✓ '}
      {text}
    </span>
  )
}

export function SaveFailedBanner() {
  const { saveState } = useStore()
  if (saveState !== 'failed') return null
  return (
    <div role="alert" className="border-b-2 border-dashed border-gray-900 bg-gray-200 px-4 py-2 text-sm">
      ⚠ <strong>Your last changes haven’t been saved.</strong> We’re retrying automatically. Keep this tab open.
    </div>
  )
}
