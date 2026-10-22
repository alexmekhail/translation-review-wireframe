import { useRef, useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { UploadErrorPreview } from '../types'

const ACCEPT = '.docx,.pdf,.txt'
const PAGE_LIMIT = 30

const errors: Record<Exclude<UploadErrorPreview, 'none'>, { title: string; body: string }> = {
  wrong_type: {
    title: 'This file type isn’t supported',
    body: 'Upload a .docx, PDF or .txt file.',
  },
  scanned_pdf: {
    title: 'Scanned PDFs aren’t supported yet',
    body: 'This PDF looks like page images with no selectable text. Upload a PDF with real text, or a .docx/.txt version.',
  },
  over_limit: {
    title: `This document is over ${PAGE_LIMIT} pages`,
    body: `We found 42 pages. Split it into parts of ${PAGE_LIMIT} pages or fewer and upload each part.`,
  },
  empty: {
    title: 'This file is empty',
    body: 'We couldn’t find any Arabic text in it. Check the file and try again.',
  },
}

function validate(file: File): UploadErrorPreview {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!['docx', 'pdf', 'txt'].includes(ext)) return 'wrong_type'
  if (file.size === 0) return 'empty'
  return 'none'
}

export function Upload() {
  const { dev, addUploadedDoc } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [realError, setRealError] = useState<UploadErrorPreview>('none')

  // Dev preview wins over real validation
  const error = dev.uploadError !== 'none' ? dev.uploadError : realError
  const shownFile = fileName ?? (dev.uploadError !== 'none' ? 'example-file.pdf' : null)

  const onPick = (f: File | undefined) => {
    if (!f) return
    setFileName(f.name)
    setRealError(validate(f))
  }

  const start = (name: string) => {
    const id = addUploadedDoc(name.replace(/\.[^.]+$/, ''))
    go(`/translating/${id}`)
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <a href="#/docs" className="text-sm underline">
        ← Back to documents
      </a>
      <h1 className="mb-1 mt-2 text-xl font-semibold">Upload a document</h1>
      <p className="mb-4 text-sm text-gray-600">
        Arabic text only. Accepted: <strong>.docx, PDF, .txt</strong> · <strong>Up to {PAGE_LIMIT} pages</strong>
      </p>

      <div
        className={`box flex flex-col items-center gap-3 border-2 border-dashed px-4 py-10 text-center ${
          error !== 'none' ? 'border-gray-900' : ''
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          onPick(e.dataTransfer.files[0])
        }}
      >
        <div className="flex h-12 w-12 items-center justify-center border border-gray-400 text-xs text-gray-400">
          [file]
        </div>
        <p className="text-sm">Drag a file here, or</p>
        <button className="btn" onClick={() => inputRef.current?.click()}>
          Choose file…
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <p className="text-xs text-gray-500">.docx · .pdf · .txt — up to {PAGE_LIMIT} pages</p>
      </div>

      {shownFile && (
        <div className="box mt-3 flex items-center justify-between gap-2 p-2 text-sm">
          <span className="truncate">📄 {shownFile}</span>
          {error === 'none' && <span className="text-xs text-gray-500">Ready</span>}
        </div>
      )}

      {error !== 'none' && (
        <div role="alert" className="mt-3 rounded border-2 border-dashed border-gray-900 bg-gray-100 p-3 text-sm">
          <div className="font-semibold">⚠ {errors[error].title}</div>
          <div className="mt-1 text-gray-700">{errors[error].body}</div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={!fileName || error !== 'none'}
          onClick={() => fileName && start(fileName)}
        >
          Upload &amp; translate
        </button>
        <button className="text-sm underline" onClick={() => start('Sample upload.docx')}>
          or use a sample file
        </button>
      </div>
    </main>
  )
}
