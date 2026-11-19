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
const secret = 'planner-test-secret-with-at-least-32-characters',
  origin = 'http://localhost:5173'
const app = createApp({
  db,
  auth: { jwtSecret: secret, secureCookies: false },
  frontendOrigins: [origin],
  checkDatabase: async () => {
    await db.$queryRaw`SELECT 1`
  },
})
const users: string[] = []
async function account() {
  const user = await db.user.create({
    data: {
      name: 'Planner test',
      email: `${randomUUID()}@example.test`,
      passwordHash: 'unused-test-hash',
    },
  })
  users.push(user.id)
  const session = await db.session.create({
    data: {
      userId: user.id,
      csrfToken: 'planner-csrf',
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
  return {
    user,
    cookie,
    get: () => request(app).get('/api/tasks').set('Cookie', cookie),
    write: (
      method: 'post' | 'put' | 'delete',
      path: string,
      body: object = {},
    ) =>
      request(app)
        [method](`/api${path}`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'planner-csrf')
        .send(body),
  }
}
let alice: Awaited<ReturnType<typeof account>>,
  bob: Awaited<ReturnType<typeof account>>
beforeAll(async () => {
  alice = await account()
  bob = await account()
})
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.$disconnect()
})

describe('Planner API', () => {
  it('protects reads and writes with the existing authentication and CSRF checks', async () => {
    expect((await request(app).get('/api/tasks')).status).toBe(401)
    expect(
      (
        await request(app)
          .post('/api/tasks')
          .set('Origin', origin)
          .send({ name: 'Private' })
      ).status,
    ).toBe(401)
    expect(
      (
        await request(app)
          .post('/api/tasks')
          .set('Origin', origin)
          .set('Cookie', alice.cookie)
          .send({ name: 'Private' })
      ).status,
    ).toBe(403)
  })
  it('returns an empty checklist for a new account', async () => {
    expect((await bob.get()).body.data).toEqual([])
  })
  it('creates minimal tasks and persists their normalized values', async () => {
    const response = await alice.write('post', '/tasks', {
      name: '  Pay rent  ',
    })
    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({
      name: 'Pay rent',
      userId: alice.user.id,
      dueDate: null,
      dueTime: null,
      completed: false,
    })
    const stored = await db.task.findUniqueOrThrow({
      where: { id: response.body.data.id },
    })
    expect(stored.name).toBe('Pay rent')
    expect(
      (await alice.get()).body.data.some(
        (task: { id: string }) => task.id === stored.id,
      ),
    ).toBe(true)
  })
  it.each([
    { dueDate: '2052-02-29' },
    { dueTime: '00:00' },
    { dueDate: '2050-12-31', dueTime: '23:59' },
  ])('round-trips optional calendar date/time: %j', async (values) => {
    const response = await alice.write('post', '/tasks', {
      name: 'Schedule',
      ...values,
    })
    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({ ...values })
  })
  it.each([
    { name: '' },
    { name: '   ' },
    { name: 'x'.repeat(201) },
    { dueDate: '2050-02-30' },
    { dueDate: '0000-01-01' },
    { dueTime: '24:00' },
    { dueTime: '12:60' },
    { dueTime: '8:30' },
    { dueTime: '08:30:01' },
    { completed: 'true' },
    { userId: randomUUID() },
  ])('rejects invalid or unexpected fields: %j', async (values) => {
    expect(
      (await alice.write('post', '/tasks', { name: 'Task', ...values })).status,
    ).toBe(400)
  })
  it('supports partial completion updates and reopening without losing task details', async () => {
    const task = (
      await alice.write('post', '/tasks', {
        name: 'Review budget',
        dueDate: '2050-01-31',
        dueTime: '09:15',
      })
    ).body.data
    const completed = await alice.write('put', `/tasks/${task.id}`, {
      completed: true,
    })
    expect(completed.status).toBe(200)
    expect(completed.body.data).toMatchObject({
      name: 'Review budget',
      dueDate: '2050-01-31',
      dueTime: '09:15',
      completed: true,
    })
    expect(
      (
        await alice.write('put', `/tasks/${task.id}`, {
          name: 'Review finances',
        })
      ).body.data.completed,
    ).toBe(true)
    expect(
      (await alice.write('put', `/tasks/${task.id}`, { completed: false })).body
        .data.completed,
    ).toBe(false)
  })
  it('edits names and clears optional dates/times explicitly', async () => {
    const task = (
      await alice.write('post', '/tasks', {
        name: 'Original',
        dueDate: '2050-01-31',
        dueTime: '10:00',
      })
    ).body.data
    const changed = await alice.write('put', `/tasks/${task.id}`, {
      name: 'Edited',
      dueDate: null,
      dueTime: null,
    })
    expect(changed.body.data).toMatchObject({
      name: 'Edited',
      dueDate: null,
      dueTime: null,
    })
    expect((await alice.write('put', `/tasks/${task.id}`, {})).status).toBe(400)
  })
  it('sorts incomplete tasks before completed tasks', async () => {
    await alice.write('post', '/tasks', {
      name: 'Already done',
      completed: true,
      dueDate: '2000-01-01',
    })
    const rows = (await alice.get()).body.data as { completed: boolean }[]
    expect(rows.map((row) => row.completed)).toEqual(
      [...rows.map((row) => row.completed)].sort(),
    )
    expect(rows.some((row) => row.completed)).toBe(true)
  })
  it('isolates task reads, updates and deletes by owner', async () => {
    const task = (
      await bob.write('post', '/tasks', { name: 'Bob private task' })
    ).body.data
    expect(
      (await alice.get()).body.data.some(
        (row: { id: string }) => row.id === task.id,
      ),
    ).toBe(false)
    expect(
      (await alice.write('put', `/tasks/${task.id}`, { name: 'Stolen' }))
        .status,
    ).toBe(404)
    expect(
      (await alice.write('put', `/tasks/${task.id}`, { completed: true }))
        .status,
    ).toBe(404)
    expect((await alice.write('delete', `/tasks/${task.id}`)).status).toBe(404)
    expect(
      (await bob.get()).body.data.find(
        (row: { id: string }) => row.id === task.id,
      ).name,
    ).toBe('Bob private task')
  })
  it('deletes only the requested owned task and returns clear missing/invalid ID errors', async () => {
    const task = (await alice.write('post', '/tasks', { name: 'Temporary' }))
      .body.data
    expect((await alice.write('delete', `/tasks/${task.id}`)).status).toBe(204)
    expect(await db.task.findUnique({ where: { id: task.id } })).toBeNull()
    expect((await alice.write('delete', `/tasks/${task.id}`)).status).toBe(404)
    expect(
      (await alice.write('put', '/tasks/not-a-uuid', { completed: true }))
        .status,
    ).toBe(400)
  })
  it('enforces nonempty names and valid times in the database', async () => {
    await expect(
      db.task.create({ data: { userId: alice.user.id, name: '   ' } }),
    ).rejects.toThrow()
    await expect(
      db.task.create({
        data: { userId: alice.user.id, name: 'Invalid time', dueTime: '25:00' },
      }),
    ).rejects.toThrow()
  })
})
