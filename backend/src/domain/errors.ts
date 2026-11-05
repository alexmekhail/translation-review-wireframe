/**
 * Explicit failure outcomes. Services throw AppError; the HTTP layer maps
 * `status` and `code` to the response body. Anything else becomes a 500.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const unauthorized = () => new AppError(401, 'unauthorized', 'A valid session is required.')

/** Used both for "does not exist" and "you have no assignment", so access probes reveal nothing. */
export const notFound = (what = 'Book') => new AppError(404, 'not_found', `${what} not found.`)

export const forbidden = (message: string) => new AppError(403, 'forbidden', message)

export const invalid = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, 'validation_error', message, details)

export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details)
