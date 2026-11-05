import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Db } from './db.js'
import { createDb } from './db.js'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

/** Applies each migrations/*.sql file once, in name order, recording it in schema_migration. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const applied = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migration')).rows.map((r) => r.name))
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const ran: string[] = []
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    await db.transaction(async (tx) => {
      await tx.query(sql)
      await tx.query('INSERT INTO schema_migration (name) VALUES ($1)', [file])
    })
    ran.push(file)
  }
  return ran
}

// CLI: npm run db:migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const db = createDb(url)
  migrate(db)
    .then((ran) => console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Schema is up to date.'))
    .finally(() => db.close())
}
