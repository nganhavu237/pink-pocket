import type { RequestHandler } from 'express'
import { HttpError } from '../middleware/error-handler.js'

export function healthController(
  checkDatabase: () => Promise<void>,
): RequestHandler {
  return async (_req, res) => {
    try {
      await checkDatabase()
    } catch {
      throw new HttpError(
        503,
        'DATABASE_UNAVAILABLE',
        'Database is unavailable',
      )
    }
    res.status(200).json({ data: { status: 'ok', database: 'connected' } })
  }
}
