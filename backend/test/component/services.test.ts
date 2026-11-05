import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../src/storage/db.js'
import { PgReviewStore } from '../../src/storage/reviewStore.js'
import { MemoryBlobStore } from '../../src/blob/blobStore.js'
import { FakeTranslationProvider } from '../../src/providers/translationProvider.js'
import { BackgroundTasks } from '../../src/services/background.js'
import { DraftService } from '../../src/services/draftService.js'
import { BookService } from '../../src/services/bookService.js'
import { ReviewService } from '../../src/services/reviewService.js'
import { FIXTURE_DICTIONARY } from '../../src/fixtureDictionary.js'
import type { Caller } from '../../src/domain/types.js'
import { fixture, freshSchema, seedUsers, truncateAll } from '../helpers.js'

/**
 * Services + REAL PostgreSQL store. Simulated: blob storage (in memory) and the translation
 * provider (fake). So these prove service rules and SQL behaviour, not S3 or a real engine.
 */
describe('Book, draft and review services (component)', () => {
  let db: Db
  let store: PgReviewStore
  let blobs: MemoryBlobStore
  let provider: FakeTranslationProvider
  let background: BackgroundTasks
  let books: BookService
  let reviews: ReviewService
  let alex: Caller
  let sam: Caller

  beforeAll(async () => {
    db = await freshSchema()
    store = new PgReviewStore(db)
  })
  afterAll(() => db.close())
  beforeEach(async () => {
    await truncateAll(db)
    const u = await seedUsers(db)
    alex = { userId: u.alex }
    sam = { userId: u.sam }
    blobs = new MemoryBlobStore()
    provider = new FakeTranslationProvider(FIXTURE_DICTIONARY)
    background = new BackgroundTasks((e) => {
      throw e
    })
    books = new BookService(store, blobs, background, new DraftService(store, provider), { maxBytes: 64_000, maxParagraphs: 50 })
    reviews = new ReviewService(store)
  })

  async function uploadAndTranslate(name = 'merchant.txt') {
    const created = await books.createFromUpload(alex, { fileName: name, data: fixture(name) })
    await background.drain()
    return books.getBook(alex, created.id)
  }

  it('upload → drafts → ready, with machine text in reading order and the original stored', async () => {
    const created = await books.createFromUpload(alex, { fileName: 'merchant.txt', data: fixture('merchant.txt') })
    expect(created).toMatchObject({ title: 'merchant', pipeline_status: 'uploaded', paragraph_count: 5 })
    expect(blobs.files.has(`uploads/${created.id}/original.txt`)).toBe(true)

    await background.drain()
    const book = await books.getBook(alex, created.id)
    expect(book.pipeline_status).toBe('ready')
    expect(book.paragraphs.map((p) => p.position)).toEqual([1, 2, 3, 4, 5])
    expect(book.paragraphs[0]!.machine_en).toBe('In old times there was a merchant who travel between the cities.')
    expect(book.paragraphs.every((p) => p.my_edit === null)).toBe(true)
  })

  it('save → read again returns the correction; machine text is untouched', async () => {
    const book = await uploadAndTranslate()
    const p1 = book.paragraphs[0]!
    const first = await reviews.saveEdit(alex, book.id, p1.id, {
      base_version: 0,
      text_en: 'Long ago, there was a merchant who traveled between cities.',
    })
    expect(first).toMatchObject({ version: 1, is_done: false })
    const second = await reviews.saveEdit(alex, book.id, p1.id, { base_version: 1, is_done: true })
    expect(second).toMatchObject({ version: 2, is_done: true, text_en: first.text_en }) // done-tick kept the text

    const reread = (await books.getBook(alex, book.id)).paragraphs[0]!
    expect(reread.my_edit).toMatchObject({ text_en: first.text_en, is_done: true, version: 2 })
    expect(reread.machine_en).toBe(p1.machine_en)
  })

  it('a first save with only is_done copies the machine text into the edit', async () => {
    const book = await uploadAndTranslate()
    const p = book.paragraphs[1]!
    expect(await reviews.saveEdit(alex, book.id, p.id, { base_version: 0, is_done: true })).toMatchObject({
      text_en: p.machine_en,
      is_done: true,
    })
  })

  it('a stale save gets 409 with the current edit and does not overwrite newer work', async () => {
    const book = await uploadAndTranslate()
    const pid = book.paragraphs[0]!.id
    await reviews.saveEdit(alex, book.id, pid, { base_version: 0, text_en: 'tab A, first' })
    await reviews.saveEdit(alex, book.id, pid, { base_version: 1, text_en: 'tab A, newer' })

    await expect(reviews.saveEdit(alex, book.id, pid, { base_version: 1, text_en: 'tab B, stale' })).rejects.toMatchObject({
      status: 409,
      code: 'version_conflict',
      details: { current: expect.objectContaining({ text_en: 'tab A, newer', version: 2 }) },
    })
    // A second "first save" from another tab is also a conflict, not a duplicate row.
    await expect(reviews.saveEdit(alex, book.id, pid, { base_version: 0, text_en: 'tab C' })).rejects.toMatchObject({ status: 409 })
    expect((await books.getBook(alex, book.id)).paragraphs[0]!.my_edit!.text_en).toBe('tab A, newer')
  })

  it('an invalid save leaves the previous edit intact', async () => {
    const book = await uploadAndTranslate()
    const pid = book.paragraphs[0]!.id
    await reviews.saveEdit(alex, book.id, pid, { base_version: 0, text_en: 'kept' })
    await expect(reviews.saveEdit(alex, book.id, pid, { base_version: 1, text_en: 99 })).rejects.toMatchObject({ status: 400 })
    expect((await books.getBook(alex, book.id)).paragraphs[0]!.my_edit).toMatchObject({ text_en: 'kept', version: 1 })
  })

  it('a paragraph from a different book is not found, even for its owner', async () => {
    const a = await uploadAndTranslate()
    const b = await uploadAndTranslate()
    const paragraphOfB = b.paragraphs[0]!.id
    await expect(reviews.saveEdit(alex, a.id, paragraphOfB, { base_version: 0, text_en: 'x' })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('an unassigned user gets 404 for read, save, retry and complete', async () => {
    const book = await uploadAndTranslate()
    const pid = book.paragraphs[0]!.id
    await expect(books.getBook(sam, book.id)).rejects.toMatchObject({ status: 404 })
    await expect(reviews.saveEdit(sam, book.id, pid, { base_version: 0, text_en: 'x' })).rejects.toMatchObject({ status: 404 })
    await expect(books.retryFailed(sam, book.id)).rejects.toMatchObject({ status: 404 })
    await expect(books.setCompleted(sam, book.id, { completed: true })).rejects.toMatchObject({ status: 404 })
    expect(await books.listBooks(sam)).toEqual([])
  })

  it('failed draft → book failed, edits refused there → retry → ready, and retry keeps existing edits', async () => {
    const book = await uploadAndTranslate('merchant-fail-once.txt')
    expect(book.pipeline_status).toBe('failed')
    expect(book.paragraphs.map((p) => p.translation_status)).toEqual(['translated', 'failed', 'translated'])

    const [p1, p2] = book.paragraphs
    await expect(reviews.saveEdit(alex, book.id, p2!.id, { base_version: 0, text_en: 'x' })).rejects.toMatchObject({
      status: 409,
      code: 'not_translated',
    })
    await reviews.saveEdit(alex, book.id, p1!.id, { base_version: 0, text_en: 'my fix before retry' })

    expect(await books.retryFailed(alex, book.id)).toEqual({ retried_count: 1 })
    await background.drain()

    const after = await books.getBook(alex, book.id)
    expect(after.pipeline_status).toBe('ready')
    expect(after.paragraphs[1]!.translation_status).toBe('translated')
    expect(after.paragraphs[0]!.my_edit!.text_en).toBe('my fix before retry')
    expect(after.paragraphs[0]!.machine_en).toBe(p1!.machine_en)
    // Retrying a ready book is refused.
    await expect(books.retryFailed(alex, book.id)).rejects.toMatchObject({ status: 409, code: 'nothing_to_retry' })
  })

  it('marking the book done never locks editing, and undo clears it', async () => {
    const book = await uploadAndTranslate()
    const done = await books.setCompleted(alex, book.id, { completed: true })
    expect(done.completed_at).not.toBeNull()
    await reviews.saveEdit(alex, book.id, book.paragraphs[0]!.id, { base_version: 0, text_en: 'edit after done' })
    expect(await books.setCompleted(alex, book.id, { completed: false })).toEqual({ completed_at: null })
    await expect(books.setCompleted(alex, book.id, { completed: 'yes' })).rejects.toMatchObject({ status: 400 })
  })

  it('a blob-storage failure creates no book', async () => {
    blobs.failNextPut = true
    await expect(books.createFromUpload(alex, { fileName: 'merchant.txt', data: fixture('merchant.txt') })).rejects.toThrow(
      'simulated blob storage failure',
    )
    expect(await books.listBooks(alex)).toEqual([])
  })

  it('a database failure after the blob was stored removes the blob (no orphaned original)', async () => {
    const ghost: Caller = { userId: '00000000-0000-4000-8000-000000000000' } // not in app_user → FK violation
    await expect(books.createFromUpload(ghost, { fileName: 'merchant.txt', data: fixture('merchant.txt') })).rejects.toThrow()
    expect(blobs.files.size).toBe(0)
  })

  it('delete (owner): rows cascade; if removing the original then fails, the delete stands and the leftover is reported', async () => {
    const book = await uploadAndTranslate()
    await reviews.saveEdit(alex, book.id, book.paragraphs[0]!.id, { base_version: 0, text_en: 'x' })
    const reported: string[] = []
    books.onBlobCleanupError = (_err, key) => reported.push(key)
    blobs.delete = async () => {
      throw new Error('simulated object-storage outage')
    }

    await books.delete(alex, book.id)

    await expect(books.getBook(alex, book.id)).rejects.toMatchObject({ status: 404 })
    expect((await db.query('SELECT count(*)::int AS n FROM paragraph_edit')).rows[0]!.n).toBe(0)
    expect(reported).toEqual([`uploads/${book.id}/original.txt`])
  })

  it('a rejected upload stores nothing', async () => {
    await expect(books.createFromUpload(alex, { fileName: 'notes.md', data: Buffer.from('نص') })).rejects.toMatchObject({
      status: 415,
    })
    expect(blobs.files.size).toBe(0)
    expect(provider.calls).toEqual([])
  })
})
