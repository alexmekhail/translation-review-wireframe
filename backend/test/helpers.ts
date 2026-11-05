import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config } from '../src/config.js'
import { createDb, type Db } from '../src/storage/db.js'
import { migrate } from '../src/storage/migrate.js'

const here = path.dirname(fileURLToPath(import.meta.url))

export const fixture = (name: string): Buffer => readFileSync(path.join(here, 'fixtures', name))

/** Component tests need a real PostgreSQL database that may be wiped. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL must point at a disposable PostgreSQL database (see backend/README.md).')
  return url
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    databaseUrl: testDatabaseUrl(),
    blobDir: '.data/test-blobs',
    corsOrigins: ['http://localhost:5173'],
    maxUploadBytes: 64 * 1024,
    maxParagraphs: 50,
    devTokens: { 'dev-alex': 'alex@example.test', 'dev-sam': 'sam@example.test' },
    fakeFailOnceMarker: '[fail-once]',
    ...overrides,
  }
}

/** Drops and recreates the schema, then applies migrations. Call once per test file. */
export async function freshSchema(): Promise<Db> {
  const db = createDb(testDatabaseUrl())
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await migrate(db)
  return db
}

export async function truncateAll(db: Db): Promise<void> {
  await db.query('TRUNCATE paragraph_edit, paragraph, book_assignment, book, app_user CASCADE')
}

export async function seedUsers(db: Db): Promise<{ alex: string; sam: string }> {
  const r = await db.query<{ email: string; id: string }>(
    `INSERT INTO app_user (email, display_name) VALUES
       ('alex@example.test', 'Alex'), ('sam@example.test', 'Sam')
     RETURNING email, id`,
  )
  const byEmail = Object.fromEntries(r.rows.map((x) => [x.email, x.id]))
  return { alex: byEmail['alex@example.test']!, sam: byEmail['sam@example.test']! }
}

/** Builds a multipart/form-data body for fastify.inject. */
export function multipartBody(
  fields: Record<string, string>,
  file?: { field?: string; name: string; data: Buffer; type?: string },
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----trtest' + Math.random().toString(16).slice(2)
  const chunks: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'file'}"; filename="${file.name}"\r\n` +
          `Content-Type: ${file.type ?? 'text/plain'}\r\n\r\n`,
      ),
      file.data,
      Buffer.from('\r\n'),
    )
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}
