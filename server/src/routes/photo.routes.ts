import express, { Router, type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { PrismaClient } from '../generated/prisma/client.js'
import {
  createPhotos,
  MAX_PHOTO_BYTES,
  PHOTO_TYPES,
} from '../services/photo.service.js'
import { HttpError } from '../middleware/error-handler.js'

export function photoRoutes(db: PrismaClient) {
  const router = Router(),
    photos = createPhotos(db)
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store')
    res.vary('Cookie')
    next()
  })
  router.get('/', async (_req, res) =>
    res.json({ data: await photos.info(res.locals.session.userId) }),
  )
  router.get('/photo', async (_req, res) => {
    const photo = await photos.get(res.locals.session.userId)
    res.set({
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline; filename="my-space.webp"',
      'Cross-Origin-Resource-Policy': 'same-origin',
    })
    res.send(Buffer.from(photo.data))
  })
  const raw = express.raw({ type: PHOTO_TYPES, limit: MAX_PHOTO_BYTES })
  const parsePhoto: RequestHandler = (req, res, next) =>
    raw(req, res, (error: unknown) => {
      if ((error as { type?: string } | null)?.type === 'entity.too.large')
        next(new HttpError(413, 'PHOTO_TOO_LARGE', 'Choose a photo up to 5 MB'))
      else next(error)
    })
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json({
          error: {
            code: 'PHOTO_RATE_LIMIT',
            message: 'Too many uploads. Try again later.',
          },
        }),
  })
  router.put('/photo', limit, parsePhoto, async (req, res) => {
    const type = (req.get('Content-Type') ?? '')
      .split(';')[0]!
      .trim()
      .toLowerCase()
    if (!PHOTO_TYPES.includes(type))
      throw new HttpError(415, 'PHOTO_TYPE', 'Use a JPEG, PNG or WebP photo')
    if (!Buffer.isBuffer(req.body))
      throw new HttpError(400, 'PHOTO_INVALID', 'Choose a valid photo')
    res.json({
      data: await photos.save(res.locals.session.userId, req.body, type),
    })
  })
  router.delete('/photo', async (_req, res) => {
    await photos.remove(res.locals.session.userId)
    res.status(204).end()
  })
  return router
}
