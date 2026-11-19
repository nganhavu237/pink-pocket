import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { createApp } from '../src/app.js'
import { createAuth } from '../src/services/auth.service.js'

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
const secret = 'category-tests-only-secret-at-least-32-characters',
  origin = 'http://localhost:5173',
  ids: string[] = []
const config = { jwtSecret: secret, secureCookies: false }
const app = createApp({
  db,
  auth: config,
  frontendOrigins: [origin],
  checkDatabase: async () => {
    await db.$queryRaw`SELECT 1`
  },
})
async function account() {
  const user = await createAuth(db, config).register({
    name: 'Categories test',
    email: `${randomUUID()}@example.test`,
    password: 'Unused-password-123',
  })
  ids.push(user.id)
  const session = await db.session.create({
    data: {
      userId: user.id,
      csrfToken: 'category-csrf',
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
      request(app).get(`/api${path}`).set('Cookie', cookie),
    write: (
      method: 'post' | 'put' | 'delete',
      path: string,
      body: object = {},
    ) =>
      request(app)
        [method](`/api${path}`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'category-csrf')
        .send(body),
  }
}
let alice: Awaited<ReturnType<typeof account>>,
  bob: Awaited<ReturnType<typeof account>>
beforeAll(async () => {
  alice = await account()
  bob = await account()
}, 15000)
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
})

describe('custom categories', () => {
  it('retains default expenses and Salary but does not create Other Income', async () => {
    const rows = (await alice.get('/categories')).body.data as {
      name: string
      type: string
      isDefault: boolean
    }[]
    expect(rows).toHaveLength(8)
    expect(rows.every((row) => row.isDefault)).toBe(true)
    expect(
      rows.filter((row) => row.type === 'INCOME').map((row) => row.name),
    ).toEqual(['Salary'])
  })
  it('creates and persists trimmed custom categories for each type', async () => {
    for (const type of ['INCOME', 'EXPENSE']) {
      const response = await alice.write('post', '/categories', {
        name: '  Freelance  ',
        type,
      })
      expect(response.status).toBe(201)
      expect(response.body.data).toMatchObject({
        name: 'Freelance',
        type,
        userId: alice.user.id,
        isDefault: false,
        isArchived: false,
      })
      expect(
        (await alice.get('/categories')).body.data.some(
          (row: { id: string }) => row.id === response.body.data.id,
        ),
      ).toBe(true)
    }
  })
  it('rejects case-insensitive duplicates, including concurrent requests and default names', async () => {
    expect(
      (
        await alice.write('post', '/categories', {
          name: 'food',
          type: 'EXPENSE',
        })
      ).status,
    ).toBe(409)
    const results = await Promise.all([
      alice.write('post', '/categories', {
        name: 'Concurrent',
        type: 'EXPENSE',
      }),
      alice.write('post', '/categories', {
        name: 'concurrent',
        type: 'EXPENSE',
      }),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([201, 409])
  })
  it.each([
    { name: '', type: 'EXPENSE' },
    { name: '  ', type: 'EXPENSE' },
    { name: 'x'.repeat(101), type: 'EXPENSE' },
    { name: 'Task', type: 'OTHER' },
    { name: 'Mine', type: 'EXPENSE', userId: randomUUID() },
    { name: 'Mine', type: 'EXPENSE', isDefault: true },
  ])('rejects invalid creation fields %j', async (body) => {
    expect((await alice.write('post', '/categories', body)).status).toBe(400)
  })
  it('renames custom categories while preserving their IDs and type', async () => {
    const category = (
      await alice.write('post', '/categories', {
        name: 'Old name',
        type: 'EXPENSE',
      })
    ).body.data
    const result = await alice.write('put', `/categories/${category.id}`, {
      name: 'New name',
    })
    expect(result.status).toBe(200)
    expect(result.body.data).toMatchObject({
      id: category.id,
      name: 'New name',
      type: 'EXPENSE',
    })
    expect(
      (await alice.write('put', `/categories/${category.id}`, { name: 'Food' }))
        .status,
    ).toBe(409)
    expect(
      (
        await alice.write('put', `/categories/${category.id}`, {
          name: 'X',
          type: 'INCOME',
        })
      ).status,
    ).toBe(400)
  })
  it('protects defaults from rename or deletion', async () => {
    const salary = (await alice.get('/categories')).body.data.find(
      (row: { name: string }) => row.name === 'Salary',
    )
    expect(
      (await alice.write('put', `/categories/${salary.id}`, { name: 'Wages' }))
        .status,
    ).toBe(403)
    expect(
      (await alice.write('delete', `/categories/${salary.id}`)).status,
    ).toBe(403)
  })
  it('enforces ownership for list, rename, and delete and requires CSRF', async () => {
    const category = (
      await alice.write('post', '/categories', {
        name: 'Private',
        type: 'EXPENSE',
      })
    ).body.data
    expect(
      (await bob.get('/categories')).body.data.some(
        (row: { id: string }) => row.id === category.id,
      ),
    ).toBe(false)
    expect(
      (await bob.write('put', `/categories/${category.id}`, { name: 'Stolen' }))
        .status,
    ).toBe(404)
    expect(
      (await bob.write('delete', `/categories/${category.id}`)).status,
    ).toBe(404)
    expect(
      (
        await request(app)
          .post('/api/categories')
          .set('Origin', origin)
          .set('Cookie', alice.cookie)
          .send({ name: 'Blocked', type: 'EXPENSE' })
      ).status,
    ).toBe(403)
  })
  it('deletes unused custom categories without affecting defaults', async () => {
    const category = (
      await alice.write('post', '/categories', {
        name: 'Temporary',
        type: 'EXPENSE',
      })
    ).body.data
    expect(
      (await alice.write('delete', `/categories/${category.id}`)).status,
    ).toBe(204)
    expect(
      await db.category.findUnique({ where: { id: category.id } }),
    ).toBeNull()
    expect(
      (await alice.write('delete', `/categories/${category.id}`)).status,
    ).toBe(404)
  })
  it('blocks deletion of used categories and allows safe renaming', async () => {
    const category = (
      await alice.write('post', '/categories', {
        name: 'Subscriptions',
        type: 'EXPENSE',
      })
    ).body.data
    const transaction = (
      await alice.write('post', '/transactions', {
        amount: '10.25',
        type: 'EXPENSE',
        categoryId: category.id,
        description: 'Keep this',
        date: '2050-01-01',
      })
    ).body.data
    const response = await alice.write('delete', `/categories/${category.id}`)
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('CATEGORY_IN_USE')
    expect(
      (
        await alice.write('put', `/categories/${category.id}`, {
          name: 'Memberships',
        })
      ).status,
    ).toBe(200)
    const entries = (await alice.get(`/transactions?categoryId=${category.id}`))
      .body.data.items
    expect(
      entries.find((row: { id: string }) => row.id === transaction.id),
    ).toMatchObject({ amount: '10.25', category: { name: 'Memberships' } })
  })
  it('protects categories used by monthly repeats, even after their transaction is deleted', async () => {
    const category = (
      await alice.write('post', '/categories', {
        name: 'Repeating',
        type: 'EXPENSE',
      })
    ).body.data
    const entry = (
      await alice.write('post', '/transactions', {
        amount: '20.00',
        type: 'EXPENSE',
        categoryId: category.id,
        date: '2050-01-01',
        recurring: true,
      })
    ).body.data
    await alice.write('delete', `/transactions/${entry.id}`)
    expect(
      (await alice.write('delete', `/categories/${category.id}`)).status,
    ).toBe(409)
  })
  it('preserves legacy Other Income history and edits but prevents new assignments', async () => {
    const legacy = await db.category.create({
      data: {
        userId: alice.user.id,
        name: 'Other Income',
        type: 'INCOME',
        isArchived: true,
      },
    })
    const old = await db.transaction.create({
      data: {
        userId: alice.user.id,
        categoryId: legacy.id,
        amount: '45.50',
        type: 'INCOME',
        date: new Date('2050-01-01'),
      },
    })
    const input = {
      amount: '45.50',
      type: 'INCOME',
      categoryId: legacy.id,
      date: '2050-01-01',
    }
    expect((await alice.write('post', '/transactions', input)).status).toBe(400)
    expect(
      (
        await alice.write('put', `/transactions/${old.id}`, {
          ...input,
          description: 'Preserved',
        })
      ).status,
    ).toBe(200)
    expect(
      (await alice.get(`/transactions?categoryId=${legacy.id}`)).body.data
        .items,
    ).toHaveLength(1)
    expect(
      (await alice.write('delete', `/categories/${legacy.id}`)).status,
    ).toBe(403)
  })
})

describe('display currency', () => {
  it.each(['VND', 'JPY', 'CHF', 'krw'])(
    'saves valid codes and reloads %s through the account API',
    async (code) => {
      const result = await alice.write('put', '/settings', {
        name: alice.user.name,
        email: alice.user.email,
        currency: code,
      })
      expect(result.status).toBe(200)
      expect(result.body.data.currency).toBe(code.toUpperCase())
      expect((await alice.get('/auth/me')).body.data.user.currency).toBe(
        code.toUpperCase(),
      )
    },
  )
  it.each(['ZZZ', 'BTC', 'US', 'USD1', '123', ''])(
    'rejects invalid codes %s',
    async (currency) => {
      expect(
        (
          await alice.write('put', '/settings', {
            name: alice.user.name,
            email: alice.user.email,
            currency,
          })
        ).status,
      ).toBe(400)
    },
  )
  it('does not convert amounts or change another account', async () => {
    const before = await db.transaction.findMany({
      where: { userId: alice.user.id },
      select: { id: true, amount: true },
      orderBy: { id: 'asc' },
    })
    await alice.write('put', '/settings', {
      name: alice.user.name,
      email: alice.user.email,
      currency: 'VND',
    })
    const after = await db.transaction.findMany({
      where: { userId: alice.user.id },
      select: { id: true, amount: true },
      orderBy: { id: 'asc' },
    })
    expect(after.map((row) => [row.id, row.amount.toFixed(2)])).toEqual(
      before.map((row) => [row.id, row.amount.toFixed(2)]),
    )
    expect((await bob.get('/auth/me')).body.data.user.currency).toBe('USD')
  })
})
