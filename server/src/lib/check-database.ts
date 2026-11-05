import { prisma } from './database.js'
import { checkDatabase } from '../services/health.service.js'

try {
  await checkDatabase(prisma)
  console.info('Database connection successful')
} catch {
  console.error(
    'Database connection failed. Check DATABASE_URL and whether PostgreSQL is running.',
  )
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
