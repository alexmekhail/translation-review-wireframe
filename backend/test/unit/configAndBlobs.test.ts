import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import { FsBlobStore } from '../../src/blob/blobStore.js'

describe('loadConfig (unit)', () => {
  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  })

  it('refuses to start in production because identity is simulated', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', NODE_ENV: 'production' })).toThrow(/simulated/)
  })

  it('applies defaults and parses overrides', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x', PORT: '4000', CORS_ORIGINS: 'http://a,http://b', DEV_TOKENS: '{"t":"e@x"}' })
    expect(c).toMatchObject({ port: 4000, corsOrigins: ['http://a', 'http://b'], devTokens: { t: 'e@x' }, maxParagraphs: 1500 })
  })
})

describe('FsBlobStore (local-disk adapter)', () => {
  let root: string
  afterAll(() => rm(root, { recursive: true, force: true }))

  it('writes, overwrites and deletes a file under its root', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'blobs-'))
    const blobs = new FsBlobStore(root)
    await blobs.put('uploads/b1/original.txt', Buffer.from('نص'))
    expect(await readFile(path.join(root, 'uploads/b1/original.txt'), 'utf8')).toBe('نص')
    await blobs.delete('uploads/b1/original.txt')
    await expect(stat(path.join(root, 'uploads/b1/original.txt'))).rejects.toThrow()
    await blobs.delete('uploads/b1/original.txt') // deleting a missing file is not an error
  })

  it('rejects keys that escape the root', async () => {
    const blobs = new FsBlobStore(root)
    await expect(blobs.put('../escape.txt', Buffer.from('x'))).rejects.toThrow(/Invalid blob key/)
  })
})
