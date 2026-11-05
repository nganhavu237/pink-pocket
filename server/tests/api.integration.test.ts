import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { createApp } from '../src/app.js'
import { checkDatabase } from '../src/services/health.service.js'

const url = process.env.DATABASE_URL
if (
  process.env.NODE_ENV !== 'test' ||
  !url ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error('Dedicated _test database required')
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    connectionTimeoutMillis: 5000,
  }),
})
const origin = 'http://localhost:5173'
const secret = randomBytes(48).toString('hex')
const app = createApp({
  db,
  auth: { jwtSecret: secret, secureCookies: false },
  frontendOrigins: [origin],
  checkDatabase: () => checkDatabase(db),
})
const users: string[] = []
const password = 'PinkPocket-test-123!'
function cookieHeader(response: request.Response): string {
  const value = response.headers['set-cookie']
  const header = Array.isArray(value) ? value[0] : value
  if (typeof header !== 'string') throw new Error('Expected a session cookie')
  return header
}
function sessionCookie(response: request.Response): string {
  return cookieHeader(response).split(';')[0]!
}
async function register(name: string) {
  const email = `${randomUUID()}@example.test`
  const response = await request(app)
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ name, email, password })
  if (response.body.data?.user.id) users.push(response.body.data.user.id)
  expect(response.status).toBe(201)
  return {
    id: response.body.data.user.id as string,
    email,
    cookie: sessionCookie(response),
    csrf: response.body.data.csrfToken as string,
    response,
  }
}
type Account = Awaited<ReturnType<typeof register>>
let alice: Account, bob: Account, food: string, salary: string, bobFood: string
function get(path: string, account = alice) {
  return request(app).get(`/api${path}`).set('Cookie', account.cookie)
}
function post(path: string, body: object, account = alice) {
  return request(app)
    .post(`/api${path}`)
    .set('Origin', origin)
    .set('Cookie', account.cookie)
    .set('X-CSRF-Token', account.csrf)
    .send(body)
}
function put(path: string, body: object, account = alice) {
  return request(app)
    .put(`/api${path}`)
    .set('Origin', origin)
    .set('Cookie', account.cookie)
    .set('X-CSRF-Token', account.csrf)
    .send(body)
}
function del(path: string, account = alice) {
  return request(app)
    .delete(`/api${path}`)
    .set('Origin', origin)
    .set('Cookie', account.cookie)
    .set('X-CSRF-Token', account.csrf)
}
beforeAll(async () => {
  alice = await register('Alice')
  bob = await register('Bob')
  const cats = await get('/categories')
  food = cats.body.data.find((c: { name: string }) => c.name === 'Food').id
  salary = cats.body.data.find((c: { name: string }) => c.name === 'Salary').id
  bobFood = (await get('/categories', bob)).body.data.find(
    (c: { name: string }) => c.name === 'Food',
  ).id
}, 15000)
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.$disconnect()
})

describe('authentication and isolation', () => {
  it('hashes passwords, creates defaults, and returns only safe account fields', async () => {
    expect(alice.response.body.data.user.passwordHash).toBeUndefined()
    const stored = await db.user.findUniqueOrThrow({ where: { id: alice.id } })
    expect(stored.passwordHash).not.toBe(password)
    expect(await bcrypt.compare(password, stored.passwordHash)).toBe(true)
    expect((await get('/categories')).body.data).toHaveLength(9)
    const cookie = cookieHeader(alice.response)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/api')
  })
  it('normalizes emails and rejects duplicate registration', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'Duplicate',
        email: ` ${alice.email.toUpperCase()} `,
        password,
      })
    expect(response.status).toBe(409)
  })
  it('rejects invalid inputs and absent browser origins', async () => {
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .set('Origin', origin)
          .send({ name: '', email: 'bad', password: 'short' })
      ).status,
    ).toBe(400)
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: alice.email, password })
      ).status,
    ).toBe(403)
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .set('Origin', origin)
          .send({
            name: 'Name',
            email: 'valid@example.test',
            password: '💗'.repeat(25),
          })
      ).status,
    ).toBe(400)
  })
  it('logs in with normalized email and rejects wrong passwords', async () => {
    const success = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: alice.email.toUpperCase(), password })
    expect(success.status).toBe(200)
    expect(success.body.data.user.id).toBe(alice.id)
    const failure = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: alice.email, password: 'wrong' })
    expect(failure.status).toBe(401)
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('Origin', origin)
          .send({ email: 'missing@example.test', password: 'wrong' })
      ).body.error.message,
    ).toBe(failure.body.error.message)
  })
  it('protects every financial endpoint and rejects forged cookies', async () => {
    for (const path of [
      '/auth/me',
      '/transactions',
      '/categories',
      '/budgets',
      '/dashboard/summary',
      '/analytics',
    ])
      expect((await request(app).get(`/api${path}`)).status).toBe(401)
  })
  it('rejects modified or expired JWTs', async () => {
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', 'pink_pocket_session=invalid')
      ).status,
    ).toBe(401)
    const expired = jwt.sign({}, secret, {
      algorithm: 'HS256',
      subject: alice.id,
      jwtid: randomUUID(),
      issuer: 'pink-pocket',
      audience: 'pink-pocket-web',
      expiresIn: -1,
    })
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', `pink_pocket_session=${expired}`)
      ).status,
    ).toBe(401)
  })
  it('requires a CSRF token for authenticated writes', async () => {
    const response = await request(app)
      .post('/api/transactions')
      .set('Origin', origin)
      .set('Cookie', alice.cookie)
      .send({ amount: '1.00', type: 'EXPENSE', categoryId: food })
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('CSRF_INVALID')
  })
  it('returns zero summaries for an empty history', async () => {
    const result = (await get('/dashboard/summary?month=11&year=2026', bob))
      .body.data
    expect(result.balance).toBe('0.00')
    expect(result.income).toBe('0.00')
    expect(result.expenses).toBe('0.00')
    expect(result.recent).toEqual([])
    expect(result.breakdown).toEqual([])
    expect(result.budget.amount).toBeNull()
  })
})

describe('transaction API', () => {
  let id: string
  const input = () => ({
    amount: '12.34',
    type: 'EXPENSE',
    categoryId: food,
    date: '2026-11-01',
    description: 'Lunch',
  })
  it('creates and reads actual transactions', async () => {
    const response = await post('/transactions', input())
    expect(response.status).toBe(201)
    id = response.body.data.id
    expect(response.body.data.amount).toBe('12.34')
    expect(response.body.data.date).toBe('2026-11-01')
    expect(
      (await get('/transactions?month=11&year=2026')).body.data.items[0].id,
    ).toBe(id)
  })
  it('prevents cross-user reads, updates, and deletion', async () => {
    expect((await get('/transactions', bob)).body.data.items).toEqual([])
    expect(
      (
        await put(
          `/transactions/${id}`,
          { ...input(), categoryId: bobFood },
          bob,
        )
      ).status,
    ).toBe(404)
    expect((await del(`/transactions/${id}`, bob)).status).toBe(404)
    expect((await get('/transactions')).body.data.items).toHaveLength(1)
  })
  it('rejects foreign categories and mismatched types', async () => {
    expect(
      (await post('/transactions', { ...input(), categoryId: bobFood })).status,
    ).toBe(400)
    expect(
      (await post('/transactions', { ...input(), categoryId: salary })).status,
    ).toBe(400)
  })
  it.each([
    '0',
    '-1',
    '0.00',
    '1.001',
    'NaN',
    'abc',
    '',
    '1e3',
    100,
    '999999999999999999.00',
  ])('rejects invalid amount %j', async (amount) => {
    expect((await post('/transactions', { ...input(), amount })).status).toBe(
      400,
    )
  })
  it.each(['2026-02-30', 'not-a-date', '0000-01-01'])(
    'rejects invalid date %s',
    async (date) => {
      expect((await post('/transactions', { ...input(), date })).status).toBe(
        400,
      )
    },
  )
  it('updates without replacing omitted dates, then deletes', async () => {
    const response = await put(`/transactions/${id}`, {
      amount: '25.50',
      type: 'EXPENSE',
      categoryId: food,
      description: 'Dinner',
    })
    expect(response.status).toBe(200)
    expect(response.body.data.amount).toBe('25.50')
    expect(response.body.data.date).toBe('2026-11-01')
    expect((await del(`/transactions/${id}`)).status).toBe(204)
    expect((await del(`/transactions/${id}`)).status).toBe(404)
  })
  it('defaults the date and description when omitted', async () => {
    const response = await post('/transactions', {
      amount: '1.00',
      type: 'EXPENSE',
      categoryId: food,
    })
    expect(response.body.data.date).toBe(new Date().toISOString().slice(0, 10))
    expect(response.body.data.description).toBeNull()
    await del(`/transactions/${response.body.data.id}`)
  })
})

describe('monthly totals, filters, and budgets', () => {
  beforeAll(async () => {
    for (const data of [
      {
        amount: '1000.10',
        type: 'INCOME',
        categoryId: salary,
        date: '2026-11-01',
      },
      { amount: '0.10', type: 'EXPENSE', categoryId: food, date: '2026-11-01' },
      { amount: '0.20', type: 'EXPENSE', categoryId: food, date: '2026-11-30' },
      {
        amount: '20.00',
        type: 'EXPENSE',
        categoryId: food,
        date: '2026-10-31',
      },
      {
        amount: '50.00',
        type: 'INCOME',
        categoryId: salary,
        date: '2026-12-01',
      },
    ])
      expect((await post('/transactions', data)).status).toBe(201)
  })
  it('calculates exact totals and all-time balance across month boundaries', async () => {
    const summary = (await get('/dashboard/summary?month=11&year=2026')).body
      .data
    expect(summary.balance).toBe('1029.80')
    expect(summary.income).toBe('1000.10')
    expect(summary.expenses).toBe('0.30')
    expect(summary.breakdown).toEqual([
      { categoryId: food, name: 'Food', amount: '0.30' },
    ])
    expect(summary.recent).toHaveLength(3)
  })
  it('filters and paginates with descending dates', async () => {
    const result = (
      await get(
        `/transactions?month=11&year=2026&type=EXPENSE&categoryId=${food}&pageSize=1`,
      )
    ).body.data
    expect(result.total).toBe(2)
    expect(result.totalPages).toBe(2)
    expect(result.items[0].date).toBe('2026-11-30')
    expect((await get('/transactions?month=11')).status).toBe(400)
    expect((await get('/transactions?page=0')).status).toBe(400)
    expect((await get('/transactions?search=missing')).body.data.total).toBe(0)
  })
  it('creates and updates one monthly budget and indicates overspending', async () => {
    const first = await put('/budgets', {
      amount: '1.00',
      month: 11,
      year: 2026,
    })
    expect(first.status).toBe(200)
    expect(first.body.data.remaining).toBe('0.70')
    expect(first.body.data.percentage).toBe(30)
    const update = await put('/budgets', {
      amount: '0.20',
      month: 11,
      year: 2026,
    })
    expect(update.body.data.remaining).toBe('-0.10')
    expect(update.body.data.percentage).toBe(150)
    expect(update.body.data.exceeded).toBe(true)
    expect(
      await db.budget.count({
        where: { userId: alice.id, month: 11, year: 2026 },
      }),
    ).toBe(1)
    expect(
      (await get('/budgets?month=11&year=2026', bob)).body.data.amount,
    ).toBeNull()
    expect(
      (await put('/budgets', { amount: '0.00', month: 11, year: 2026 })).status,
    ).toBe(400)
  })
  it('returns six monthly trend buckets from actual records', async () => {
    const rows = (await get('/analytics?month=11&year=2026')).body.data
    expect(rows).toHaveLength(6)
    expect(rows[5]).toEqual({
      month: '2026-11',
      income: '1000.10',
      expenses: '0.30',
    })
    expect(rows[4].expenses).toBe('20.00')
  })
  it('updates only the current profile and persists preferences', async () => {
    const response = await put('/settings', {
      name: 'Alice Updated',
      email: alice.email,
      currency: 'EUR',
    })
    expect(response.status).toBe(200)
    expect(response.body.data.currency).toBe('EUR')
    expect(response.body.data.passwordHash).toBeUndefined()
    expect((await get('/auth/me', bob)).body.data.user.currency).toBe('USD')
    expect(
      (
        await put('/settings', {
          name: 'Changed',
          email: bob.email,
          currency: 'USD',
        })
      ).status,
    ).toBe(409)
  })
  it('revokes the JWT session on logout', async () => {
    const response = await post('/auth/logout', {})
    expect(response.status).toBe(204)
    expect((await get('/auth/me')).status).toBe(401)
    expect((await get('/auth/me', bob)).status).toBe(200)
  })
})

describe('session security controls', () => {
  it('marks production session cookies Secure and rejects database-expired sessions', async () => {
    const secureApp = createApp({
      db,
      auth: { jwtSecret: secret, secureCookies: true },
      frontendOrigins: [origin],
      checkDatabase: () => checkDatabase(db),
    })
    const response = await request(secureApp)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: bob.email, password })
    expect(response.status).toBe(200)
    expect(cookieHeader(response)).toContain('Secure')
    const cookie = sessionCookie(response)
    const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
    const payload = jwt.decode(token) as jwt.JwtPayload
    await db.session.update({
      where: { id: payload.jti },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(
      (await request(secureApp).get('/api/auth/me').set('Cookie', cookie))
        .status,
    ).toBe(401)
  })
  it('rate-limits authentication requests', async () => {
    const limited = createApp({
      db,
      auth: { jwtSecret: secret, secureCookies: false },
      frontendOrigins: [origin],
      checkDatabase: () => checkDatabase(db),
    })
    for (let i = 0; i < 30; i++)
      expect(
        (
          await request(limited)
            .post('/api/auth/login')
            .set('Origin', origin)
            .send({})
        ).status,
      ).toBe(400)
    const blocked = await request(limited)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({})
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS')
  })
})
