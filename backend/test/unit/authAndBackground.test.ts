import { describe, expect, it, vi } from 'vitest'
import { DevTokenAuthenticator } from '../../src/auth/devAuth.js'
import { BackgroundTasks } from '../../src/services/background.js'
import { requireId } from '../../src/services/ids.js'

describe('DevTokenAuthenticator (unit, simulated identity)', () => {
  const lookup = vi.fn(async (email: string) => (email === 'alex@example.test' ? 'user-alex' : null))
  const auth = new DevTokenAuthenticator({ 'dev-alex': 'alex@example.test', 'dev-ghost': 'ghost@example.test' }, lookup)

  it.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic dev-alex'],
    ['unknown token', 'Bearer nope'],
    ['token for a user who is not seeded', 'Bearer dev-ghost'],
  ])('rejects %s with 401', async (_label, header) => {
    await expect(auth.authenticate(header)).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
  })

  it('resolves a known token to the user id on every request (no stale cache)', async () => {
    lookup.mockClear()
    expect(await auth.authenticate('Bearer dev-alex')).toEqual({ userId: 'user-alex' })
    expect(await auth.authenticate('Bearer dev-alex')).toEqual({ userId: 'user-alex' })
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})

describe('requireId (unit)', () => {
  it('accepts and lower-cases a UUID', () => {
    expect(requireId('0B5E8C1A-1234-4ABC-9DEF-0123456789AB', 'bookId')).toBe('0b5e8c1a-1234-4abc-9def-0123456789ab')
  })
  it.each([undefined, '', 'b-01', '123', 42])('rejects %s with 400 invalid_id', (v) => {
    expect(() => requireId(v, 'bookId')).toThrow(expect.objectContaining({ status: 400, code: 'invalid_id' }))
  })
})

describe('BackgroundTasks (unit)', () => {
  it('drain waits for running tasks and routes failures to onError', async () => {
    const errors: unknown[] = []
    const bg = new BackgroundTasks((e) => errors.push(e))
    let done = false
    bg.run(async () => {
      await new Promise((r) => setTimeout(r, 10))
      done = true
    })
    bg.run(async () => {
      throw new Error('boom')
    })
    await bg.drain()
    expect(done).toBe(true)
    expect(errors).toHaveLength(1)
  })
})
