import { Router } from 'express'
import { healthController } from '../controllers/health.controller.js'

export function healthRoutes(checkDatabase: () => Promise<void>) {
  const router = Router()
  router.get('/health', healthController(checkDatabase))
  return router
}
