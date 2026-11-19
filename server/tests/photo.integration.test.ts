import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { createApp } from '../src/app.js'
import { MAX_PHOTO_BYTES } from '../src/services/photo.service.js'

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
  secret = 'photo-test-only-secret-at-least-32-characters'
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
      name: 'Photo test',
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
    info: () => request(app).get('/api/my-space').set('Cookie', cookie),
    get: (query = '') =>
      request(app)
        .get('/api/my-space/photo' + query)
        .set('Cookie', cookie),
    upload: (body: Buffer, type = 'image/png') =>
      request(app)
        .put('/api/my-space/photo')
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'photo-csrf')
        .set('Content-Type', type)
        .send(body),
    remove: () =>
      request(app)
        .delete('/api/my-space/photo')
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'photo-csrf'),
  }
}
let alice: Awaited<ReturnType<typeof account>>,
  bob: Awaited<ReturnType<typeof account>>,
  png: Buffer
beforeAll(async () => {
  alice = await account()
  bob = await account()
  png = await sharp({
    create: { width: 32, height: 24, channels: 3, background: '#F4A7B9' },
  })
    .png()
    .toBuffer()
})
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
})

describe('private My Space photo', () => {
  it('requires authentication for metadata, images, upload and removal', async () => {
    expect((await request(app).get('/api/my-space')).status).toBe(401)
    expect((await request(app).get('/api/my-space/photo')).status).toBe(401)
    expect(
      (
        await request(app)
          .put('/api/my-space/photo')
          .set('Origin', origin)
          .set('Content-Type', 'image/png')
          .send(png)
      ).status,
    ).toBe(401)
    expect(
      (await request(app).delete('/api/my-space/photo').set('Origin', origin))
        .status,
    ).toBe(401)
  })
  it('returns a minimal empty state before uploading', async () => {
    expect((await alice.info()).body).toEqual({ data: null })
    expect((await alice.get()).status).toBe(404)
  })
  it('requires approved origins and CSRF tokens for writes', async () => {
    expect(
      (
        await request(app)
          .put('/api/my-space/photo')
          .set('Cookie', alice.cookie)
          .set('Origin', origin)
          .set('Content-Type', 'image/png')
          .send(png)
      ).status,
    ).toBe(403)
    expect(
      (
        await request(app)
          .put('/api/my-space/photo')
          .set('Cookie', alice.cookie)
          .set('X-CSRF-Token', 'photo-csrf')
          .set('Origin', 'https://untrusted.example')
          .set('Content-Type', 'image/png')
          .send(png)
      ).status,
    ).toBe(403)
  })
  it.each(['jpeg', 'png', 'webp'] as const)(
    'validates, persists and serves %s as WebP',
    async (format) => {
      const input = await sharp(png).toFormat(format).toBuffer()
      const response = await alice.upload(input, `image/${format}`)
      expect(response.status).toBe(200)
      expect(response.body.data).toMatchObject({ width: 32, height: 24 })
      expect(Object.keys(response.body.data).sort()).toEqual([
        'height',
        'version',
        'width',
      ])
      const image = await alice.get()
      expect(image.status).toBe(200)
      expect(image.headers['content-type']).toBe('image/webp')
      expect(image.headers['cache-control']).toContain('no-store')
      expect(image.headers['cache-control']).toContain('private')
      expect(image.headers['vary']).toContain('Cookie')
      expect(image.headers['x-content-type-options']).toBe('nosniff')
      expect(image.headers['cross-origin-resource-policy']).toBe('same-origin')
      expect((await sharp(image.body).metadata()).format).toBe('webp')
      expect((await alice.info()).body.data.version).toBe(
        response.body.data.version,
      )
    },
  )
  it('atomically replaces the existing photo and changes its version', async () => {
    const before = (await alice.info()).body.data
    const next = await sharp({
      create: { width: 48, height: 20, channels: 3, background: '#DCEBDD' },
    })
      .png()
      .toBuffer()
    const saved = await alice.upload(next)
    expect(saved.status).toBe(200)
    expect(saved.body.data.version).not.toBe(before.version)
    expect(
      await db.mySpacePhoto.count({ where: { userId: alice.user.id } }),
    ).toBe(1)
    expect((await alice.info()).body.data).toMatchObject({
      width: 48,
      height: 20,
    })
  })
  it('keeps photos private to the session owner, ignoring supplied user IDs', async () => {
    const own = await alice.get()
    expect((await bob.info()).body.data).toBeNull()
    expect((await bob.get(`?userId=${alice.user.id}`)).status).toBe(404)
    expect((await bob.remove()).status).toBe(204)
    expect((await alice.get()).body).toEqual(own.body)
    const other = await sharp({
      create: { width: 12, height: 12, channels: 3, background: '#333333' },
    })
      .png()
      .toBuffer()
    expect((await bob.upload(other)).status).toBe(200)
    expect((await alice.get(`?userId=${bob.user.id}`)).body).toEqual(own.body)
  })
  it('rejects unsupported file types and spoofed or corrupted images', async () => {
    expect(
      (await alice.upload(Buffer.from('<svg/>'), 'image/svg+xml')).status,
    ).toBe(415)
    expect((await alice.upload(png, 'image/jpeg')).status).toBe(400)
    expect((await alice.upload(Buffer.from('not an image'))).status).toBe(400)
    expect((await alice.upload(png.subarray(0, 24))).status).toBe(400)
    expect((await alice.upload(Buffer.alloc(0))).status).toBe(400)
  })
  it('rejects files over 5 MB before processing and retains the old photo', async () => {
    const before = (await alice.info()).body.data.version
    const response = await alice.upload(Buffer.alloc(MAX_PHOTO_BYTES + 1))
    expect(response.status).toBe(413)
    expect(response.body.error.code).toBe('PHOTO_TOO_LARGE')
    expect((await alice.info()).body.data.version).toBe(before)
  })
  it('bounds input pixels and resizes large valid photos', async () => {
    const tooLarge = await sharp({
      create: { width: 5000, height: 5000, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    expect((await alice.upload(tooLarge)).status).toBe(400)
    const large = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#eeeeee' },
    })
      .png()
      .toBuffer()
    const response = await alice.upload(large)
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ width: 1600, height: 800 })
  })
  it('applies orientation and removes embedded metadata', async () => {
    const original = await sharp(png)
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { ImageDescription: 'Private metadata' } },
      })
      .jpeg()
      .toBuffer()
    expect((await sharp(original).metadata()).exif).toBeDefined()
    expect((await alice.upload(original, 'image/jpeg')).status).toBe(200)
    const output = await sharp((await alice.get()).body).metadata()
    expect(output.exif).toBeUndefined()
    expect(output.orientation).toBeUndefined()
    expect(output).toMatchObject({ width: 24, height: 32 })
  })
  it('removes the owned image without affecting another account', async () => {
    expect((await alice.remove()).status).toBe(204)
    expect((await alice.info()).body.data).toBeNull()
    expect((await alice.get()).status).toBe(404)
    expect((await bob.get()).status).toBe(200)
    expect((await alice.remove()).status).toBe(204)
  })
})
