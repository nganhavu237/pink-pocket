import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '../generated/prisma/client.js'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  if (error instanceof HttpError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } })
    return
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message ?? 'Invalid request',
        details: error.issues.map(({ path, message }) => ({
          field: path.join('.'),
          message,
        })),
      },
    })
    return
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res
        .status(409)
        .json({
          error: {
            code: 'CONFLICT',
            message:
              'This record already exists. For accounts, try logging in.',
          },
        })
      return
    }
    if (error.code === 'P2025') {
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Record not found' } })
      return
    }
    if (error.code === 'P2003') {
      res
        .status(400)
        .json({
          error: {
            code: 'INVALID_REFERENCE',
            message: 'Invalid category or record reference',
          },
        })
      return
    }
  }
  const bodyError = error as { type?: string } | null
  if (bodyError?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
      },
    })
    return
  }
  if (bodyError?.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds 16 KB',
      },
    })
    return
  }
  // Do not send database errors, stack traces, or configuration values to clients.
  console.error('Unhandled API error')
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  })
}
