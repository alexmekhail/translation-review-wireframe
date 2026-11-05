import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Original-upload storage. The proposal calls for object storage (S3 or similar); see docs/decisions.md D3. */
export interface BlobStore {
  put(key: string, data: Buffer): Promise<void>
  delete(key: string): Promise<void>
}

/** Local-disk adapter for development. Keys are relative paths under `root`. */
export class FsBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key)
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error(`Invalid blob key: ${key}`)
    return full
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, data)
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }
}

/** In-memory adapter for tests. */
export class MemoryBlobStore implements BlobStore {
  readonly files = new Map<string, Buffer>()
  failNextPut = false

  async put(key: string, data: Buffer): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false
      throw new Error('simulated blob storage failure')
    }
    this.files.set(key, data)
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key)
  }
}
