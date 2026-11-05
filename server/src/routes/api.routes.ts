import { Router, type RequestHandler } from 'express'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import type { PrismaClient } from '../generated/prisma/client.js'
import {
  createAuth,
  userSelect,
  type AuthConfig,
} from '../services/auth.service.js'
import { createFinance } from '../services/finance.service.js'
import {
  budgetInput,
  id,
  listQuery,
  loginInput,
  period,
  profileInput,
  registerInput,
  transactionInput,
} from '../validators/finance.js'
import { HttpError } from '../middleware/error-handler.js'

export function apiRoutes(
  db: PrismaClient,
  config: AuthConfig,
  origins: string[],
) {
  const router = Router()
  const auth = createAuth(db, config)
  const finance = createFinance(db)
  router.use(cookieParser())
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.use((req, _res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !origins.includes(req.get('Origin') || '')
    )
      throw new HttpError(
        403,
        'ORIGIN_REQUIRED',
        'Use an approved frontend origin',
      )
    next()
  })
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json({
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Too many attempts. Try again in 15 minutes.',
          },
        }),
  })
  router.post('/auth/register', limiter, async (req, res) => {
    const input = registerInput.parse(req.body)
    const user = await auth.register(input)
    const csrfToken = await auth.issueSession(user.id, res)
    res.status(201).json({ data: { user, csrfToken } })
  })
  router.post('/auth/login', limiter, async (req, res) => {
    const input = loginInput.parse(req.body)
    const user = await auth.login(input.email, input.password)
    const csrfToken = await auth.issueSession(user.id, res)
    res.json({ data: { user, csrfToken } })
  })
  router.use(auth.requireAuth)
  const owner = (res: Parameters<RequestHandler>[1]): string =>
    res.locals.session.userId
  router.get('/auth/me', (_req, res) =>
    res.json({
      data: {
        user: res.locals.session.user,
        csrfToken: res.locals.session.csrfToken,
      },
    }),
  )
  router.post('/auth/logout', async (_req, res) => {
    await auth.logout(res.locals.session.id, res)
    res.status(204).end()
  })
  router.get('/categories', async (_req, res) =>
    res.json({
      data: await db.category.findMany({
        where: { userId: owner(res) },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
    }),
  )
  router.get('/transactions', async (req, res) =>
    res.json({
      data: await finance.list(owner(res), listQuery.parse(req.query)),
    }),
  )
  router.post('/transactions', async (req, res) =>
    res
      .status(201)
      .json({
        data: await finance.save(owner(res), transactionInput.parse(req.body)),
      }),
  )
  router.put('/transactions/:id', async (req, res) =>
    res.json({
      data: await finance.save(
        owner(res),
        transactionInput.parse(req.body),
        id.parse(req.params.id),
      ),
    }),
  )
  router.delete('/transactions/:id', async (req, res) => {
    await finance.remove(owner(res), id.parse(req.params.id))
    res.status(204).end()
  })
  router.get('/budgets', async (req, res) => {
    const { month, year } = period.parse(req.query)
    res.json({ data: await finance.budget(owner(res), month, year) })
  })
  router.put('/budgets', async (req, res) => {
    const { month, year, amount } = budgetInput.parse(req.body)
    res.json({ data: await finance.setBudget(owner(res), month, year, amount) })
  })
  router.get('/dashboard/summary', async (req, res) => {
    const { month, year } = period.parse(req.query)
    res.json({ data: await finance.summary(owner(res), month, year) })
  })
  router.get('/analytics', async (req, res) => {
    const { month, year } = period.parse(req.query)
    res.json({ data: await finance.trends(owner(res), month, year) })
  })
  router.put('/settings', async (req, res) =>
    res.json({
      data: await db.user.update({
        where: { id: owner(res) },
        data: profileInput.parse(req.body),
        select: userSelect,
      }),
    }),
  )
  return router
}
