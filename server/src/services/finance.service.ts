import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { HttpError } from '../middleware/error-handler.js'
import {
  followingMonth,
  lockRule,
  monthStamp,
  nextOnOrAfter,
  processRecurring,
  utcToday,
} from './recurring.service.js'
import { monthRange } from '../validators/finance.js'
import type { z } from 'zod'
import type { transactionInput, listQuery } from '../validators/finance.js'

Prisma.Decimal.set({ precision: 40 })

type DB = Prisma.TransactionClient
export const transactionInclude = {
  recurring: { select: { id: true, active: true, day: true } },
  category: {
    select: {
      id: true,
      name: true,
      type: true,
      isDefault: true,
      isArchived: true,
    },
  },
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
    // Post already-due occurrences at their previous values before future edits.
    if (id) {
      const target = await db.transaction.findFirst({
        where: { id, userId },
        select: { recurringId: true },
      })
      if (target?.recurringId)
        await processRecurring(db, { userId, ruleId: target.recurringId })
    }
    return db.$transaction(async (tx) => {
      const existing = id
        ? await tx.transaction.findFirst({ where: { id, userId } })
        : null
      if (id && !existing)
        throw new HttpError(404, 'NOT_FOUND', 'Transaction not found')
      const category = await tx.category.findFirst({
        where: {
          id: input.categoryId,
          userId,
          type: input.type,
          ...(existing?.categoryId === input.categoryId
            ? {}
            : { isArchived: false }),
        },
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
      const wantsRepeat = input.recurring ?? Boolean(existing?.recurringId)
      let recurringId = existing?.recurringId ?? null
      let occurrenceMonth = existing?.occurrenceMonth ?? null
      if (recurringId) {
        const rule = await lockRule(tx, recurringId, userId)
        // Omitted flag preserves the rule's current state for existing API clients.
        const active = input.recurring ?? rule.active
        const day =
          data.date.getTime() === existing!.date.getTime()
            ? rule.day
            : data.date.getUTCDate()
        const minimum = rule.nextDate > utcToday() ? rule.nextDate : utcToday()
        const nextDate = nextOnOrAfter(minimum, day)
        await tx.recurringRule.update({
          where: { id: recurringId, userId },
          data: {
            amount: data.amount,
            type: data.type,
            categoryId: data.categoryId,
            description: data.description,
            day,
            active: active && Boolean(nextDate),
            ...(nextDate ? { nextDate } : {}),
          },
        })
      } else if (wantsRepeat) {
        const nextDate = followingMonth(data.date, data.date.getUTCDate())
        const rule = await tx.recurringRule.create({
          data: {
            userId,
            categoryId: data.categoryId,
            amount: data.amount,
            type: data.type,
            description: data.description,
            day: data.date.getUTCDate(),
            nextDate: nextDate ?? data.date,
            active: Boolean(nextDate),
          },
        })
        recurringId = rule.id
        occurrenceMonth = monthStamp(data.date)
        await tx.recurringOccurrence.create({
          data: { recurringId: rule.id, month: occurrenceMonth },
        })
      }
      const row = id
        ? await tx.transaction.update({
            where: { id, userId },
            data: { ...data, recurringId, occurrenceMonth },
            include: transactionInclude,
          })
        : await tx.transaction.create({
            data: { ...data, userId, recurringId, occurrenceMonth },
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
        const previousStart = new Date(date.gte)
        previousStart.setUTCMonth(previousStart.getUTCMonth() - 1)
        const previous = await totals(tx, userId, {
          gte: previousStart,
          lt: date.gte,
        })
        const expenseChangePercent = previous.expenses.isZero()
          ? null
          : monthly.expenses
              .minus(previous.expenses)
              .dividedBy(previous.expenses)
              .times(100)
              .toDecimalPlaces(2)
              .toNumber()
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { startingBalance: true },
        })
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
          balance: user.startingBalance
            .plus(all.income)
            .minus(all.expenses)
            .toFixed(2),
          previousExpenses: previous.expenses.toFixed(2),
          expenseChangePercent,
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
