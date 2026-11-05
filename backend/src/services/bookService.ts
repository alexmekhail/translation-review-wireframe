import { randomUUID } from 'node:crypto'
import { AppError, conflict, forbidden, invalid, notFound } from '../domain/errors.js'
import type { BookDetail, BookSummary, Caller, CreatedBook } from '../domain/types.js'
import type { BlobStore } from '../blob/blobStore.js'
import { readSource, type ReaderLimits } from '../ingest/sourceReader.js'
import type { PgReviewStore } from '../storage/reviewStore.js'
import type { BackgroundTasks } from './background.js'
import type { DraftService } from './draftService.js'
import { requireId } from './ids.js'

export interface UploadInput {
  fileName: string
  data: Buffer
  title?: string
}

const MAX_TITLE = 200

/**
 * Book lifecycle: create from upload (R1+R2), list (R3), read (R4), retry drafts (R5), complete (R7),
 * rename (R8) and delete (R9). Rename/delete are owner-only (docs/decisions.md D10).
 */
export class BookService {
  constructor(
    private readonly store: PgReviewStore,
    private readonly blobs: BlobStore,
    private readonly background: BackgroundTasks,
    private readonly drafts: DraftService,
    private readonly limits: ReaderLimits,
  ) {}

  async createFromUpload(caller: Caller, input: UploadInput): Promise<CreatedBook> {
    const title = normalizeTitle(input.title ?? stripExtension(input.fileName))
    const { fileType, paragraphs } = readSource(input.fileName, input.data, this.limits)

    const id = randomUUID()
    const fileKey = `uploads/${id}/original.${fileType}`
    await this.blobs.put(fileKey, input.data)
    let created: CreatedBook
    try {
      created = await this.store.createBook({ id, ownerId: caller.userId, title, fileKey, fileType, paragraphs })
    } catch (err) {
      await this.blobs.delete(fileKey).catch(() => undefined) // no orphaned original
      throw err
    }
    this.background.run(async () => {
      await this.drafts.translateBook(id)
    })
    return created
  }

  listBooks(caller: Caller): Promise<BookSummary[]> {
    return this.store.listBooks(caller.userId)
  }

  async getBook(caller: Caller, bookId: unknown): Promise<BookDetail> {
    const book = await this.store.getBook(requireId(bookId, 'bookId'), caller.userId)
    if (!book) throw notFound()
    return book
  }

  async retryFailed(caller: Caller, bookId: unknown): Promise<{ retried_count: number }> {
    const id = requireId(bookId, 'bookId')
    const access = await this.store.getAccess(id, caller.userId)
    if (!access) throw notFound()
    if (access.pipelineStatus !== 'failed') {
      throw conflict('nothing_to_retry', `The book is ${access.pipelineStatus}; only a failed book can be retried.`)
    }
    const retried = await this.store.resetFailed(id)
    this.background.run(async () => {
      await this.drafts.translateBook(id)
    })
    return { retried_count: retried }
  }

  async setCompleted(caller: Caller, bookId: unknown, body: unknown): Promise<{ completed_at: string | null }> {
    const id = requireId(bookId, 'bookId')
    const completed = (body as { completed?: unknown } | null)?.completed
    if (typeof completed !== 'boolean') throw invalid('`completed` must be true or false.', { field: 'completed' })
    const result = await this.store.setCompleted(id, caller.userId, completed)
    if (!result) throw notFound()
    return result
  }

  async rename(caller: Caller, bookId: unknown, body: unknown): Promise<{ id: string; title: string }> {
    const id = requireId(bookId, 'bookId')
    const title = normalizeTitle((body as { title?: unknown } | null)?.title)
    await this.requireOwner(caller, id, 'rename')
    const renamed = await this.store.renameBook(id, caller.userId, title)
    if (!renamed) throw notFound() // deleted between the check and the update
    return renamed
  }

  /** Deletes the book for every reviewer, then its original file (best effort, after the commit). */
  async delete(caller: Caller, bookId: unknown): Promise<void> {
    const id = requireId(bookId, 'bookId')
    await this.requireOwner(caller, id, 'delete')
    const deleted = await this.store.deleteBook(id, caller.userId)
    if (!deleted) throw notFound()
    await this.blobs.delete(deleted.sourceFileKey).catch((err: unknown) => this.onBlobCleanupError(err, deleted.sourceFileKey))
  }

  /** Unassigned → 404 (no existence leak). Assigned but not the uploader → 403. */
  private async requireOwner(caller: Caller, bookId: string, action: string): Promise<void> {
    const access = await this.store.getAccess(bookId, caller.userId)
    if (!access) throw notFound()
    if (!access.isOwner) throw forbidden(`Only the uploader can ${action} this book.`)
  }

  /** A leftover original is harmless to users but must be visible to operators. */
  onBlobCleanupError: (err: unknown, key: string) => void = (err, key) =>
    console.error(`Book deleted but its original file could not be removed: ${key}`, err)
}

function stripExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
}

export function normalizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') throw invalid('`title` must be a string.', { field: 'title' })
  const title = raw.replace(/\s+/g, ' ').trim()
  if (title.length === 0) throw invalid('`title` must not be empty.', { field: 'title' })
  if (title.length > MAX_TITLE) {
    throw new AppError(400, 'validation_error', `\`title\` must be at most ${MAX_TITLE} characters.`, { field: 'title' })
  }
  return title
}
