import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Container } from '../../src/container.js'
import { createContainer } from '../../src/container.js'
import { MemoryBlobStore } from '../../src/blob/blobStore.js'
import type { TranslationProvider } from '../../src/providers/translationProvider.js'
import { FIXTURE_DICTIONARY } from '../../src/fixtureDictionary.js'
import { fixture, freshSchema, multipartBody, seedUsers, testConfig, truncateAll } from '../helpers.js'

/**
 * Week 8 CRUD journey over HTTP (Fastify inject) against REAL PostgreSQL.
 * Every step checks stored state (rows, blob), not just the status code.
 * Simulated: dev-token identity, in-memory blob store, fake translation provider.
 */
describe('CRUD journey: create → read → update → read → delete (component)', () => {
  let c: Container
  let blobs: MemoryBlobStore
  let users: { alex: string; sam: string }
  const alex = { authorization: 'Bearer dev-alex' }
  const sam = { authorization: 'Bearer dev-sam' }

  beforeAll(async () => {
    await (await freshSchema()).close()
    blobs = new MemoryBlobStore()
    c = await createContainer(testConfig(), { blobs })
  })
  afterAll(() => c.app.close())
  beforeEach(async () => {
    await truncateAll(c.db)
    blobs.files.clear()
    users = await seedUsers(c.db)
  })

  const count = async (sql: string, params: unknown[]) => (await c.db.query<{ n: number }>(sql, params)).rows[0]!.n

  async function create(): Promise<string> {
    const body = multipartBody({ title: 'The Merchant and His Sons' }, { name: 'merchant.txt', data: fixture('merchant.txt') })
    const res = await c.app.inject({ method: 'POST', url: '/api/v1/books', headers: { ...alex, ...body.headers }, payload: body.payload })
    expect(res.statusCode).toBe(201)
    await c.background.drain()
    return res.json().id
  }

  it('walks the whole journey and verifies stored state at each step', async () => {
    // CREATE
    const id = await create()
    expect(await count('SELECT count(*)::int AS n FROM book WHERE id = $1 AND owner_id = $2', [id, users.alex])).toBe(1)
    expect(await count('SELECT count(*)::int AS n FROM paragraph WHERE book_id = $1', [id])).toBe(5)
    expect(await count('SELECT count(*)::int AS n FROM book_assignment WHERE book_id = $1', [id])).toBe(1)
    expect(blobs.files.has(`uploads/${id}/original.txt`)).toBe(true)

    // READ: expected values, in order
    const book = (await c.app.inject({ method: 'GET', url: `/api/v1/books/${id}`, headers: alex })).json()
    expect(book).toMatchObject({ title: 'The Merchant and His Sons', pipeline_status: 'ready', is_owner: true })
    expect(book.paragraphs.map((p: { source_ar: string }) => p.source_ar)).toEqual(
      fixture('merchant.txt').toString('utf8').split(/\r\n\r\n/).filter(Boolean),
    )
    expect(book.paragraphs[0].machine_en).toBe(FIXTURE_DICTIONARY[book.paragraphs[0].source_ar])
    const p2 = book.paragraphs[1]

    // UPDATE: a correction on paragraph 2, and the book title
    const save = await c.app.inject({
      method: 'PATCH',
      url: `/api/v1/books/${id}/paragraphs/${p2.id}/edits/me`,
      headers: alex,
      payload: { base_version: 0, text_en: 'He had three sons who did not like to work.', is_done: true },
    })
    expect(save.statusCode).toBe(200)
    const rename = await c.app.inject({ method: 'PATCH', url: `/api/v1/books/${id}`, headers: alex, payload: { title: 'The Merchant (reviewed)' } })
    expect(rename.json()).toEqual({ id, title: 'The Merchant (reviewed)' })

    // READ the change, through the API and in the table
    const after = (await c.app.inject({ method: 'GET', url: `/api/v1/books/${id}`, headers: alex })).json()
    expect(after.title).toBe('The Merchant (reviewed)')
    expect(after.paragraphs[1].my_edit).toMatchObject({ text_en: 'He had three sons who did not like to work.', is_done: true, version: 1 })
    expect(after.paragraphs[1].machine_en).toBe(p2.machine_en) // machine draft preserved for the diff
    expect(after.paragraphs.filter((p: { my_edit: unknown }) => p.my_edit !== null)).toHaveLength(1) // other paragraphs untouched
    const list = (await c.app.inject({ method: 'GET', url: '/api/v1/books', headers: alex })).json()
    expect(list.books[0]).toMatchObject({ title: 'The Merchant (reviewed)', done_count: 1 })

    // DELETE
    const del = await c.app.inject({ method: 'DELETE', url: `/api/v1/books/${id}`, headers: alex })
    expect([del.statusCode, del.body]).toEqual([204, ''])
    expect((await c.app.inject({ method: 'GET', url: `/api/v1/books/${id}`, headers: alex })).statusCode).toBe(404)
    expect(await count('SELECT count(*)::int AS n FROM book WHERE id = $1', [id])).toBe(0)
    expect(await count('SELECT count(*)::int AS n FROM paragraph WHERE book_id = $1', [id])).toBe(0)
    expect(await count('SELECT count(*)::int AS n FROM paragraph_edit', [])).toBe(0)
    expect(await count('SELECT count(*)::int AS n FROM book_assignment WHERE book_id = $1', [id])).toBe(0)
    expect(blobs.files.size).toBe(0)
    // deleting again is a clean 404, not a 500
    expect((await c.app.inject({ method: 'DELETE', url: `/api/v1/books/${id}`, headers: alex })).statusCode).toBe(404)
  })

  it('deleting one book leaves another book and its edits intact', async () => {
    const keep = await create()
    const drop = await create()
    const kept = (await c.app.inject({ method: 'GET', url: `/api/v1/books/${keep}`, headers: alex })).json()
    await c.app.inject({
      method: 'PATCH',
      url: `/api/v1/books/${keep}/paragraphs/${kept.paragraphs[0].id}/edits/me`,
      headers: alex,
      payload: { base_version: 0, text_en: 'must survive' },
    })
    expect((await c.app.inject({ method: 'DELETE', url: `/api/v1/books/${drop}`, headers: alex })).statusCode).toBe(204)

    const reread = (await c.app.inject({ method: 'GET', url: `/api/v1/books/${keep}`, headers: alex })).json()
    expect(reread.paragraphs).toHaveLength(5)
    expect(reread.paragraphs[0].my_edit.text_en).toBe('must survive')
    expect(blobs.files.has(`uploads/${keep}/original.txt`)).toBe(true)
  })

  it('wrong-resource access: unassigned user gets 404; assigned non-owner gets 403 and changes nothing', async () => {
    const id = await create()
    // Sam has no assignment: the book must look nonexistent.
    expect((await c.app.inject({ method: 'DELETE', url: `/api/v1/books/${id}`, headers: sam })).statusCode).toBe(404)
    expect((await c.app.inject({ method: 'PATCH', url: `/api/v1/books/${id}`, headers: sam, payload: { title: 'x' } })).statusCode).toBe(404)

    // Sam is assigned as a second reviewer (future crowdsourcing): may review, may not delete or rename.
    await c.db.query(`INSERT INTO book_assignment (book_id, user_id, role) VALUES ($1, $2, 'reviewer')`, [id, users.sam])
    const del = await c.app.inject({ method: 'DELETE', url: `/api/v1/books/${id}`, headers: sam })
    expect([del.statusCode, del.json().error.code]).toEqual([403, 'forbidden'])
    expect((await c.app.inject({ method: 'PATCH', url: `/api/v1/books/${id}`, headers: sam, payload: { title: 'x' } })).statusCode).toBe(403)
    const forSam = (await c.app.inject({ method: 'GET', url: `/api/v1/books/${id}`, headers: sam })).json()
    expect(forSam).toMatchObject({ title: 'The Merchant and His Sons', is_owner: false })
    expect(await count('SELECT count(*)::int AS n FROM paragraph WHERE book_id = $1', [id])).toBe(5)
  })

  it.each([
    ['missing title', {}],
    ['blank title', { title: '   ' }],
    ['non-string title', { title: 42 }],
    ['over-long title', { title: 'x'.repeat(201) }],
  ])('rename with %s → 400 and the title is unchanged', async (_label, payload) => {
    const id = await create()
    const res = await c.app.inject({ method: 'PATCH', url: `/api/v1/books/${id}`, headers: alex, payload })
    expect(res.statusCode).toBe(400)
    expect((await c.app.inject({ method: 'GET', url: `/api/v1/books/${id}`, headers: alex })).json().title).toBe('The Merchant and His Sons')
  })

  it('missing or malformed identifiers: 400 invalid_id, unknown id 404', async () => {
    expect((await c.app.inject({ method: 'DELETE', url: '/api/v1/books/not-a-uuid', headers: alex })).json().error.code).toBe('invalid_id')
    expect((await c.app.inject({ method: 'DELETE', url: '/api/v1/books/00000000-0000-4000-8000-000000000000', headers: alex })).statusCode).toBe(404)
    // Empty id: Fastify matches the empty segment as :bookId, so the missing identifier is named (first guessed 404).
    const empty = await c.app.inject({ method: 'DELETE', url: '/api/v1/books/', headers: alex })
    expect([empty.statusCode, empty.json().error]).toEqual([400, expect.objectContaining({ code: 'invalid_id', field: 'bookId' })])
  })
})

describe('Deleting a book while its drafts are still running (component)', () => {
  let c: Container
  let release: () => void
  const backgroundErrors: unknown[] = []
  const alex = { authorization: 'Bearer dev-alex' }

  /** Provider that blocks until released, so the delete lands mid-run. */
  class GatedProvider implements TranslationProvider {
    readonly name = 'gated-fake'
    private gate = new Promise<void>((r) => (release = r))
    async translate(source: string) {
      await this.gate
      return `[draft] ${source}`
    }
  }

  beforeAll(async () => {
    await (await freshSchema()).close()
    c = await createContainer(testConfig(), {
      blobs: new MemoryBlobStore(),
      provider: new GatedProvider(),
      onBackgroundError: (e) => backgroundErrors.push(e),
    })
  })
  afterAll(() => c.app.close())
  beforeEach(async () => {
    await truncateAll(c.db)
    await seedUsers(c.db)
  })

  it('the run finishes without errors and does not resurrect any rows', async () => {
    const body = multipartBody({}, { name: 'merchant.txt', data: fixture('merchant.txt') })
    const id = (await c.app.inject({ method: 'POST', url: '/api/v1/books', headers: { ...alex, ...body.headers }, payload: body.payload })).json().id

    expect((await c.app.inject({ method: 'DELETE', url: `/api/v1/books/${id}`, headers: alex })).statusCode).toBe(204)
    release()
    await c.background.drain()
    expect(backgroundErrors).toEqual([]) // the run must not crash on the missing book

    expect((await c.db.query('SELECT count(*)::int AS n FROM book')).rows[0]!.n).toBe(0)
    expect((await c.db.query('SELECT count(*)::int AS n FROM paragraph')).rows[0]!.n).toBe(0)
  })
})
