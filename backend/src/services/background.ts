/**
 * In-process background runner for translation jobs. Not durable: a process crash or
 * restart while a job runs leaves the book in `translating` (docs/decisions.md D6).
 */
export class BackgroundTasks {
  private readonly running = new Set<Promise<void>>()

  constructor(private readonly onError: (err: unknown) => void = (err) => console.error(err)) {}

  run(task: () => Promise<void>): void {
    const p: Promise<void> = task()
      .catch(this.onError)
      .finally(() => this.running.delete(p))
    this.running.add(p)
  }

  /** Waits until every started task has finished (used by tests and shutdown). */
  async drain(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running])
  }
}
