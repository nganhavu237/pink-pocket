import { Router } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { createCategoryBudgets } from '../services/category-budget.service.js'
import { budgetInput, id, period } from '../validators/finance.js'

const input = budgetInput.extend({ categoryId: id })
export function categoryBudgetRoutes(db: PrismaClient) {
  const router = Router(),
    budgets = createCategoryBudgets(db)
  router.get('/', async (req, res) => {
    const { month, year } = period.parse(req.query)
    res.json({
      data: await budgets.list(res.locals.session.userId, month, year),
    })
  })
  router.put('/', async (req, res) => {
    const value = input.parse(req.body)
    await budgets.set(res.locals.session.userId, value)
    res.status(204).end()
  })
  router.delete('/:id', async (req, res) => {
    await budgets.remove(res.locals.session.userId, id.parse(req.params.id))
    res.status(204).end()
  })
  return router
}
