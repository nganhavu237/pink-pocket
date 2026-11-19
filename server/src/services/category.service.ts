import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { HttpError } from '../middleware/error-handler.js'
import type { z } from 'zod'
import type { categoryInput } from '../validators/category.js'

const inUse = () =>
  new HttpError(
    409,
    'CATEGORY_IN_USE',
    'This category has transactions, monthly repeats or budgets. Rename it instead.',
  )
async function lockOwner(tx: Prisma.TransactionClient, userId: string) {
  // Serialize category name checks without modifying existing names or records.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`
}
async function uniqueName(
  tx: Prisma.TransactionClient,
  userId: string,
  name: string,
  type: 'INCOME' | 'EXPENSE',
  except?: string,
) {
  if (
    await tx.category.findFirst({
      where: {
        userId,
        type,
        name: { equals: name, mode: 'insensitive' },
        ...(except ? { id: { not: except } } : {}),
      },
    })
  )
    throw new HttpError(
      409,
      'CATEGORY_EXISTS',
      'A category with this name already exists for this type',
    )
}
async function editable(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  const category = await tx.category.findFirst({ where: { id, userId } })
  if (!category) throw new HttpError(404, 'NOT_FOUND', 'Category not found')
  if (category.isDefault || category.isArchived)
    throw new HttpError(
      403,
      'CATEGORY_READ_ONLY',
      'Default and legacy categories cannot be changed',
    )
  return category
}
export function createCategories(db: PrismaClient) {
  return {
    list: (userId: string) =>
      db.category.findMany({
        where: { userId },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
    create: (userId: string, input: z.infer<typeof categoryInput>) =>
      db.$transaction(async (tx) => {
        await lockOwner(tx, userId)
        await uniqueName(tx, userId, input.name, input.type)
        return tx.category.create({
          data: { ...input, userId, isDefault: false },
        })
      }),
    rename: (userId: string, id: string, name: string) =>
      db.$transaction(async (tx) => {
        await lockOwner(tx, userId)
        const category = await editable(tx, userId, id)
        await uniqueName(tx, userId, name, category.type, id)
        return tx.category.update({ where: { id, userId }, data: { name } })
      }),
    async remove(userId: string, id: string) {
      try {
        await db.$transaction(async (tx) => {
          await lockOwner(tx, userId)
          await editable(tx, userId, id)
          if (
            (await tx.transaction.count({
              where: { userId, categoryId: id },
            })) ||
            (await tx.recurringRule.count({
              where: { userId, categoryId: id },
            })) ||
            (await tx.categoryBudget.count({
              where: { userId, categoryId: id },
            }))
          )
            throw inUse()
          await tx.category.delete({ where: { id, userId } })
        })
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        )
          throw inUse()
        throw error
      }
    },
  }
}
