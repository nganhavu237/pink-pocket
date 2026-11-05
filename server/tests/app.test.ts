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
