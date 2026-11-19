import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { parseEnv } from '../src/validators/env.js'

const origin = 'http://localhost:5173'
function setup(checkDatabase = vi.fn().mockResolvedValue(undefined)) {
  return createApp({ frontendOrigins: [origin], checkDatabase })
}

describe('Phase 1 API', () => {
  it('checks database connectivity before reporting health', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined)
    const res = await request(setup(checkDatabase)).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: { status: 'ok', database: 'connected' } })
    expect(checkDatabase).toHaveBeenCalledOnce()
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
  it('returns 503 without exposing connection details when the database fails', async () => {
    const res = await request(
      setup(
        vi.fn().mockRejectedValue(new Error('secret database credentials')),
      ),
    ).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is unavailable',
      },
    })
    expect(res.text).not.toContain('secret')
  })
  it('allows the configured frontend with credentials', async () => {
    const res = await request(setup()).get('/api/health').set('Origin', origin)
    expect(res.headers['access-control-allow-origin']).toBe(origin)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })
  it('handles a frontend preflight request', async () => {
    const res = await request(setup())
      .options('/api/health')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(origin)
  })
  it('rejects an unapproved browser origin', async () => {
    const res = await request(setup())
      .get('/api/health')
      .set('Origin', 'https://untrusted.example')
    expect(res.status).toBe(403)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED')
  })
  it('uses a JSON 404 for unknown endpoints', async () => {
    const res = await request(setup()).get('/api/missing')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
  it('handles malformed JSON', async () => {
    const res = await request(setup())
      .post('/api/missing')
      .set('Content-Type', 'application/json')
      .send('{')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_JSON')
  })
  it('limits request body size', async () => {
    const res = await request(setup())
      .post('/api/missing')
      .send({ value: 'a'.repeat(17000) })
    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })
})

describe('environment validation', () => {
  const valid = {
    JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
    DATABASE_URL: 'postgresql://example:example@localhost:5433/pink_pocket',
    FRONTEND_ORIGINS: origin,
  }
  it('parses defaults and multiple frontend origins', () => {
    const env = parseEnv({
      ...valid,
      FRONTEND_ORIGINS: `${origin}, http://localhost:5174`,
    })
    expect(env.PORT).toBe(3001)
    expect(env.FRONTEND_ORIGINS).toEqual([origin, 'http://localhost:5174'])
  })
  it.each([
    { DATABASE_URL: 'invalid-secret' },
    { DATABASE_URL: 'https://example.com' },
    { PORT: '0' },
    { PORT: '65536' },
    { FRONTEND_ORIGINS: '*' },
    { FRONTEND_ORIGINS: 'https://example.com/path' },
    { NODE_ENV: 'unknown' },
  ])('rejects invalid configuration: %j', (values) => {
    expect(() => parseEnv({ ...valid, ...values })).toThrow(
      'Invalid environment configuration',
    )
  })
  it('does not expose credentials in configuration errors', () => {
    try {
      parseEnv({ ...valid, DATABASE_URL: 'invalid-secret' })
    } catch (error) {
      expect(String(error)).not.toContain('invalid-secret')
      return
    }
    throw new Error('Expected invalid environment to fail')
  })
})

describe('deployment configuration', () => {
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://postgres.example:unused@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=verify-full',
    JWT_SECRET: 'deployment-test-secret-at-least-32-characters',
    FRONTEND_ORIGINS: 'https://toki-example.vercel.app',
    HOST: '0.0.0.0',
    TRUST_PROXY_HOPS: '1',
    DATABASE_POOL_MAX: '5',
  }
  it('accepts HTTPS, verified database TLS and Render proxy settings', () => {
    expect(parseEnv(production)).toMatchObject({
      HOST: '0.0.0.0',
      TRUST_PROXY_HOPS: 1,
      DATABASE_POOL_MAX: 5,
    })
  })
  it.each([
    { FRONTEND_ORIGINS: 'http://toki-example.vercel.app' },
    { DATABASE_URL: 'postgresql://postgres:unused@example.com:5432/postgres' },
    {
      DATABASE_URL:
        'postgresql://postgres:unused@example.com:5432/postgres?sslmode=no-verify',
    },
    { TRUST_PROXY_HOPS: 'true' },
    { TRUST_PROXY_HOPS: '-1' },
    { TRUST_PROXY_HOPS: '6' },
    { DATABASE_POOL_MAX: '0' },
    { DATABASE_POOL_MAX: '21' },
  ])('rejects unsafe production settings: %j', (values) => {
    expect(() => parseEnv({ ...production, ...values })).toThrow(
      'Invalid environment configuration',
    )
  })
  it('trusts only the configured proxy hop instead of arbitrary forwarded addresses', () => {
    const app = createApp({
      frontendOrigins: [production.FRONTEND_ORIGINS],
      checkDatabase: async () => {},
      trustProxyHops: 1,
    })
    const trust = app.get('trust proxy fn') as (
      address: string,
      index: number,
    ) => boolean
    expect(trust('127.0.0.1', 0)).toBe(true)
    expect(trust('203.0.113.1', 1)).toBe(false)
    expect(setup().get('trust proxy')).toBe(0)
  })
  it('keeps HTTPS frontend origins intact behind the reverse proxy', async () => {
    const app = createApp({
      frontendOrigins: [production.FRONTEND_ORIGINS],
      checkDatabase: async () => {},
      trustProxyHops: 1,
    })
    const response = await request(app)
      .get('/api/health')
      .set('Origin', production.FRONTEND_ORIGINS)
      .set('X-Forwarded-For', '203.0.113.1')
      .set('X-Forwarded-Proto', 'https')
    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe(
      production.FRONTEND_ORIGINS,
    )
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-frame-options']).toBe('DENY')
  })
})
