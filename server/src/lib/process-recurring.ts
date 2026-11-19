import { prisma } from './database.js'
import { processRecurring } from '../services/recurring.service.js'
try {
  console.info(`Created ${await processRecurring(prisma)} monthly transactions`)
} catch {
  console.error('Monthly repeat processing failed')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
