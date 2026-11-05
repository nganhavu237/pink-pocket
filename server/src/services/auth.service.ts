import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { CookieOptions, RequestHandler, Response } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { HttpError } from '../middleware/error-handler.js'

export type AuthConfig = { jwtSecret: string; secureCookies: boolean }
export const userSelect = {
  id: true,
  name: true,
  email: true,
  currency: true,
  createdAt: true,
} as const
const days = 7 * 24 * 60 * 60
const cookieName = 'pink_pocket_session'
const defaults = [
  ['Food', 'EXPENSE'],
  ['Shopping', 'EXPENSE'],
  ['Transportation', 'EXPENSE'],
  ['Bills', 'EXPENSE'],
  ['Entertainment', 'EXPENSE'],
  ['Health', 'EXPENSE'],
  ['Other', 'EXPENSE'],
  ['Salary', 'INCOME'],
  ['Other Income', 'INCOME'],
] as const
export function cookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/api',
  }
}
export function createAuth(db: PrismaClient, config: AuthConfig) {
  const dummyHash = bcrypt.hash('unused-authentication-timing-value', 12)
  const requireAuth: RequestHandler = async (req, res, next) => {
    let sessionId: string
    let userId: string
    try {
      const token = req.cookies?.[cookieName]
      if (typeof token !== 'string') throw new Error()
      const payload = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'pink-pocket',
        audience: 'pink-pocket-web',
      })
      if (
        typeof payload === 'string' ||
        typeof payload.jti !== 'string' ||
        typeof payload.sub !== 'string'
      )
        throw new Error()
      sessionId = payload.jti
      userId = payload.sub
    } catch {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in')
    }
    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: userSelect } },
    })
    if (
      !session ||
      session.userId !== userId ||
      session.expiresAt <= new Date()
    )
      throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const token = req.get('X-CSRF-Token') || ''
      if (
        Buffer.byteLength(token) !== Buffer.byteLength(session.csrfToken) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken))
      )
        throw new HttpError(
          403,
          'CSRF_INVALID',
          'Session check failed. Refresh and try again.',
        )
    }
    res.locals.session = session
    next()
  }
  async function issueSession(userId: string, res: Response) {
    const session = await db.session.create({
      data: {
        userId,
        csrfToken: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + days * 1000),
      },
    })
    const token = jwt.sign({}, config.jwtSecret, {
      algorithm: 'HS256',
      subject: userId,
      jwtid: session.id,
      issuer: 'pink-pocket',
      audience: 'pink-pocket-web',
      expiresIn: days,
    })
    res.cookie(cookieName, token, {
      ...cookieOptions(config),
      maxAge: days * 1000,
    })
    return session.csrfToken
  }
  async function register(input: {
    name: string
    email: string
    password: string
  }) {
    const passwordHash = await bcrypt.hash(input.password, 12)
    return db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        categories: {
          create: defaults.map(([name, type]) => ({ name, type })),
        },
      },
      select: userSelect,
    })
  }
  async function login(email: string, password: string) {
    const user = await db.user.findUnique({ where: { email } })
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash ?? (await dummyHash),
    )
    if (!user || !valid)
      throw new HttpError(
        401,
        'INVALID_CREDENTIALS',
        'Email or password is incorrect',
      )
    return db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: userSelect,
    })
  }
  async function logout(sessionId: string, res: Response) {
    await db.session.deleteMany({ where: { id: sessionId } })
    res.clearCookie(cookieName, cookieOptions(config))
  }
  return { requireAuth, issueSession, register, login, logout }
}
