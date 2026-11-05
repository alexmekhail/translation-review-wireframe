import { unauthorized } from '../domain/errors.js'
import type { Caller } from '../domain/types.js'

export interface Authenticator {
  /** Resolves an Authorization header to the caller, or throws 401. */
  authenticate(authorizationHeader: string | undefined): Promise<Caller>
}

/**
 * SIMULATED identity for development only (docs/decisions.md D1).
 * `Authorization: Bearer dev-alex` maps to a seeded user by email. These tokens are
 * not secrets and provide no security; config refuses to start with NODE_ENV=production.
 */
export class DevTokenAuthenticator implements Authenticator {
  // No token → user id cache: a cached id outlives a deleted or re-created user row
  // (found by the HTTP component tests). The lookup is one indexed query per request.
  constructor(
    private readonly tokens: Record<string, string>,
    private readonly findUserIdByEmail: (email: string) => Promise<string | null>,
  ) {}

  async authenticate(header: string | undefined): Promise<Caller> {
    const match = /^Bearer (\S+)$/.exec(header ?? '')
    const token = match?.[1]
    if (!token) throw unauthorized()
    const email = this.tokens[token]
    if (!email) throw unauthorized()
    const userId = await this.findUserIdByEmail(email)
    if (!userId) throw unauthorized()
    return { userId }
  }
}
