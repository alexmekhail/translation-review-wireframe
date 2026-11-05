/**
 * External translation integration. The real engine is undecided (docs/decisions.md D4),
 * so the only implementation is the simulated FakeTranslationProvider below.
 */
export interface TranslationProvider {
  /** Recorded on the book as translation_engine. */
  readonly name: string
  translate(sourceAr: string): Promise<string>
}

export class TranslationProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslationProviderError'
  }
}

/**
 * SIMULATED provider. Deterministic, no network:
 * - known fixture sentences return their (deliberately rough) English draft;
 * - anything else returns "[draft] " + the source text;
 * - a paragraph containing `failOnceMarker` fails on its first attempt only, so retry can be exercised;
 * - `failAll` makes every call fail (provider outage).
 */
export class FakeTranslationProvider implements TranslationProvider {
  readonly name = 'fake-provider'
  failAll = false
  readonly calls: string[] = []
  private readonly failedOnce = new Set<string>()

  constructor(
    private readonly dictionary: Record<string, string> = {},
    private readonly failOnceMarker = '[fail-once]',
  ) {}

  async translate(sourceAr: string): Promise<string> {
    this.calls.push(sourceAr)
    if (this.failAll) throw new TranslationProviderError('fake provider unavailable')
    if (sourceAr.includes(this.failOnceMarker) && !this.failedOnce.has(sourceAr)) {
      this.failedOnce.add(sourceAr)
      throw new TranslationProviderError('fake provider timeout (fail-once marker)')
    }
    return this.dictionary[sourceAr] ?? `[draft] ${sourceAr}`
  }
}
