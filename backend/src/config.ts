export interface Config {
  port: number
  host: string
  databaseUrl: string
  blobDir: string
  corsOrigins: string[]
  /** Upload size cap in bytes (413 above this). */
  maxUploadBytes: number
  /** Stand-in for the unresolved "30 pages" limit; see docs/decisions.md D5. */
  maxParagraphs: number
  /** Simulated identity: token → email. Disabled when NODE_ENV=production. */
  devTokens: Record<string, string>
  /** Fake provider: paragraphs containing this marker fail their first translation attempt. */
  fakeFailOnceMarker: string
}

const DEFAULT_DEV_TOKENS = { 'dev-alex': 'alex@example.test', 'dev-sam': 'sam@example.test' }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required (see backend/README.md).')
  if (env.NODE_ENV === 'production') {
    throw new Error('This build only has simulated dev identity; refusing to start with NODE_ENV=production.')
  }
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '127.0.0.1',
    databaseUrl,
    blobDir: env.BLOB_DIR ?? '.data/blobs',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(','),
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024),
    maxParagraphs: Number(env.MAX_PARAGRAPHS ?? 1500),
    devTokens: env.DEV_TOKENS ? (JSON.parse(env.DEV_TOKENS) as Record<string, string>) : DEFAULT_DEV_TOKENS,
    fakeFailOnceMarker: env.FAKE_FAIL_ONCE_MARKER ?? '[fail-once]',
  }
}
