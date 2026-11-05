import { loadConfig } from './config.js'
import { createDb } from './storage/db.js'
import { migrate } from './storage/migrate.js'
import { PgReviewStore } from './storage/reviewStore.js'

/** Creates the dev users that the simulated tokens map to (dev-alex, dev-sam). Idempotent. */
const config = loadConfig()
const db = createDb(config.databaseUrl)
try {
  await migrate(db)
  const store = new PgReviewStore(db)
  for (const [token, email] of Object.entries(config.devTokens)) {
    const id = await store.upsertUser(email, email.split('@')[0] ?? null)
    console.log(`${token} → ${email} (${id})`)
  }
} finally {
  await db.close()
}
