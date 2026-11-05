import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Db } from '../../src/storage/db.js'
import { PgReviewStore } from '../../src/storage/reviewStore.js'
import { freshSchema, seedUsers, truncateAll } from '../helpers.js'

/** Storage adapter against a REAL PostgreSQL database: constraints, ordering, access joins. */
describe('PgReviewStore (component, real PostgreSQL)', () => {
  let db: Db
  let store: PgReviewStore
  let users: { alex: string; sam: string }

  beforeAll(async () => {
    db = await freshSchema()
    store = new PgReviewStore(db)
  })
  afterAll(() => db.close())
  beforeEach(async () => {
    await truncateAll(db)
    users = await seedUsers(db)
  })

  const newBook = (texts: string[], ownerId = users.alex) =>
    store.createBook({ id: randomUUID(), ownerId, title: 'T', fileKey: 'k', fileType: 'txt', paragraphs: texts })

  it('creates the book, the owner assignment and positions 1…n in one call', async () => {
    const b = await newBook(['أ', 'ب', 'ج'])
    const rows = (await db.query('SELECT position, source_ar FROM paragraph WHERE book_id = $1 ORDER BY position', [b.id])).rows
    expect(rows).toEqual([
      { position: 1, source_ar: 'أ' },
      { position: 2, source_ar: 'ب' },
      { position: 3, source_ar: 'ج' },
    ])
    expect((await db.query('SELECT role FROM book_assignment WHERE book_id = $1', [b.id])).rows).toEqual([{ role: 'reviewer' }])
  })

  it('rolls back the whole book when part of the create fails (no half-created book)', async () => {
    const ghostOwner = randomUUID() // violates the app_user foreign key
    await expect(newBook(['أ'], ghostOwner)).rejects.toThrow()
    expect((await db.query('SELECT count(*)::int AS n FROM book')).rows[0]!.n).toBe(0)
    expect((await db.query('SELECT count(*)::int AS n FROM paragraph')).rows[0]!.n).toBe(0)
  })

  it('the database rejects two paragraphs at the same position in one book', async () => {
    const b = await newBook(['أ'])
    await expect(db.query(`INSERT INTO paragraph (book_id, position, source_ar) VALUES ($1, 1, 'dup')`, [b.id])).rejects.toThrow(
      /paragraph_book_id_position_key/,
    )
  })

  it('the database rejects a translated paragraph with no machine text', async () => {
    const b = await newBook(['أ'])
    await expect(db.query(`UPDATE paragraph SET translation_status = 'translated' WHERE book_id = $1`, [b.id])).rejects.toThrow(
      /check/i,
    )
  })

  it('returns paragraphs in position order even when rows were stored out of order', async () => {
    const b = await newBook([])
    // Insert physically in a scrambled order; only ORDER BY position can restore reading order.
    for (const [pos, txt] of [[3, 'ج'], [1, 'أ'], [2, 'ب']] as const) {
      await db.query('INSERT INTO paragraph (book_id, position, source_ar) VALUES ($1, $2, $3)', [b.id, pos, txt])
    }
    await db.query(`UPDATE paragraph SET source_ar = source_ar || '' WHERE position = 1`) // move a row on disk
    const book = await store.getBook(b.id, users.alex)
    expect(book!.paragraphs.map((p) => [p.position, p.source_ar])).toEqual([
      [1, 'أ'],
      [2, 'ب'],
      [3, 'ج'],
    ])
  })

  it('hides a book from a user with no assignment (getBook and getAccess return null)', async () => {
    const b = await newBook(['أ'])
    expect(await store.getBook(b.id, users.sam)).toBeNull()
    expect(await store.getAccess(b.id, users.sam)).toBeNull()
    expect(await store.listBooks(users.sam)).toEqual([])
  })

  it('lists progress counts from the caller’s own edits only', async () => {
    const b = await newBook(['أ', 'ب'])
    await db.query(`UPDATE paragraph SET machine_en = 'x', translation_status = 'translated' WHERE book_id = $1`, [b.id])
    const [p1] = (await store.getBook(b.id, users.alex))!.paragraphs
    await store.saveEdit(users.alex, b.id, p1!.id, { is_done: true }, 0)
    // Sam is assigned too and also marks it done: must not change Alex's count.
    await db.query(`INSERT INTO book_assignment (book_id, user_id, role) VALUES ($1, $2, 'reviewer')`, [b.id, users.sam])
    await store.saveEdit(users.sam, b.id, p1!.id, { is_done: true }, 0)

    const [summary] = await store.listBooks(users.alex)
    expect(summary).toMatchObject({ paragraph_count: 2, translated_count: 2, done_count: 1, is_owner: true })
    expect((await store.listBooks(users.sam))[0]).toMatchObject({ done_count: 1, is_owner: false })
  })

  it('keeps one edit row per reviewer per paragraph (crowdsourcing-ready)', async () => {
    const b = await newBook(['أ'])
    await db.query(`UPDATE paragraph SET machine_en = 'm', translation_status = 'translated' WHERE book_id = $1`, [b.id])
    await db.query(`INSERT INTO book_assignment (book_id, user_id, role) VALUES ($1, $2, 'reviewer')`, [b.id, users.sam])
    const pid = (await store.getBook(b.id, users.alex))!.paragraphs[0]!.id

    await store.saveEdit(users.alex, b.id, pid, { text_en: 'Alex version' }, 0)
    await store.saveEdit(users.sam, b.id, pid, { text_en: 'Sam version' }, 0)

    expect((await store.getBook(b.id, users.alex))!.paragraphs[0]!.my_edit!.text_en).toBe('Alex version')
    expect((await store.getBook(b.id, users.sam))!.paragraphs[0]!.my_edit!.text_en).toBe('Sam version')
    expect((await db.query('SELECT count(*)::int AS n FROM paragraph_edit')).rows[0]!.n).toBe(2)
  })
})
