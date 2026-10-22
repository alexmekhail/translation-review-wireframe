import { useState } from 'react'
import { useStore } from '../store'
import type { UploadErrorPreview } from '../types'

/** Floating panel for previewing empty/error states. Not part of the product. */
export function DevPanel() {
  const { dev, setDev } = useStore()
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-3 right-3 z-50 text-xs">
      {open ? (
        <div className="w-64 rounded border-2 border-dashed border-gray-700 bg-yellow-50 p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <strong>Dev: preview states</strong>
            <button className="underline" onClick={() => setOpen(false)}>
              close
            </button>
          </div>
          <label className="mb-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={dev.emptyDocList}
              onChange={(e) => setDev({ emptyDocList: e.target.checked })}
            />
            Empty document list
          </label>
          <label className="mb-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={dev.saveFails}
              onChange={(e) => setDev({ saveFails: e.target.checked })}
            />
            Autosave fails (edit text to trigger)
          </label>
          <label className="block">
            Upload error preview
            <select
              className="mt-1 block w-full rounded border border-gray-500 bg-white p-1"
              value={dev.uploadError}
              onChange={(e) => setDev({ uploadError: e.target.value as UploadErrorPreview })}
            >
              <option value="none">None (real validation)</option>
              <option value="wrong_type">Wrong file type</option>
              <option value="scanned_pdf">Scanned PDF</option>
              <option value="over_limit">Over 30 pages</option>
              <option value="empty">Empty file</option>
            </select>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="underline" href="#/docs">docs</a>
            <a className="underline" href="#/upload">upload</a>
            <a className="underline" href="#/translating/letters">translating</a>
            <a className="underline" href="#/translating/poem">failed</a>
            <a className="underline" href="#/review/merchant">review</a>
          </div>
        </div>
      ) : (
        <button
          className="rounded border-2 border-dashed border-gray-700 bg-yellow-50 px-2 py-1 shadow"
          onClick={() => setOpen(true)}
        >
          Dev ▴
        </button>
      )}
    </div>
  )
}
