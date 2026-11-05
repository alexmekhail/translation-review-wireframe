import { AppError } from '../domain/errors.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Rejects malformed identifiers before they reach SQL (400 invalid_id). */
export function requireId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new AppError(400, 'invalid_id', `${name} must be a UUID.`, { field: name })
  }
  return value.toLowerCase()
}
