import { Router } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { createCategories } from '../services/category.service.js'
import { categoryInput, categoryRename } from '../validators/category.js'
import { id } from '../validators/finance.js'
export function categoryRoutes(db: PrismaClient) {
  const router = Router(),
    categories = createCategories(db)
  router.get('/', async (_req, res) =>
    res.json({ data: await categories.list(res.locals.session.userId) }),
  )
  router.post('/', async (req, res) =>
    res
      .status(201)
      .json({
        data: await categories.create(
          res.locals.session.userId,
          categoryInput.parse(req.body),
        ),
      }),
  )
  router.put('/:id', async (req, res) =>
    res.json({
      data: await categories.rename(
        res.locals.session.userId,
        id.parse(req.params.id),
        categoryRename.parse(req.body).name,
      ),
    }),
  )
  router.delete('/:id', async (req, res) => {
    await categories.remove(res.locals.session.userId, id.parse(req.params.id))
    res.status(204).end()
  })
  return router
}
