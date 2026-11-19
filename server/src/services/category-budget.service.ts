import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { HttpError } from '../middleware/error-handler.js'
import { monthRange } from '../validators/finance.js'

Prisma.Decimal.set({ precision: 40 })

export function createCategoryBudgets(db: PrismaClient) {
  async function list(userId: string, month: number, year: number) {
    return db.$transaction(
      async (tx) => {
        const budgets = await tx.categoryBudget.findMany({
          where: { userId, month, year },
          include: { category: { select: { id: true, name: true } } },
          orderBy: { category: { name: 'asc' } },
        })
        const spending = await tx.transaction.groupBy({
          by: ['categoryId'],
          where: { userId, type: 'EXPENSE', date: monthRange(month, year) },
          _sum: { amount: true },
        })
        const totals = new Map(
          spending.map((row) => [row.categoryId, row._sum.amount]),
        )
        return budgets.map((budget) => {
          const spent = totals.get(budget.categoryId) ?? new Prisma.Decimal(0)
          return {
            id: budget.id,
            categoryId: budget.categoryId,
            category: budget.category,
            month,
            year,
            amount: budget.amount.toFixed(2),
            spent: spent.toFixed(2),
            remaining: budget.amount.minus(spent).toFixed(2),
            percentage: spent
              .dividedBy(budget.amount)
              .times(100)
              .toDecimalPlaces(2)
              .toNumber(),
            exceeded: spent.greaterThan(budget.amount),
          }
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }
  async function set(
    userId: string,
    input: { categoryId: string; month: number; year: number; amount: string },
  ) {
    return db.$transaction(async (tx) => {
      // Shares the category mutation lock so deletion cannot race budget creation.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`
      const category = await tx.category.findFirst({
        where: {
          id: input.categoryId,
          userId,
          type: 'EXPENSE',
          isArchived: false,
        },
      })
      if (!category)
        throw new HttpError(
          400,
          'INVALID_CATEGORY',
          'Choose an expense category',
        )
      return tx.categoryBudget.upsert({
        where: {
          userId_year_month_categoryId: {
            userId,
            year: input.year,
            month: input.month,
            categoryId: input.categoryId,
          },
        },
        create: { userId, ...input },
        update: { amount: input.amount },
      })
    })
  }
  async function remove(userId: string, id: string) {
    const result = await db.categoryBudget.deleteMany({
      where: { userId, id },
    })
    if (!result.count)
      throw new HttpError(404, 'NOT_FOUND', 'Category budget not found')
  }
  return { list, set, remove }
}
