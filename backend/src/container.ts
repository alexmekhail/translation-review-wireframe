import type { FastifyInstance } from 'fastify'
import type { Config } from './config.js'
import { createDb, type Db } from './storage/db.js'
import { PgReviewStore } from './storage/reviewStore.js'
import { FsBlobStore, type BlobStore } from './blob/blobStore.js'
import { FakeTranslationProvider, type TranslationProvider } from './providers/translationProvider.js'
import { BackgroundTasks } from './services/background.js'
import { DraftService } from './services/draftService.js'
import { BookService } from './services/bookService.js'
import { ReviewService } from './services/reviewService.js'
import { DevTokenAuthenticator } from './auth/devAuth.js'
import { buildApp } from './http/app.js'
import { FIXTURE_DICTIONARY } from './fixtureDictionary.js'

export interface Container {
  app: FastifyInstance
  db: Db
  store: PgReviewStore
  background: BackgroundTasks
  provider: TranslationProvider
  blobs: BlobStore
}

/** Wires real PostgreSQL + the chosen adapters. Tests pass their own blob store / provider. */
export async function createContainer(
  config: Config,
  overrides: {
    blobs?: BlobStore
    provider?: TranslationProvider
    logger?: boolean | object
    onBackgroundError?: (err: unknown) => void
  } = {},
): Promise<Container> {
  const db = createDb(config.databaseUrl)
  const store = new PgReviewStore(db)
  const blobs = overrides.blobs ?? new FsBlobStore(config.blobDir)
  const provider = overrides.provider ?? new FakeTranslationProvider(FIXTURE_DICTIONARY, config.fakeFailOnceMarker)
  const background = new BackgroundTasks(overrides.onBackgroundError)
  const drafts = new DraftService(store, provider)
  const books = new BookService(store, blobs, background, drafts, {
    maxBytes: config.maxUploadBytes,
    maxParagraphs: config.maxParagraphs,
  })
  const reviews = new ReviewService(store)
  const auth = new DevTokenAuthenticator(config.devTokens, (email) => store.findUserIdByEmail(email))
  const app = await buildApp({
    books,
    reviews,
    auth,
    corsOrigins: config.corsOrigins,
    maxUploadBytes: config.maxUploadBytes,
    logger: overrides.logger,
  })
  app.addHook('onClose', async () => {
    await background.drain()
    await db.close()
  })
  return { app, db, store, background, provider, blobs }
}
