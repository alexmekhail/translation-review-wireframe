import type pg from 'pg'
import type { Db, Queryable } from './db.js'
import type {
  BookDetail,
  BookSummary,
  CreatedBook,
  EditPatch,
  MyEdit,
  ParagraphView,
  PipelineStatus,
  SourceFileType,
} from '../domain/types.js'

export interface NewBook {
  id: string
  ownerId: string
  title: string
  fileKey: string
  fileType: SourceFileType
  /** Arabic paragraph texts in reading order; stored with positions 1…n. */
  paragraphs: string[]
}

export interface BookAccess {
  isOwner: boolean
  pipelineStatus: PipelineStatus
  sourceFileKey: string
}

export type SaveEditResult =
  | { kind: 'saved'; edit: MyEdit }
  | { kind: 'not_found' }
  | { kind: 'not_translated' }
  | { kind: 'version_conflict'; current: MyEdit | null }

/** The narrow surface the draft orchestration needs (lets unit tests use a small fake). */
export interface DraftStore {
  claimForTranslation(bookId: string): Promise<boolean>
  pendingParagraphs(bookId: string): Promise<{ id: string; source_ar: string }[]>
  markTranslated(paragraphId: string, machineEn: string, engine: string): Promise<void>
  markFailed(paragraphId: string, error: string): Promise<void>
  finishTranslation(bookId: string): Promise<PipelineStatus>
}

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString())

function toEdit(row: { text_en: string; is_done: boolean; version: number; updated_at: Date }): MyEdit {
  return { text_en: row.text_en, is_done: row.is_done, version: row.version, updated_at: iso(row.updated_at)! }
}

/**
 * PostgreSQL implementation of every storage operation the services use.
 * Every read and write of a book's content takes the caller's user id and joins
 * book_assignment, so access is enforced in the same statement that touches the data.
 */
export class PgReviewStore implements DraftStore {
  constructor(private readonly db: Db) {}

  // ---------- users (simulated identity) ----------

  async findUserIdByEmail(email: string): Promise<string | null> {
    const r = await this.db.query<{ id: string }>('SELECT id FROM app_user WHERE email = $1', [email])
    return r.rows[0]?.id ?? null
  }

  async upsertUser(email: string, displayName: string | null): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `INSERT INTO app_user (email, display_name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [email, displayName],
    )
    return r.rows[0]!.id
  }

  // ---------- books ----------

  /** Book row, the uploader's reviewer assignment and all paragraphs, in one transaction. */
  async createBook(b: NewBook): Promise<CreatedBook> {
    return this.db.transaction(async (tx) => {
      const r = await tx.query<{ created_at: Date }>(
        `INSERT INTO book (id, owner_id, title, source_file_key, source_file_type, pipeline_status)
         VALUES ($1, $2, $3, $4, $5, 'uploaded') RETURNING created_at`,
        [b.id, b.ownerId, b.title, b.fileKey, b.fileType],
      )
      await tx.query(`INSERT INTO book_assignment (book_id, user_id, role) VALUES ($1, $2, 'reviewer')`, [
        b.id,
        b.ownerId,
      ])
      await insertParagraphs(tx, b.id, b.paragraphs)
      return {
        id: b.id,
        title: b.title,
        pipeline_status: 'uploaded',
        page_count: null,
        paragraph_count: b.paragraphs.length,
        created_at: iso(r.rows[0]!.created_at)!,
      }
    })
  }

  async listBooks(userId: string): Promise<BookSummary[]> {
    const r = await this.db.query(
      `SELECT b.id, b.title, b.created_at, b.pipeline_status, a.completed_at,
              (b.owner_id = $1) AS is_owner,
              count(p.id)::int AS paragraph_count,
              count(p.id) FILTER (WHERE p.translation_status = 'translated')::int AS translated_count,
              count(e.id) FILTER (WHERE e.is_done)::int AS done_count
       FROM book b
       JOIN book_assignment a ON a.book_id = b.id AND a.user_id = $1
       LEFT JOIN paragraph p ON p.book_id = b.id
       LEFT JOIN paragraph_edit e ON e.paragraph_id = p.id AND e.reviewer_id = $1
       GROUP BY b.id, a.completed_at
       ORDER BY b.created_at DESC, b.id`,
      [userId],
    )
    return r.rows.map((row) => ({
      id: row.id,
      title: row.title,
      created_at: iso(row.created_at)!,
      pipeline_status: row.pipeline_status,
      completed_at: iso(row.completed_at),
      is_owner: row.is_owner,
      paragraph_count: row.paragraph_count,
      translated_count: row.translated_count,
      done_count: row.done_count,
    }))
  }

  /** Null when the book does not exist or the caller has no assignment. */
  async getBook(bookId: string, userId: string): Promise<BookDetail | null> {
    const b = await this.db.query(
      `SELECT b.id, b.title, b.pipeline_status, b.created_at, a.completed_at, (b.owner_id = $2) AS is_owner
       FROM book b JOIN book_assignment a ON a.book_id = b.id AND a.user_id = $2
       WHERE b.id = $1`,
      [bookId, userId],
    )
    const book = b.rows[0]
    if (!book) return null
    // Reading order is only guaranteed by an explicit ORDER BY (docs/architecture/proposal.md).
    const p = await this.db.query(
      `SELECT p.id, p.position, p.source_ar, p.machine_en, p.translation_status,
              e.text_en, e.is_done, e.version, e.updated_at
       FROM paragraph p
       LEFT JOIN paragraph_edit e ON e.paragraph_id = p.id AND e.reviewer_id = $2
       WHERE p.book_id = $1
       ORDER BY p.position`,
      [bookId, userId],
    )
    const paragraphs: ParagraphView[] = p.rows.map((row) => ({
      id: row.id,
      position: row.position,
      source_ar: row.source_ar,
      machine_en: row.machine_en,
      translation_status: row.translation_status,
      my_edit: row.version === null ? null : toEdit(row as never),
    }))
    return {
      id: book.id,
      title: book.title,
      pipeline_status: book.pipeline_status,
      completed_at: iso(book.completed_at),
      is_owner: book.is_owner,
      created_at: iso(book.created_at)!,
      paragraphs,
    }
  }

  async getAccess(bookId: string, userId: string): Promise<BookAccess | null> {
    const r = await this.db.query(
      `SELECT (b.owner_id = $2) AS is_owner, b.pipeline_status, b.source_file_key
       FROM book b JOIN book_assignment a ON a.book_id = b.id AND a.user_id = $2
       WHERE b.id = $1`,
      [bookId, userId],
    )
    const row = r.rows[0]
    return row ? { isOwner: row.is_owner, pipelineStatus: row.pipeline_status, sourceFileKey: row.source_file_key } : null
  }

  // ---------- translation pipeline ----------

  /** Atomically moves an uploaded book to translating. False if another run already claimed it. */
  async claimForTranslation(bookId: string): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE book SET pipeline_status = 'translating', updated_at = now()
       WHERE id = $1 AND pipeline_status = 'uploaded'`,
      [bookId],
    )
    return r.rowCount === 1
  }

  async pendingParagraphs(bookId: string): Promise<{ id: string; source_ar: string }[]> {
    const r = await this.db.query<{ id: string; source_ar: string }>(
      `SELECT id, source_ar FROM paragraph
       WHERE book_id = $1 AND translation_status = 'pending' ORDER BY position`,
      [bookId],
    )
    return r.rows
  }

  async markTranslated(paragraphId: string, machineEn: string, engine: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const r = await tx.query<{ book_id: string }>(
        `UPDATE paragraph SET machine_en = $2, translation_status = 'translated',
                translation_error = NULL, updated_at = now()
         WHERE id = $1 AND translation_status = 'pending' RETURNING book_id`,
        [paragraphId, machineEn],
      )
      const bookId = r.rows[0]?.book_id
      if (bookId) await tx.query('UPDATE book SET translation_engine = $2 WHERE id = $1', [bookId, engine])
    })
  }

  async markFailed(paragraphId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE paragraph SET translation_status = 'failed', translation_error = $2, updated_at = now()
       WHERE id = $1 AND translation_status = 'pending'`,
      [paragraphId, error],
    )
  }

  /** ready when every paragraph is translated, failed if any failed. Pending paragraphs leave it translating. */
  async finishTranslation(bookId: string): Promise<PipelineStatus> {
    const r = await this.db.query<{ pipeline_status: PipelineStatus }>(
      `UPDATE book b SET pipeline_status = s.next, updated_at = now()
       FROM (
         SELECT CASE
           WHEN count(*) FILTER (WHERE translation_status = 'pending') > 0 THEN 'translating'
           WHEN count(*) FILTER (WHERE translation_status = 'failed') > 0 THEN 'failed'
           ELSE 'ready' END AS next
         FROM paragraph WHERE book_id = $1
       ) s
       WHERE b.id = $1 RETURNING b.pipeline_status`,
      [bookId],
    )
    return r.rows[0]!.pipeline_status
  }

  /** Failed paragraphs back to pending; book back to uploaded so it can be claimed again. */
  async resetFailed(bookId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const r = await tx.query(
        `UPDATE paragraph SET translation_status = 'pending', translation_error = NULL, updated_at = now()
         WHERE book_id = $1 AND translation_status = 'failed'`,
        [bookId],
      )
      if (r.rowCount) {
        await tx.query(`UPDATE book SET pipeline_status = 'uploaded', updated_at = now() WHERE id = $1`, [bookId])
      }
      return r.rowCount ?? 0
    })
  }

  // ---------- review ----------

  /**
   * Compare-and-save of the caller's own edit (R6).
   * baseVersion 0 = "I have no edit yet": insert, copying machine_en for any field not sent.
   * baseVersion n = update only if the stored version is still n.
   */
  async saveEdit(
    userId: string,
    bookId: string,
    paragraphId: string,
    patch: EditPatch,
    baseVersion: number,
  ): Promise<SaveEditResult> {
    return this.db.transaction(async (tx) => {
      const p = await tx.query<{ machine_en: string | null; translation_status: string }>(
        `SELECT p.machine_en, p.translation_status
         FROM paragraph p
         JOIN book_assignment a ON a.book_id = p.book_id AND a.user_id = $3
         WHERE p.id = $1 AND p.book_id = $2`,
        [paragraphId, bookId, userId],
      )
      const para = p.rows[0]
      if (!para) return { kind: 'not_found' }
      if (para.translation_status !== 'translated' || para.machine_en === null) return { kind: 'not_translated' }

      let row: pg.QueryResultRow | undefined
      if (baseVersion === 0) {
        const r = await tx.query(
          `INSERT INTO paragraph_edit (paragraph_id, reviewer_id, text_en, is_done)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (paragraph_id, reviewer_id) DO NOTHING
           RETURNING text_en, is_done, version, updated_at`,
          [paragraphId, userId, patch.text_en ?? para.machine_en, patch.is_done ?? false],
        )
        row = r.rows[0]
      } else {
        const r = await tx.query(
          `UPDATE paragraph_edit
           SET text_en = COALESCE($3, text_en), is_done = COALESCE($4, is_done),
               version = version + 1, updated_at = now()
           WHERE paragraph_id = $1 AND reviewer_id = $2 AND version = $5
           RETURNING text_en, is_done, version, updated_at`,
          [paragraphId, userId, patch.text_en ?? null, patch.is_done ?? null, baseVersion],
        )
        row = r.rows[0]
      }
      if (row) return { kind: 'saved', edit: toEdit(row as never) }

      const cur = await tx.query(
        `SELECT text_en, is_done, version, updated_at FROM paragraph_edit
         WHERE paragraph_id = $1 AND reviewer_id = $2`,
        [paragraphId, userId],
      )
      return { kind: 'version_conflict', current: cur.rows[0] ? toEdit(cur.rows[0] as never) : null }
    })
  }

  /** Sets or clears completed_at on the caller's assignment (R7). Null result = no assignment. */
  async setCompleted(bookId: string, userId: string, completed: boolean): Promise<{ completed_at: string | null } | null> {
    const r = await this.db.query<{ completed_at: Date | null }>(
      `UPDATE book_assignment SET completed_at = CASE WHEN $3 THEN COALESCE(completed_at, now()) ELSE NULL END
       WHERE book_id = $1 AND user_id = $2 AND role = 'reviewer' RETURNING completed_at`,
      [bookId, userId, completed],
    )
    const row = r.rows[0]
    return row ? { completed_at: iso(row.completed_at) } : null
  }
}

async function insertParagraphs(tx: Queryable, bookId: string, texts: string[]): Promise<void> {
  if (texts.length === 0) return
  // One multi-row insert; positions are 1…n in the order given.
  await tx.query(
    `INSERT INTO paragraph (book_id, position, source_ar)
     SELECT $1, t.ord, t.txt FROM unnest($2::text[]) WITH ORDINALITY AS t(txt, ord)`,
    [bookId, texts],
  )
}
