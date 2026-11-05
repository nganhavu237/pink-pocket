import { createApp } from './app.js'
import { prisma } from './lib/database.js'
import { env } from './lib/env.js'
import { checkDatabase } from './services/health.service.js'

const app = createApp({
  db: prisma,
  auth: {
    jwtSecret: env.JWT_SECRET,
    secureCookies: env.NODE_ENV === 'production',
  },
  frontendOrigins: env.FRONTEND_ORIGINS,
  checkDatabase: () => checkDatabase(prisma),
})

async function start() {
  await checkDatabase(prisma)
  const server = app.listen(env.PORT, env.HOST, () => {
    console.info(`Pink Pocket API listening on http://${env.HOST}:${env.PORT}`)
  })
  server.on('error', () => {
    console.error('Unable to start HTTP server. Check HOST and PORT.')
    void prisma.$disconnect().finally(() => process.exit(1))
  })

  let stopping = false
  function shutdown() {
    if (stopping) return
    stopping = true
    const timeout = setTimeout(() => process.exit(1), 10000)
    timeout.unref()
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0))
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

start().catch(async () => {
  console.error(
    'Database connection failed. Check DATABASE_URL and start PostgreSQL before starting the API.',
  )
  await prisma.$disconnect()
  process.exitCode = 1
})
