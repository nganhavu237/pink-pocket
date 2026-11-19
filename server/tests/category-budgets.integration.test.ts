import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { createApp } from '../src/app.js'

const url = process.env.DATABASE_URL
if (
  process.env.NODE_ENV !== 'test' ||
  !url ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error('Dedicated test database required')
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    connectionTimeoutMillis: 5000,
  }),
})
const ids: string[] = [],
  origin = 'http://localhost:5173',
  secret = 'category-budget-test-only-secret-at-least-32-characters'
const app = createApp({
  db,
  auth: { jwtSecret: secret, secureCookies: false },
  frontendOrigins: [origin],
  checkDatabase: async () => {
    await db.$queryRaw`SELECT 1`
  },
})
async function account() {
  const user = await db.user.create({
    data: {
      name: 'Category budget test',
      email: `${randomUUID()}@example.test`,
      passwordHash: 'unused-test-hash',
    },
  })
  ids.push(user.id)
  const session = await db.session.create({
    data: {
      userId: user.id,
      csrfToken: 'photo-csrf',
      expiresAt: new Date(Date.now() + 86400000),
    },
  })
  const token = jwt.sign({}, secret, {
      subject: user.id,
      jwtid: session.id,
      issuer: 'pink-pocket',
      audience: 'pink-pocket-web',
      expiresIn: '1d',
    }),
    cookie = `pink_pocket_session=${token}`
  return {
    user,
    cookie,
    get: (path: string) =>
      request(app)
        .get('/api' + path)
        .set('Cookie', cookie),
    put: (path: string, body: object) =>
      request(app)
        .put('/api' + path)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', 'photo-csrf')
        .send(body),
    remove: (path: string) =>
      request(app)
        .delete('/api' + path)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', 'photo-csrf'),
  }
}
let alice: Awaited<ReturnType<typeof account>>,
  bob: Awaited<ReturnType<typeof account>>
let food: string, income: string, foreign: string
beforeAll(async () => {
  alice = await account()
  bob = await account()
  food = (
    await db.category.create({
      data: { userId: alice.user.id, name: 'Food', type: 'EXPENSE' },
    })
  ).id
  income = (
    await db.category.create({
      data: { userId: alice.user.id, name: 'Salary', type: 'INCOME' },
    })
  ).id
  foreign = (
    await db.category.create({
      data: { userId: bob.user.id, name: 'Food', type: 'EXPENSE' },
    })
  ).id
})
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
})
const path = '/category-budgets'
const input = (categoryId: string, amount = '100.00') => ({
  categoryId,
  amount,
  month: 2,
  year: 2024,
})

describe('category budgets', () => {
  it('requires authentication and CSRF protection', async () => {
    expect((await request(app).get('/api' + path)).status).toBe(401)
    expect(
      (
        await request(app)
          .put('/api' + path)
          .set('Origin', origin)
          .set('Cookie', alice.cookie)
          .send(input(food))
      ).status,
    ).toBe(403)
  })
  it.each(['0', '-1', '1.001', 'NaN', '100000000000000000'])(
    'rejects invalid amount %s',
    async (amount) => {
      expect((await alice.put(path, input(food, amount))).status).toBe(400)
    },
  )
  it('rejects invalid periods, income, archived and foreign categories', async () => {
    for (const body of [
      { ...input(food), month: 13 },
      { ...input(food), year: 0 },
      input(income),
      input(foreign),
      { ...input(food), categoryId: 'bad' },
      { ...input(food), unexpected: true },
    ]) {
      expect((await alice.put(path, body)).status).toBe(400)
    }
    const archived = await db.category.create({
      data: {
        name: 'Archived',
        type: 'EXPENSE',
        isArchived: true,
        userId: alice.user.id,
      },
    })
    expect((await alice.put(path, input(archived.id))).status).toBe(400)
  })
  it('uses precise expense totals within the selected month and preserves overall budgets', async () => {
    await db.budget.create({
      data: { userId: alice.user.id, year: 2024, month: 2, amount: '500.00' },
    })
    await db.transaction.createMany({
      data: [
        {
          userId: alice.user.id,
          categoryId: food,
          type: 'EXPENSE',
          amount: '0.10',
          date: new Date('2024-02-01Z'),
        },
        {
          userId: alice.user.id,
          categoryId: food,
          type: 'EXPENSE',
          amount: '0.20',
          date: new Date('2024-02-29Z'),
        },
        {
          userId: alice.user.id,
          categoryId: food,
          type: 'EXPENSE',
          amount: '99',
          date: new Date('2024-03-01Z'),
        },
        {
          userId: alice.user.id,
          categoryId: food,
          type: 'EXPENSE',
          amount: '99',
          date: new Date('2024-01-31Z'),
        },
        {
          userId: alice.user.id,
          categoryId: income,
          type: 'INCOME',
          amount: '300',
          date: new Date('2024-02-15Z'),
        },
        {
          userId: bob.user.id,
          categoryId: foreign,
          type: 'EXPENSE',
          amount: '700',
          date: new Date('2024-02-15Z'),
        },
      ],
    })
    const before = (await alice.get('/budgets?month=2&year=2024')).body.data
    expect((await alice.put(path, input(food, '0.25'))).status).toBe(204)
    const response = await alice.get(path + '?month=2&year=2024')
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({
      categoryId: food,
      amount: '0.25',
      spent: '0.30',
      remaining: '-0.05',
      percentage: 120,
      exceeded: true,
    })
    expect((await alice.get('/budgets?month=2&year=2024')).body.data).toEqual(
      before,
    )
    expect((await alice.get(path + '?month=1&year=2024')).body.data).toEqual([])
    expect((await bob.get(path + '?month=2&year=2024')).body.data).toEqual([])
  })
  it('updates the same category once per month and keeps months independent', async () => {
    const responses = await Promise.all([
      alice.put(path, input(food, '50')),
      alice.put(path, input(food, '60')),
    ])
    expect(responses.map((r) => r.status)).toEqual([204, 204])
    expect(
      await db.categoryBudget.count({
        where: {
          userId: alice.user.id,
          categoryId: food,
          month: 2,
          year: 2024,
        },
      }),
    ).toBe(1)
    expect(
      (await alice.put(path, { ...input(food, '80'), month: 3 })).status,
    ).toBe(204)
    expect(
      (await alice.get(path + '?month=3&year=2024')).body.data[0],
    ).toMatchObject({ amount: '80.00', spent: '99.00', remaining: '-19.00' })
  })
  it('supports custom category names, protects their history and removes only the limit', async () => {
    expect(
      (await alice.put(`/categories/${food}`, { name: 'Groceries' })).status,
    ).toBe(200)
    const budgets = (await alice.get(path + '?month=2&year=2024')).body.data
    expect(budgets[0].category.name).toBe('Groceries')
    expect((await alice.remove(`/categories/${food}`)).status).toBe(409)
    expect((await bob.remove(path + '/' + budgets[0].id)).status).toBe(404)
    const transactionCount = await db.transaction.count({
      where: { userId: alice.user.id },
    })
    expect((await alice.remove(path + '/' + budgets[0].id)).status).toBe(204)
    expect((await alice.get(path + '?month=2&year=2024')).body.data).toEqual([])
    expect(
      await db.transaction.count({ where: { userId: alice.user.id } }),
    ).toBe(transactionCount)
    expect(
      (await alice.get('/budgets?month=2&year=2024')).body.data.amount,
    ).toBe('500.00')
  })
  it('blocks deleting a custom category that only has budgets until its limits are removed', async () => {
    const category = await db.category.create({
      data: { name: 'Hobbies', type: 'EXPENSE', userId: alice.user.id },
    })
    expect((await alice.put(path, input(category.id))).status).toBe(204)
    expect((await alice.remove('/categories/' + category.id)).status).toBe(409)
    const budget = await db.categoryBudget.findFirstOrThrow({
      where: { categoryId: category.id },
    })
    expect((await alice.remove(path + '/' + budget.id)).status).toBe(204)
    expect((await alice.remove('/categories/' + category.id)).status).toBe(204)
  })
  it('enforces ownership, expense type, uniqueness, positive limits and valid periods in the database', async () => {
    const base = {
      userId: alice.user.id,
      categoryId: food,
      year: 2025,
      month: 1,
      amount: '50',
    }
    await db.categoryBudget.create({ data: base })
    for (const data of [
      base,
      { ...base, month: 2, categoryId: foreign },
      { ...base, month: 2, categoryId: income, type: 'INCOME' as const },
      { ...base, month: 0 },
      { ...base, month: 13 },
      { ...base, year: 0 },
      { ...base, month: 2, amount: '0' },
    ]) {
      await expect(db.categoryBudget.create({ data })).rejects.toThrow()
    }
  })
  it('refreshes totals when transactions change or are deleted', async () => {
    const row = await db.transaction.create({
      data: {
        userId: alice.user.id,
        categoryId: food,
        type: 'EXPENSE',
        amount: '20.00',
        date: new Date('2025-01-12Z'),
      },
    })
    expect(
      (await alice.get(path + '?month=1&year=2025')).body.data[0].spent,
    ).toBe('20.00')
    await db.transaction.update({
      where: { id: row.id },
      data: { amount: '35.50' },
    })
    expect(
      (await alice.get(path + '?month=1&year=2025')).body.data[0].remaining,
    ).toBe('14.50')
    await db.transaction.delete({ where: { id: row.id } })
    expect(
      (await alice.get(path + '?month=1&year=2025')).body.data[0].spent,
    ).toBe('0.00')
  })
  it('catches up recurring expenses before calculating category usage', async () => {
    const now = new Date(),
      month = now.getUTCMonth() + 1,
      year = now.getUTCFullYear()
    await alice.put(path, { ...input(food, '100'), month, year })
    const nextDate = new Date(Date.UTC(year, month - 1, 1))
    const rule = await db.recurringRule.create({
      data: {
        userId: alice.user.id,
        categoryId: food,
        type: 'EXPENSE',
        amount: '10.50',
        day: 1,
        nextDate,
      },
    })
    try {
      const response = await alice.get(`${path}?month=${month}&year=${year}`)
      expect(response.body.data[0]).toMatchObject({
        spent: '10.50',
        remaining: '89.50',
      })
      expect(
        (await alice.get(`${path}?month=${month}&year=${year}`)).body.data[0]
          .spent,
      ).toBe('10.50')
    } finally {
      await db.transaction.deleteMany({ where: { recurringId: rule.id } })
      await db.recurringRule.delete({ where: { id: rule.id } })
    }
  })
})
