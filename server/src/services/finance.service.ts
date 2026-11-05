import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { HttpError } from '../middleware/error-handler.js'
import { monthRange } from '../validators/finance.js'
import type { z } from 'zod'
import type { transactionInput, listQuery } from '../validators/finance.js'

Prisma.Decimal.set({ precision: 40 })

type DB = Prisma.TransactionClient
export const transactionInclude = {
  category: { select: { id: true, name: true, type: true } },
} as const
export function serializeTransaction(
  row: Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>,
) {
  return {
    ...row,
    amount: row.amount.toFixed(2),
    date: row.date.toISOString().slice(0, 10),
  }
}
const zero = () => new Prisma.Decimal(0)
async function totals(db: DB, userId: string, date?: { gte: Date; lt: Date }) {
  const rows = await db.transaction.groupBy({
    by: ['type'],
    where: { userId, ...(date ? { date } : {}) },
    _sum: { amount: true },
  })
  return {
    income: rows.find((row) => row.type === 'INCOME')?._sum.amount ?? zero(),
    expenses: rows.find((row) => row.type === 'EXPENSE')?._sum.amount ?? zero(),
  }
}
async function budgetStatus(
  db: DB,
  userId: string,
  month: number,
  year: number,
  spent?: Prisma.Decimal,
) {
  const budget = await db.budget.findUnique({
    where: { userId_year_month: { userId, month, year } },
  })
  const expenses =
    spent ?? (await totals(db, userId, monthRange(month, year))).expenses
  return {
    month,
    year,
    amount: budget?.amount.toFixed(2) ?? null,
    spent: expenses.toFixed(2),
    remaining: budget ? budget.amount.minus(expenses).toFixed(2) : null,
    percentage: budget
      ? expenses
          .dividedBy(budget.amount)
          .times(100)
          .toDecimalPlaces(2)
          .toNumber()
      : 0,
    exceeded: budget ? expenses.greaterThan(budget.amount) : false,
  }
}
export function createFinance(db: PrismaClient) {
  async function list(userId: string, query: z.infer<typeof listQuery>) {
    const { page, pageSize, month, year, type, categoryId, search } = query
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(month && year ? { date: monthRange(month, year) } : {}),
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? { description: { contains: search, mode: 'insensitive' } }
        : {}),
    }
    return db.$transaction(
      async (tx) => {
        const total = await tx.transaction.count({ where })
        const rows = await tx.transaction.findMany({
          where,
          include: transactionInclude,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
        return {
          items: rows.map(serializeTransaction),
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }
  async function save(
    userId: string,
    input: z.infer<typeof transactionInput>,
    id?: string,
  ) {
    return db.$transaction(async (tx) => {
      const existing = id
        ? await tx.transaction.findFirst({ where: { id, userId } })
        : null
      if (id && !existing)
        throw new HttpError(404, 'NOT_FOUND', 'Transaction not found')
      const category = await tx.category.findFirst({
        where: { id: input.categoryId, userId, type: input.type },
      })
      if (!category)
        throw new HttpError(
          400,
          'INVALID_CATEGORY',
          'Choose a category matching this transaction type',
        )
      const data = {
        amount: new Prisma.Decimal(input.amount),
        type: input.type,
        categoryId: input.categoryId,
        description: input.description || null,
        date: input.date
          ? new Date(`${input.date}T00:00:00Z`)
          : (existing?.date ??
            new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')),
      }
      const row = id
        ? await tx.transaction.update({
            where: { id, userId },
            data,
            include: transactionInclude,
          })
        : await tx.transaction.create({
            data: { ...data, userId },
            include: transactionInclude,
          })
      return serializeTransaction(row)
    })
  }
  async function remove(userId: string, id: string) {
    const result = await db.transaction.deleteMany({ where: { id, userId } })
    if (!result.count)
      throw new HttpError(404, 'NOT_FOUND', 'Transaction not found')
  }
  async function budget(userId: string, month: number, year: number) {
    return db.$transaction((tx) => budgetStatus(tx, userId, month, year), {
      isolationLevel: 'RepeatableRead',
    })
  }
  async function setBudget(
    userId: string,
    month: number,
    year: number,
    amount: string,
  ) {
    await db.budget.upsert({
      where: { userId_year_month: { userId, month, year } },
      create: { userId, month, year, amount },
      update: { amount },
    })
    return budget(userId, month, year)
  }
  async function summary(userId: string, month: number, year: number) {
    return db.$transaction(
      async (tx) => {
        const date = monthRange(month, year)
        const all = await totals(tx, userId)
        const monthly = await totals(tx, userId, date)
        const categories = await tx.category.findMany({ where: { userId } })
        const breakdown = await tx.transaction.groupBy({
          by: ['categoryId'],
          where: { userId, type: 'EXPENSE', date },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
        })
        const recent = await tx.transaction.findMany({
          where: { userId, date },
          include: transactionInclude,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          take: 5,
        })
        return {
          month,
          year,
          balance: all.income.minus(all.expenses).toFixed(2),
          income: monthly.income.toFixed(2),
          expenses: monthly.expenses.toFixed(2),
          budget: await budgetStatus(tx, userId, month, year, monthly.expenses),
          recent: recent.map(serializeTransaction),
          breakdown: breakdown.map((row) => ({
            categoryId: row.categoryId,
            name:
              categories.find((cat) => cat.id === row.categoryId)?.name ??
              'Other',
            amount: (row._sum.amount ?? zero()).toFixed(2),
          })),
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }
  async function trends(userId: string, month: number, year: number) {
    const end = monthRange(month, year).lt
    const start = new Date(monthRange(month, year).gte)
    start.setUTCMonth(start.getUTCMonth() - 5)
    const rows = await db.$queryRaw<
      { month: Date; type: string; amount: Prisma.Decimal }[]
    >`SELECT date_trunc('month', "date") AS month, "type", SUM("amount") AS amount FROM "Transaction" WHERE "userId" = ${userId}::uuid AND "date" >= ${start} AND "date" < ${end} GROUP BY 1,2 ORDER BY 1`
    return Array.from({ length: 6 }, (_, i) => {
      const date = new Date(start)
      date.setUTCMonth(date.getUTCMonth() + i)
      const key = date.toISOString().slice(0, 7)
      return {
        month: key,
        income: (
          rows.find(
            (row) =>
              row.month.toISOString().slice(0, 7) === key &&
              row.type === 'INCOME',
          )?.amount ?? zero()
        ).toFixed(2),
        expenses: (
          rows.find(
            (row) =>
              row.month.toISOString().slice(0, 7) === key &&
              row.type === 'EXPENSE',
          )?.amount ?? zero()
        ).toFixed(2),
      }
    })
  }
  return { list, save, remove, budget, setBudget, summary, trends }
}
