export type PipelineStatus = 'uploaded' | 'translating' | 'ready' | 'failed'
export type TranslationStatus = 'pending' | 'translated' | 'failed'
export type SourceFileType = 'docx' | 'pdf' | 'txt'

/** The authenticated caller. Produced by the auth boundary, never by request bodies. */
export interface Caller {
  userId: string
}

export interface MyEdit {
  text_en: string
  is_done: boolean
  version: number
  updated_at: string
}

export interface ParagraphView {
  id: string
  position: number
  source_ar: string
  machine_en: string | null
  translation_status: TranslationStatus
  my_edit: MyEdit | null
}

export interface BookSummary {
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

export interface BookDetail {
  id: string
  title: string
  pipeline_status: PipelineStatus
  completed_at: string | null
  is_owner: boolean
  created_at: string
  paragraphs: ParagraphView[]
}

export interface CreatedBook {
  id: string
  title: string
  pipeline_status: PipelineStatus
  page_count: number | null
  paragraph_count: number
  created_at: string
}

/** Fields a reviewer may change on their own edit (R6). At least one is required. */
export interface EditPatch {
  text_en?: string
  is_done?: boolean
}
