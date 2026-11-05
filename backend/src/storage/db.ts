import pg from 'pg'

/** Minimal query surface shared by the pool and a transaction client. */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>
}

export interface Db extends Queryable {
  /** Runs `fn` in one transaction; commits on success, rolls back on any thrown error. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 })
  return {
    query: (text, values) => pool.query(text, values),
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(client)
        await client.query('COMMIT')
        return result
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw err
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}
