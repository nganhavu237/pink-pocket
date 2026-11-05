import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '../src/generated/prisma/client.js'
import { createApp } from '../src/app.js'
import { checkDatabase } from '../src/services/health.service.js'

// Never run database tests against the development or production database.
const connectionString = process.env.DATABASE_URL
if (
  process.env.NODE_ENV !== 'test' ||
  !connectionString ||
  !new URL(connectionString).pathname.endsWith('_test')
) {
  throw new Error(
    'Use NODE_ENV=test and a dedicated DATABASE_URL whose database name ends in _test',
  )
}
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }),
})
afterAll(() => db.$disconnect())

async function fixture(tx: Prisma.TransactionClient) {
  const user = await tx.user.create({
    data: {
      name: 'Schema test',
      email: `${randomUUID()}@example.test`,
      passwordHash: 'test-only-not-an-authentication-fixture',
    },
  })
  const category = await tx.category.create({
    data: { userId: user.id, name: 'Food', type: 'EXPENSE' },
  })
  return { user, category }
}
const rollback = new Error('Rollback successful test fixtures')
async function withRollback(
  run: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  try {
    await db.$transaction(async (tx) => {
      await run(tx)
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }
}

describe('PostgreSQL schema', () => {
  it('serves health using a real database query', async () => {
    const app = createApp({
      frontendOrigins: ['http://localhost:5173'],
      checkDatabase: () => checkDatabase(db),
    })
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.data.database).toBe('connected')
  })
  it('round-trips exact decimals, nullable descriptions, and date-only values', async () => {
    await withRollback(async (tx) => {
      const { user, category } = await fixture(tx)
      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          categoryId: category.id,
          type: 'EXPENSE',
          amount: '12345678901234567.89',
          date: new Date('2026-11-01T00:00:00Z'),
        },
      })
      expect(transaction.amount.toFixed(2)).toBe('12345678901234567.89')
      expect(transaction.description).toBeNull()
      expect(transaction.date.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    })
  })
  it('prevents duplicate monthly budgets', async () => {
    await expect(
      db.$transaction(async (tx) => {
        const { user } = await fixture(tx)
        const data = {
          userId: user.id,
          amount: '100.00',
          month: 11,
          year: 2026,
        }
        await tx.budget.create({ data })
        await tx.budget.create({ data })
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })
  it('prevents assigning another user’s category', async () => {
    await expect(
      db.$transaction(async (tx) => {
        const first = await fixture(tx)
        const second = await fixture(tx)
        await tx.transaction.create({
          data: {
            userId: first.user.id,
            categoryId: second.category.id,
            amount: '10.00',
            type: 'EXPENSE',
          },
        })
      }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })
  it('prevents mismatched transaction and category types', async () => {
    await expect(
      db.$transaction(async (tx) => {
        const { user, category } = await fixture(tx)
        await tx.transaction.create({
          data: {
            userId: user.id,
            categoryId: category.id,
            amount: '10.00',
            type: 'INCOME',
          },
        })
      }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })
  it.each(['0.00', '-0.01'])(
    'rejects non-positive transaction amounts: %s',
    async (amount) => {
      await expect(
        db.$transaction(async (tx) => {
          const { user, category } = await fixture(tx)
          await tx.transaction.create({
            data: {
              userId: user.id,
              categoryId: category.id,
              amount,
              type: 'EXPENSE',
            },
          })
        }),
      ).rejects.toThrow()
    },
  )
  it.each([
    { amount: '0.00', month: 11, year: 2026 },
    { amount: '10.00', month: 13, year: 2026 },
    { amount: '10.00', month: 1, year: 0 },
  ])('rejects invalid budget values: %j', async (values) => {
    await expect(
      db.$transaction(async (tx) => {
        const { user } = await fixture(tx)
        await tx.budget.create({ data: { userId: user.id, ...values } })
      }),
    ).rejects.toThrow()
  })
})
