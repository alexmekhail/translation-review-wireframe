import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Container } from '../../src/container.js'
import { createContainer } from '../../src/container.js'
import { MemoryBlobStore } from '../../src/blob/blobStore.js'
import { fixture, freshSchema, multipartBody, seedUsers, testConfig, truncateAll } from '../helpers.js'

/**
 * HTTP contract through Fastify's in-process inject (no network socket) against REAL PostgreSQL.
 * Simulated: dev-token identity, in-memory blob store, fake translation provider.
 */
describe('HTTP routes R1–R7 (component)', () => {
  let c: Container
  const alex = { authorization: 'Bearer dev-alex' }
  const sam = { authorization: 'Bearer dev-sam' }

  beforeAll(async () => {
    await (await freshSchema()).close()
    c = await createContainer(testConfig(), { blobs: new MemoryBlobStore() })
  })
  afterAll(() => c.app.close())
  beforeEach(async () => {
    await truncateAll(c.db)
    await seedUsers(c.db)
  })

  async function upload(name = 'merchant.txt', data = fixture(name), fields: Record<string, string> = {}) {
    const body = multipartBody(fields, { name, data })
    return c.app.inject({ method: 'POST', url: '/api/v1/books', headers: { ...alex, ...body.headers }, payload: body.payload })
  }

  async function readyBook() {
    const res = await upload()
    await c.background.drain()
    return (await c.app.inject({ method: 'GET', url: `/api/v1/books/${res.json().id}`, headers: alex })).json()
  }

  it('requires a session on every business route (401) but not on health', async () => {
    expect((await c.app.inject({ method: 'GET', url: '/api/v1/books' })).statusCode).toBe(401)
    expect((await c.app.inject({ method: 'GET', url: '/api/v1/books', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401)
    expect((await c.app.inject({ method: 'GET', url: '/api/v1/health' })).json()).toEqual({ status: 'ok' })
  })

  it('R1 creates a book from a multipart upload, with an optional title', async () => {
    const res = await upload('merchant.txt', fixture('merchant.txt'), { title: '  The Merchant  ' })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ title: 'The Merchant', pipeline_status: 'uploaded', paragraph_count: 5 })
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  it('R3 lists only my books with progress; R4 returns ordered paragraphs', async () => {
    const book = await readyBook()
    const list = (await c.app.inject({ method: 'GET', url: '/api/v1/books', headers: alex })).json()
    expect(list.books).toHaveLength(1)
    expect(list.books[0]).toMatchObject({ id: book.id, pipeline_status: 'ready', paragraph_count: 5, done_count: 0 })
    expect(book.paragraphs.map((p: { position: number }) => p.position)).toEqual([1, 2, 3, 4, 5])
    expect((await c.app.inject({ method: 'GET', url: '/api/v1/books', headers: sam })).json()).toEqual({ books: [] })
  })

  it('R6 save → R4 read returns the correction; stale save → 409 with current', async () => {
    const book = await readyBook()
    const url = `/api/v1/books/${book.id}/paragraphs/${book.paragraphs[0].id}/edits/me`
    const saved = await c.app.inject({ method: 'PATCH', url, headers: alex, payload: { base_version: 0, text_en: 'Fixed.' } })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({ text_en: 'Fixed.', version: 1 })

    const reread = (await c.app.inject({ method: 'GET', url: `/api/v1/books/${book.id}`, headers: alex })).json()
    expect(reread.paragraphs[0].my_edit).toMatchObject({ text_en: 'Fixed.', version: 1 })

    const stale = await c.app.inject({ method: 'PATCH', url, headers: alex, payload: { base_version: 0, text_en: 'Old tab' } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error).toMatchObject({ code: 'version_conflict', current: { text_en: 'Fixed.', version: 1 } })
  })

  it('R7 marks done and reopens', async () => {
    const book = await readyBook()
    const url = `/api/v1/books/${book.id}/assignments/me`
    expect((await c.app.inject({ method: 'PATCH', url, headers: alex, payload: { completed: true } })).json().completed_at).toBeTruthy()
    expect((await c.app.inject({ method: 'PATCH', url, headers: alex, payload: { completed: false } })).json()).toEqual({
      completed_at: null,
    })
  })

  it('R5 retries a failed book', async () => {
    const res = await upload('merchant-fail-once.txt')
    await c.background.drain()
    const id = res.json().id
    expect((await c.app.inject({ method: 'GET', url: `/api/v1/books/${id}`, headers: alex })).json().pipeline_status).toBe('failed')
    const retry = await c.app.inject({ method: 'POST', url: `/api/v1/books/${id}/translations/retry`, headers: alex })
    expect([retry.statusCode, retry.json()]).toEqual([202, { retried_count: 1 }])
    await c.background.drain()
    expect((await c.app.inject({ method: 'GET', url: `/api/v1/books/${id}`, headers: alex })).json().pipeline_status).toBe('ready')
  })

  it('another user gets 404 for my book and my paragraph', async () => {
    const book = await readyBook()
    expect((await c.app.inject({ method: 'GET', url: `/api/v1/books/${book.id}`, headers: sam })).statusCode).toBe(404)
    const save = await c.app.inject({
      method: 'PATCH',
      url: `/api/v1/books/${book.id}/paragraphs/${book.paragraphs[0].id}/edits/me`,
      headers: sam,
      payload: { base_version: 0, text_en: 'x' },
    })
    expect(save.statusCode).toBe(404)
  })

  it.each([
    ['malformed book id', 'GET', '/api/v1/books/b-01', undefined, 400, 'invalid_id'],
    ['unknown book id', 'GET', '/api/v1/books/00000000-0000-4000-8000-000000000000', undefined, 404, 'not_found'],
    ['save with no fields', 'PATCH', '/api/v1/books/00000000-0000-4000-8000-000000000000/paragraphs/00000000-0000-4000-8000-000000000001/edits/me', { base_version: 0 }, 400, 'validation_error'],
  ])('%s → %i', async (_label, method, url, payload, status, code) => {
    const res = await c.app.inject({ method: method as 'GET', url, headers: alex, payload })
    expect(res.statusCode).toBe(status)
    expect(res.json().error.code).toBe(code)
  })

  it('upload failures: wrong type 415, empty 422, no file 400, too large 413, JSON body 415', async () => {
    expect((await upload('notes.md', Buffer.from('نص'))).json().error.code).toBe('unsupported_type')
    const empty = await upload('blank.txt', Buffer.from('  \n\n'))
    expect([empty.statusCode, empty.json().error.code]).toEqual([422, 'empty'])

    const noFile = multipartBody({ title: 'x' })
    const res = await c.app.inject({ method: 'POST', url: '/api/v1/books', headers: { ...alex, ...noFile.headers }, payload: noFile.payload })
    expect(res.statusCode).toBe(400)

    const big = await upload('big.txt', Buffer.alloc(70_000, 0x41))
    expect([big.statusCode, big.json().error.code]).toEqual([413, 'file_too_large'])

    const json = await c.app.inject({ method: 'POST', url: '/api/v1/books', headers: alex, payload: { title: 'x' } })
    expect(json.statusCode).toBe(415)
    expect((await c.app.inject({ method: 'GET', url: '/api/v1/books', headers: alex })).json().books).toEqual([])
  })
})
