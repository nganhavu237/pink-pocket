import type { PrismaClient } from '../generated/prisma/client.js'

export async function checkDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
}
