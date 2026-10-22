export type DocStatus = 'uploaded' | 'translating' | 'in_review' | 'done' | 'failed'
export type TStatus = 'pending' | 'translated' | 'failed'

export interface Paragraph {
  id: string
  ar: string
  /** Machine translation; null until translated */
  machine: string | null
  /** Current (possibly edited) English text */
  current: string
  done: boolean
  tstatus: TStatus
  /** Mock only: fail on the next translation attempt */
  willFail?: boolean
}

export interface Doc {
  id: string
  title: string
  uploadedAt: string
  status: DocStatus
  paragraphs: Paragraph[]
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export type UploadErrorPreview = 'none' | 'wrong_type' | 'scanned_pdf' | 'over_limit' | 'empty'
