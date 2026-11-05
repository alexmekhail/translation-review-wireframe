import type { DraftStore } from '../storage/reviewStore.js'
import type { TranslationProvider } from '../providers/translationProvider.js'
import type { PipelineStatus } from '../domain/types.js'

export interface DraftRunResult {
  claimed: boolean
  translated: number
  failed: number
  status: PipelineStatus | null
}

const MAX_ERROR_LENGTH = 200

/**
 * Requests machine drafts for every pending paragraph of a book, in reading order.
 * One paragraph's provider failure marks only that paragraph failed; the run continues.
 * Storage errors are not caught here: they propagate to the background runner's logger.
 */
export class DraftService {
  constructor(
    private readonly store: DraftStore,
    private readonly provider: TranslationProvider,
  ) {}

  async translateBook(bookId: string): Promise<DraftRunResult> {
    if (!(await this.store.claimForTranslation(bookId))) {
      return { claimed: false, translated: 0, failed: 0, status: null }
    }
    let translated = 0
    let failed = 0
    for (const p of await this.store.pendingParagraphs(bookId)) {
      let draft: string
      try {
        draft = await this.provider.translate(p.source_ar)
      } catch (err) {
        await this.store.markFailed(p.id, sanitize(err))
        failed++
        continue
      }
      if (draft.trim().length === 0) {
        await this.store.markFailed(p.id, 'Provider returned an empty translation.')
        failed++
        continue
      }
      await this.store.markTranslated(p.id, draft, this.provider.name)
      translated++
    }
    const status = await this.store.finishTranslation(bookId)
    return { claimed: true, translated, failed, status }
  }
}

/** Keeps provider details out of stored/returned errors beyond a short message. */
function sanitize(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Unknown provider error'
  return `Translation failed: ${msg}`.slice(0, MAX_ERROR_LENGTH)
}
