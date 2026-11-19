import { Router } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { createTasks } from '../services/task.service.js'
import { taskInput, taskUpdate } from '../validators/task.js'
import { id } from '../validators/finance.js'

// Mounted behind the existing cookie authentication, Origin and CSRF middleware.
export function taskRoutes(db: PrismaClient) {
  const router = Router(),
    tasks = createTasks(db)
  router.get('/', async (_req, res) =>
    res.json({ data: await tasks.list(res.locals.session.userId) }),
  )
  router.post('/', async (req, res) =>
    res
      .status(201)
      .json({
        data: await tasks.create(
          res.locals.session.userId,
          taskInput.parse(req.body),
        ),
      }),
  )
  router.put('/:id', async (req, res) =>
    res.json({
      data: await tasks.update(
        res.locals.session.userId,
        id.parse(req.params.id),
        taskUpdate.parse(req.body),
      ),
    }),
  )
  router.delete('/:id', async (req, res) => {
    await tasks.remove(res.locals.session.userId, id.parse(req.params.id))
    res.status(204).end()
  })
  return router
}
