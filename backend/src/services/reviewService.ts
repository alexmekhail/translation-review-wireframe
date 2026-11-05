import { conflict, invalid, notFound } from '../domain/errors.js'
import type { Caller, EditPatch, MyEdit } from '../domain/types.js'
import type { PgReviewStore } from '../storage/reviewStore.js'
import { requireId } from './ids.js'

export const MAX_TEXT_LENGTH = 20_000

export interface SaveEditRequest {
  patch: EditPatch
  baseVersion: number
}

/** Validates an R6 body. Pure, so it is unit-tested without a database. */
export function parseSaveEdit(body: unknown): SaveEditRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('Body must be a JSON object.')
  const b = body as Record<string, unknown>
  const { base_version, text_en, is_done } = b

  if (typeof base_version !== 'number' || !Number.isInteger(base_version) || base_version < 0) {
    throw invalid('`base_version` must be a non-negative integer (0 if you have no edit yet).', { field: 'base_version' })
  }
  const patch: EditPatch = {}
  if (text_en !== undefined) {
    if (typeof text_en !== 'string') throw invalid('`text_en` must be a string.', { field: 'text_en' })
    if (text_en.length > MAX_TEXT_LENGTH) {
      throw invalid(`\`text_en\` must be at most ${MAX_TEXT_LENGTH} characters.`, { field: 'text_en' })
    }
    patch.text_en = text_en // empty text is allowed: a reviewer may clear a paragraph
  }
  if (is_done !== undefined) {
    if (typeof is_done !== 'boolean') throw invalid('`is_done` must be true or false.', { field: 'is_done' })
    patch.is_done = is_done
  }
  if (patch.text_en === undefined && patch.is_done === undefined) {
    throw invalid('Send `text_en`, `is_done`, or both.')
  }
  return { patch, baseVersion: base_version }
}

/** Saving a reviewer's correction and done flag (R6). */
export class ReviewService {
  constructor(private readonly store: PgReviewStore) {}

  async saveEdit(caller: Caller, bookId: unknown, paragraphId: unknown, body: unknown): Promise<MyEdit> {
    const bId = requireId(bookId, 'bookId')
    const pId = requireId(paragraphId, 'paragraphId')
    const { patch, baseVersion } = parseSaveEdit(body)

    const result = await this.store.saveEdit(caller.userId, bId, pId, patch, baseVersion)
    switch (result.kind) {
      case 'saved':
        return result.edit
      case 'not_found':
        throw notFound('Paragraph')
      case 'not_translated':
        throw conflict('not_translated', 'This paragraph has no machine draft yet, so it cannot be reviewed.')
      case 'version_conflict':
        throw conflict('version_conflict', 'Your copy is out of date. The current saved edit is included.', {
          current: result.current,
        })
    }
  }
}
