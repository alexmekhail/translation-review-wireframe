import { describe, expect, it } from 'vitest'
import { DraftService } from '../../src/services/draftService.js'
import { FakeTranslationProvider } from '../../src/providers/translationProvider.js'
import type { DraftStore } from '../../src/storage/reviewStore.js'
import type { PipelineStatus, TranslationStatus } from '../../src/domain/types.js'

/** In-memory fake of the narrow DraftStore port. Mirrors the SQL rules it stands in for. */
class FakeDraftStore implements DraftStore {
  status: PipelineStatus = 'uploaded'
  paragraphs: { id: string; source_ar: string; status: TranslationStatus; machine?: string; error?: string }[]
  engine: string | null = null

  constructor(texts: string[]) {
    this.paragraphs = texts.map((t, i) => ({ id: `p${i + 1}`, source_ar: t, status: 'pending' }))
  }
  async claimForTranslation() {
    if (this.status !== 'uploaded') return false
    this.status = 'translating'
    return true
  }
  async pendingParagraphs() {
    return this.paragraphs.filter((p) => p.status === 'pending')
  }
  async markTranslated(id: string, machine: string, engine: string) {
    Object.assign(this.paragraphs.find((p) => p.id === id)!, { status: 'translated', machine })
    this.engine = engine
  }
  async markFailed(id: string, error: string) {
    Object.assign(this.paragraphs.find((p) => p.id === id)!, { status: 'failed', error })
  }
  async finishTranslation() {
    const s = this.paragraphs.map((p) => p.status)
    this.status = s.includes('pending') ? 'translating' : s.includes('failed') ? 'failed' : 'ready'
    return this.status
  }
}

describe('DraftService (unit, fake store + fake provider)', () => {
  it('translates every pending paragraph in reading order and marks the book ready', async () => {
    const store = new FakeDraftStore(['أ', 'ب', 'ج'])
    const provider = new FakeTranslationProvider({ أ: 'A', ب: 'B', ج: 'C' })
    const result = await new DraftService(store, provider).translateBook('b1')

    expect(result).toEqual({ claimed: true, translated: 3, failed: 0, status: 'ready' })
    expect(provider.calls).toEqual(['أ', 'ب', 'ج'])
    expect(store.paragraphs.map((p) => p.machine)).toEqual(['A', 'B', 'C'])
    expect(store.engine).toBe('fake-provider')
  })

  it('marks only the failing paragraph failed, keeps going, and ends the book failed', async () => {
    const store = new FakeDraftStore(['أ', 'ب [fail-once]', 'ج'])
    const result = await new DraftService(store, new FakeTranslationProvider()).translateBook('b1')

    expect(result).toMatchObject({ translated: 2, failed: 1, status: 'failed' })
    expect(store.paragraphs.map((p) => p.status)).toEqual(['translated', 'failed', 'translated'])
    expect(store.paragraphs[1]!.error).toBe('Translation failed: fake provider timeout (fail-once marker)')
  })

  it('treats an empty provider result as a failure, not a draft', async () => {
    const store = new FakeDraftStore(['أ'])
    const blank = { name: 'blank', translate: async () => '   ' }
    expect(await new DraftService(store, blank).translateBook('b1')).toMatchObject({ failed: 1, status: 'failed' })
    expect(store.paragraphs[0]!.machine).toBeUndefined()
  })

  it('truncates long provider errors before storing them', async () => {
    const store = new FakeDraftStore(['أ'])
    const noisy = { name: 'noisy', translate: async () => Promise.reject(new Error('x'.repeat(500))) }
    await new DraftService(store, noisy).translateBook('b1')
    expect(store.paragraphs[0]!.error!.length).toBe(200)
  })

  it('does nothing when the book was already claimed by another run', async () => {
    const store = new FakeDraftStore(['أ'])
    store.status = 'translating'
    const provider = new FakeTranslationProvider()
    expect(await new DraftService(store, provider).translateBook('b1')).toEqual({
      claimed: false,
      translated: 0,
      failed: 0,
      status: null,
    })
    expect(provider.calls).toEqual([])
  })

  it('marks every paragraph failed during a provider outage', async () => {
    const store = new FakeDraftStore(['أ', 'ب'])
    const provider = new FakeTranslationProvider()
    provider.failAll = true
    expect(await new DraftService(store, provider).translateBook('b1')).toMatchObject({ failed: 2, status: 'failed' })
  })
})
