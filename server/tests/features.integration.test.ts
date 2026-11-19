import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { createApp } from '../src/app.js'
import { createFinance } from '../src/services/finance.service.js'
import {
  processRecurring,
  followingMonth,
  startRecurringWorker,
} from '../src/services/recurring.service.js'
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
  secret = 'feature-tests-only-secret-at-least-32-characters'
const app = createApp({
  db,
  auth: { jwtSecret: secret, secureCookies: false },
  frontendOrigins: [origin],
  checkDatabase: async () => {
    await db.$queryRaw`SELECT 1`
  },
})
const finance = createFinance(db)
async function fixture(startingBalance = '0.00') {
  const user = await db.user.create({
    data: {
      name: 'Feature test',
      email: `${randomUUID()}@example.test`,
      passwordHash: 'not-used-for-login',
      startingBalance,
    },
  })
  ids.push(user.id)
  const category = await db.category.create({
    data: { userId: user.id, name: 'Bills', type: 'EXPENSE' },
  })
  const income = await db.category.create({
    data: { userId: user.id, name: 'Salary', type: 'INCOME' },
  })
  const session = await db.session.create({
    data: {
      userId: user.id,
      csrfToken: 'test-csrf',
      expiresAt: new Date(Date.now() + 86400000),
    },
  })
  const token = jwt.sign({}, secret, {
    subject: user.id,
    jwtid: session.id,
    issuer: 'pink-pocket',
    audience: 'pink-pocket-web',
    expiresIn: '1d',
  })
  const cookie = `pink_pocket_session=${token}`
  const input = {
    amount: '10.00',
    type: 'EXPENSE' as const,
    categoryId: category.id,
    date: '2050-01-31',
    description: 'Monthly bill',
    recurring: true,
  }
  return {
    user,
    category,
    income,
    input,
    get: (path: string) =>
      request(app).get(`/api${path}`).set('Cookie', cookie),
    put: (path: string, body: object) =>
      request(app)
        .put(`/api${path}`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'test-csrf')
        .send(body),
    del: (path: string) =>
      request(app)
        .delete(`/api${path}`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'test-csrf'),
  }
}
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
})

describe('monthly schedules', () => {
  it.each([
    ['2050-01-31', '2050-02-28'],
    ['2052-01-31', '2052-02-29'],
    ['2052-02-29', '2052-03-31'],
    ['2050-12-31', '2051-01-31'],
  ])('preserves day 31 after %s', (start, end) => {
    expect(
      followingMonth(new Date(start + 'T00:00:00Z'), 31)
        ?.toISOString()
        .slice(0, 10),
    ).toBe(end)
  })
  it('catches up missed months and prevents database duplicates', async () => {
    const f = await fixture()
    const original = await finance.save(f.user.id, f.input)
    expect(
      await processRecurring(db, {
        userId: f.user.id,
        now: new Date('2050-06-01T23:00:00Z'),
      }),
    ).toBe(4)
    const rows = await db.transaction.findMany({
      where: { userId: f.user.id },
      orderBy: { date: 'asc' },
    })
    expect(rows.map((row) => row.date.toISOString().slice(0, 10))).toEqual([
      '2050-01-31',
      '2050-02-28',
      '2050-03-31',
      '2050-04-30',
      '2050-05-31',
    ])
    expect(
      rows.every(
        (row) => row.userId === f.user.id && row.amount.toFixed(2) === '10.00',
      ),
    ).toBe(true)
    expect(
      await processRecurring(db, {
        userId: f.user.id,
        now: new Date('2050-06-01'),
      }),
    ).toBe(0)
    await expect(
      db.transaction.create({
        data: {
          userId: f.user.id,
          categoryId: f.category.id,
          type: 'EXPENSE',
          amount: '10',
          date: new Date('2050-01-31'),
          recurringId: original.recurringId,
          occurrenceMonth: new Date('2050-01-01'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })
  it('handles concurrent workers exactly once', async () => {
    const f = await fixture()
    await finance.save(f.user.id, f.input)
    const result = await Promise.all([
      processRecurring(db, { userId: f.user.id, now: new Date('2050-02-28') }),
      processRecurring(db, { userId: f.user.id, now: new Date('2050-02-28') }),
    ])
    expect(result.reduce((sum, n) => sum + n, 0)).toBe(1)
    expect(await db.transaction.count({ where: { userId: f.user.id } })).toBe(2)
  })
  it('does not regenerate deleted occurrences on retry', async () => {
    const f = await fixture()
    const first = await finance.save(f.user.id, f.input)
    await processRecurring(db, {
      userId: f.user.id,
      now: new Date('2050-02-28'),
    })
    const feb = await db.transaction.findFirstOrThrow({
      where: { userId: f.user.id, date: new Date('2050-02-28') },
    })
    await finance.remove(f.user.id, feb.id)
    await db.recurringRule.update({
      where: { id: first.recurringId! },
      data: { nextDate: new Date('2050-02-28') },
    })
    expect(
      await processRecurring(db, {
        userId: f.user.id,
        now: new Date('2050-02-28'),
      }),
    ).toBe(0)
    expect(await db.transaction.count({ where: { userId: f.user.id } })).toBe(1)
  })
  it('updates future values without rewriting other historical occurrences', async () => {
    const f = await fixture()
    const first = await finance.save(f.user.id, f.input)
    await processRecurring(db, {
      userId: f.user.id,
      now: new Date('2050-02-28'),
    })
    await finance.save(f.user.id, { ...f.input, amount: '12.34' }, first.id)
    await processRecurring(db, {
      userId: f.user.id,
      now: new Date('2050-03-31'),
    })
    const rows = await db.transaction.findMany({
      where: { userId: f.user.id },
      orderBy: { date: 'asc' },
    })
    expect(rows.map((row) => row.amount.toFixed(2))).toEqual([
      '12.34',
      '10.00',
      '12.34',
    ])
  })
  it('enables/stops repeats through transaction editing', async () => {
    const f = await fixture()
    const first = await finance.save(f.user.id, {
      ...f.input,
      recurring: false,
    })
    expect(first.recurringId).toBeNull()
    expect(
      (await finance.save(f.user.id, f.input, first.id)).recurring?.active,
    ).toBe(true)
    await finance.save(f.user.id, { ...f.input, recurring: false }, first.id)
    expect(
      await processRecurring(db, {
        userId: f.user.id,
        now: new Date('2051-01-31'),
      }),
    ).toBe(0)
  })
  it('protects schedule ownership, edits, stops, and preserves the anchor day', async () => {
    const f = await fixture(),
      other = await fixture()
    const first = await finance.save(f.user.id, f.input)
    expect((await other.get('/recurring')).body.data).toEqual([])
    expect(
      (
        await other.put(`/recurring/${first.recurringId}`, {
          ...f.input,
          date: '2050-02-28',
        })
      ).status,
    ).toBe(404)
    expect((await other.del(`/recurring/${first.recurringId}`)).status).toBe(
      404,
    )
    expect(
      (
        await f.put(`/recurring/${first.recurringId}`, {
          ...f.input,
          date: '2050-02-28',
          amount: '25.00',
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await db.recurringRule.findUniqueOrThrow({
          where: { id: first.recurringId! },
        })
      ).day,
    ).toBe(31)
    expect(
      (
        await f.put(`/recurring/${first.recurringId}`, {
          ...f.input,
          date: '2050-02-28',
          categoryId: other.category.id,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await f.put(`/recurring/${first.recurringId}`, {
          ...f.input,
          date: '2000-01-01',
        })
      ).status,
    ).toBe(400)
    expect((await f.del(`/recurring/${first.recurringId}`)).status).toBe(204)
    expect(
      await processRecurring(db, {
        userId: f.user.id,
        now: new Date('2051-01-31'),
      }),
    ).toBe(0)
  })
  it('catches up on a financial API read', async () => {
    const f = await fixture()
    const past = new Date()
    past.setUTCDate(1)
    past.setUTCMonth(past.getUTCMonth() - 2)
    await finance.save(f.user.id, {
      ...f.input,
      date: past.toISOString().slice(0, 10),
    })
    expect((await f.get('/transactions')).status).toBe(200)
    expect(await db.transaction.count({ where: { userId: f.user.id } })).toBe(3)
  })
  it('processes startup catch-up without user requests', async () => {
    const f = await fixture()
    const past = new Date()
    past.setUTCDate(1)
    past.setUTCMonth(past.getUTCMonth() - 1)
    await finance.save(f.user.id, {
      ...f.input,
      date: past.toISOString().slice(0, 10),
    })
    const stop = startRecurringWorker(db)
    await stop()
    expect(await db.transaction.count({ where: { userId: f.user.id } })).toBe(2)
  })
})

describe('read/edit catch-up regression', () => {
  it('returns the generated entry during concurrent financial reads', async () => {
    const f = await fixture()
    const past = new Date()
    past.setUTCDate(1)
    past.setUTCMonth(past.getUTCMonth() - 1)
    await finance.save(f.user.id, {
      ...f.input,
      date: past.toISOString().slice(0, 10),
    })
    const [entries, repeats] = await Promise.all([
      f.get('/transactions'),
      f.get('/recurring'),
    ])
    expect(entries.body.data.total).toBe(2)
    expect(repeats.body.data).toHaveLength(1)
  })
  it('posts overdue occurrences at old amounts before applying edits', async () => {
    const f = await fixture()
    const past = new Date()
    past.setUTCDate(1)
    past.setUTCMonth(past.getUTCMonth() - 1)
    const first = await finance.save(f.user.id, {
      ...f.input,
      date: past.toISOString().slice(0, 10),
    })
    await finance.save(
      f.user.id,
      { ...f.input, date: first.date, amount: '15.00' },
      first.id,
    )
    const current = await db.transaction.findFirstOrThrow({
      where: { userId: f.user.id, id: { not: first.id } },
    })
    expect(current.amount.toFixed(2)).toBe('10.00')
  })
})

describe('comparisons and starting balance', () => {
  it.each([
    ['100.00', '88.00', -12],
    ['100.00', '108.00', 8],
    ['100.00', '0.00', -100],
    ['0.00', '10.00', null],
    ['100.00', '100.00', 0],
  ])(
    'compares %s to %s across a year boundary',
    async (previous, current, percent) => {
      const f = await fixture()
      if (previous !== '0.00')
        await finance.save(f.user.id, {
          ...f.input,
          amount: previous,
          date: '2049-12-31',
          recurring: false,
        })
      if (current !== '0.00')
        await finance.save(f.user.id, {
          ...f.input,
          amount: current,
          date: '2050-01-01',
          recurring: false,
        })
      const summary = await finance.summary(f.user.id, 1, 2050)
      expect(summary.previousExpenses).toBe(previous)
      expect(summary.expenseChangePercent).toBe(percent)
      expect((await finance.summary(f.user.id, 2, 2050)).previousExpenses).toBe(
        current,
      )
    },
  )
  it('adds starting balance exactly, excluding it from income/analytics', async () => {
    const f = await fixture('50.10')
    await finance.save(f.user.id, {
      ...f.input,
      amount: '100.20',
      type: 'INCOME',
      categoryId: f.income.id,
      date: '2050-01-01',
      recurring: false,
    })
    await finance.save(f.user.id, {
      ...f.input,
      amount: '25.30',
      recurring: false,
    })
    const summary = await finance.summary(f.user.id, 1, 2050)
    expect(summary.balance).toBe('125.00')
    expect(summary.income).toBe('100.20')
    expect(summary.expenses).toBe('25.30')
    expect((await finance.trends(f.user.id, 1, 2050)).at(-1)?.income).toBe(
      '100.20',
    )
  })
  it('supports signed, zero and omitted starting balances and isolates users', async () => {
    const f = await fixture(),
      other = await fixture('100.00')
    const profile = { name: f.user.name, email: f.user.email, currency: 'USD' }
    const result = await f.put('/settings', {
      ...profile,
      startingBalance: '-12.34',
    })
    expect(result.status).toBe(200)
    expect(result.body.data.startingBalance).toBe('-12.34')
    expect((await f.get('/auth/me')).body.data.user.startingBalance).toBe(
      '-12.34',
    )
    expect((await finance.summary(f.user.id, 1, 2050)).balance).toBe('-12.34')
    expect((await f.put('/settings', profile)).body.data.startingBalance).toBe(
      '-12.34',
    )
    expect(
      (await f.put('/settings', { ...profile, startingBalance: '0.00' })).body
        .data.startingBalance,
    ).toBe('0.00')
    expect((await other.get('/auth/me')).body.data.user.startingBalance).toBe(
      '100.00',
    )
    expect(await db.transaction.count({ where: { userId: f.user.id } })).toBe(0)
    expect(
      (await f.put('/settings', { ...profile, startingBalance: '1.001' }))
        .status,
    ).toBe(400)
    expect(
      (await f.put('/settings', { ...profile, startingBalance: 'NaN' })).status,
    ).toBe(400)
  })
})
