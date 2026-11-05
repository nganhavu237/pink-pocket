import express from 'express'
import type { PrismaClient } from './generated/prisma/client.js'
import type { AuthConfig } from './services/auth.service.js'
import { apiRoutes } from './routes/api.routes.js'
import cors from 'cors'
import { healthRoutes } from './routes/health.routes.js'
import { errorHandler, HttpError } from './middleware/error-handler.js'

type AppOptions = {
  db?: PrismaClient
  auth?: AuthConfig
  frontendOrigins: string[]
  checkDatabase: () => Promise<void>
}

export function createApp({
  frontendOrigins,
  checkDatabase,
  db,
  auth,
}: AppOptions) {
  const app = express()
  app.disable('x-powered-by')
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || frontendOrigins.includes(origin)) callback(null, true)
        else
          callback(
            new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed'),
          )
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  )
  app.use(express.json({ limit: '16kb' }))
  app.use('/api', healthRoutes(checkDatabase))
  if (db && auth) app.use('/api', apiRoutes(db, auth, frontendOrigins))
  app.use((_req, _res, next) =>
    next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found')),
  )
  app.use(errorHandler)
  return app
}
