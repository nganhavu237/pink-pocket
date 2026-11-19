import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { HttpError } from '../middleware/error-handler.js'

export function utcToday(now = new Date()) {
  return new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z')
}
export function monthStamp(date: Date) {
  const result = new Date(date)
  result.setUTCDate(1)
  return result
}
export function scheduledDate(month: Date, day: number) {
  const first = monthStamp(month)
  const end = new Date(first)
  end.setUTCMonth(end.getUTCMonth() + 1)
  end.setUTCDate(0)
  first.setUTCDate(Math.min(day, end.getUTCDate()))
  return first
}
export function followingMonth(date: Date, day: number): Date | null {
  const next = monthStamp(date)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return next.getUTCFullYear() > 9999 ? null : scheduledDate(next, day)
}
export function nextOnOrAfter(min: Date, day: number) {
  const candidate = scheduledDate(min, day)
  return candidate >= min ? candidate : followingMonth(min, day)
}
export async function lockRule(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "RecurringRule" WHERE "id"=${id}::uuid AND "userId"=${userId}::uuid FOR UPDATE`
  if (!rows.length)
    throw new HttpError(404, 'NOT_FOUND', 'Monthly repeat not found')
  return tx.recurringRule.findUniqueOrThrow({ where: { id, userId } })
}
export function serializeRule(
  rule: Prisma.RecurringRuleGetPayload<{ include: { category: true } }>,
) {
  return {
    ...rule,
    amount: rule.amount.toFixed(2),
    nextDate: rule.nextDate.toISOString().slice(0, 10),
  }
}

// Durable nextDate is advanced in the same transaction as inserts. Row locks
// serialize workers/edits; a unique rule+month constraint is the second safeguard.
export async function processRecurring(
  db: PrismaClient,
  options: { now?: Date; userId?: string; ruleId?: string } = {},
) {
  const through = utcToday(options.now)
  const due = await db.recurringRule.findMany({
    where: {
      active: true,
      nextDate: { lte: through },
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.ruleId ? { id: options.ruleId } : {}),
    },
    select: { id: true },
    orderBy: { nextDate: 'asc' },
    take: 50,
  })
  let created = 0
  for (const { id } of due) {
    created += await db.$transaction(
      async (tx) => {
        // Financial reads wait for an in-flight worker so their response includes
        // the newly committed occurrence. Background workers can skip busy rules.
        const locked = options.userId
          ? await tx.$queryRaw<
              { id: string }[]
            >`SELECT "id" FROM "RecurringRule" WHERE "id"=${id}::uuid FOR UPDATE`
          : await tx.$queryRaw<
              { id: string }[]
            >`SELECT "id" FROM "RecurringRule" WHERE "id"=${id}::uuid FOR UPDATE SKIP LOCKED`
        if (!locked.length) return 0
        const rule = await tx.recurringRule.findUnique({ where: { id } })
        if (!rule?.active || rule.nextDate > through) return 0
        let date = rule.nextDate
        let active = true
        let count = 0
        // Bound each batch; very old schedules continue catching up next tick.
        for (let i = 0; i < 120 && date <= through; i++) {
          const claim = await tx.recurringOccurrence.createMany({
            data: [{ recurringId: rule.id, month: monthStamp(date) }],
            skipDuplicates: true,
          })
          const result = claim.count
            ? await tx.transaction.createMany({
                data: [
                  {
                    userId: rule.userId,
                    categoryId: rule.categoryId,
                    type: rule.type,
                    amount: rule.amount,
                    description: rule.description,
                    date,
                    recurringId: rule.id,
                    occurrenceMonth: monthStamp(date),
                  },
                ],
                skipDuplicates: true,
              })
            : { count: 0 }
          count += result.count
          const next = followingMonth(date, rule.day)
          if (!next) {
            active = false
            break
          }
          date = next
        }
        await tx.recurringRule.update({
          where: { id },
          data: { nextDate: date, active },
        })
        return count
      },
      { timeout: 20000 },
    )
  }
  return created
}

export function startRecurringWorker(db: PrismaClient) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<void> = Promise.resolve()
  function tick() {
    if (stopped) return
    pending = processRecurring(db)
      .then(() => {})
      .catch(() => {
        console.error(
          'Monthly repeat processing failed; it will retry automatically.',
        )
      })
      .finally(() => {
        if (!stopped) {
          timer = setTimeout(tick, 60000)
          timer.unref()
        }
      })
  }
  tick()
  return async () => {
    stopped = true
    if (timer) clearTimeout(timer)
    await pending
  }
}
