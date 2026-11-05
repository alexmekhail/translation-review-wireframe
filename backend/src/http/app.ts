import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { randomUUID } from 'node:crypto'
import { AppError, invalid } from '../domain/errors.js'
import type { Caller } from '../domain/types.js'
import type { Authenticator } from '../auth/devAuth.js'
import type { BookService } from '../services/bookService.js'
import type { ReviewService } from '../services/reviewService.js'

export interface AppDeps {
  books: BookService
  reviews: ReviewService
  auth: Authenticator
  corsOrigins: string[]
  maxUploadBytes: number
  logger?: boolean | object
}

type Params = { bookId: string; paragraphId: string }

/**
 * HTTP boundary: maps the Week 6 routes (docs/architecture/proposal.md, section 3) plus the
 * Week 8 rename/delete routes to services.
 * No business rules live here; it authenticates, parses the transport, and maps errors.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? false,
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
  })

  await app.register(cors, {
    origin: deps.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    exposedHeaders: ['x-request-id'],
  })
  await app.register(multipart, { limits: { fileSize: deps.maxUploadBytes, files: 1, fields: 5 } })

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id)
  })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...err.details } })
    }
    const code = (err as { code?: string }).code
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({ error: { code: 'file_too_large', message: `File is larger than ${deps.maxUploadBytes} bytes.` } })
    }
    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE' || code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.status(415).send({ error: { code: 'unsupported_media_type', message: 'Unsupported request content type.' } })
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'bad_request', message: err.message } })
    }
    req.log.error({ err }, 'unhandled error')
    return reply.status(500).send({ error: { code: 'internal_error', message: 'Something went wrong.', request_id: req.id } })
  })

  const caller = (req: FastifyRequest): Promise<Caller> => deps.auth.authenticate(req.headers.authorization)

  /** Startup check only: proves the process answers, not that the review workflow works. */
  app.get('/api/v1/health', async () => ({ status: 'ok' }))

  // R3: list my books
  app.get('/api/v1/books', async (req) => ({ books: await deps.books.listBooks(await caller(req)) }))

  // R1 (+ internal R2): create a book from an upload
  app.post('/api/v1/books', async (req, reply) => {
    const who = await caller(req)
    if (!req.isMultipart()) throw new AppError(415, 'unsupported_media_type', 'Send the file as multipart/form-data.')
    let file: { fileName: string; data: Buffer } | undefined
    let title: string | undefined
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file') throw invalid('The file field must be named `file`.')
        file = { fileName: part.filename, data: await part.toBuffer() }
      } else if (part.fieldname === 'title' && typeof part.value === 'string' && part.value.trim() !== '') {
        title = part.value
      }
    }
    if (!file) throw invalid('A `file` field is required.', { field: 'file' })
    const created = await deps.books.createFromUpload(who, { ...file, title })
    return reply.status(201).send(created)
  })

  // R4: one book with ordered paragraphs and the caller's edits
  app.get<{ Params: Params }>('/api/v1/books/:bookId', async (req) =>
    deps.books.getBook(await caller(req), req.params.bookId),
  )

  // R5: retry failed drafts
  app.post<{ Params: Params }>('/api/v1/books/:bookId/translations/retry', async (req, reply) => {
    const result = await deps.books.retryFailed(await caller(req), req.params.bookId)
    return reply.status(202).send(result)
  })

  // R6: save the caller's correction / done flag
  app.patch<{ Params: Params }>('/api/v1/books/:bookId/paragraphs/:paragraphId/edits/me', async (req) =>
    deps.reviews.saveEdit(await caller(req), req.params.bookId, req.params.paragraphId, req.body),
  )

  // R7: mark the book done for me, or reopen
  app.patch<{ Params: Params }>('/api/v1/books/:bookId/assignments/me', async (req) =>
    deps.books.setCompleted(await caller(req), req.params.bookId, req.body),
  )

  // R8 (Week 8): rename, owner only
  app.patch<{ Params: Params }>('/api/v1/books/:bookId', async (req) =>
    deps.books.rename(await caller(req), req.params.bookId, req.body),
  )

  // R9 (Week 8): delete, owner only; cascades to paragraphs, edits and assignments
  app.delete<{ Params: Params }>('/api/v1/books/:bookId', async (req, reply) => {
    await deps.books.delete(await caller(req), req.params.bookId)
    return reply.status(204).send()
  })

  return app
}
