import { z } from 'zod'
import { Prisma } from '../generated/prisma/client.js'

export const money = z
  .string()
  .regex(
    /^\d{1,17}(\.\d{1,2})?$/,
    'Use a positive amount with up to 2 decimal places',
  )
  .refine((value) => {
    try {
      return (
        new Prisma.Decimal(value).isFinite() &&
        new Prisma.Decimal(value).greaterThan(0)
      )
    } catch {
      return false
    }
  }, 'Amount must be greater than zero')
export const kind = z.enum(['INCOME', 'EXPENSE'])
export const id = z.string().uuid()
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return (
      value.slice(0, 4) !== '0000' &&
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
  }, 'Use a valid date')
export const transactionInput = z
  .object({
    amount: money,
    type: kind,
    categoryId: id,
    date: dateOnly.optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict()
export const period = z.object({
  month: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .default(() => new Date().getUTCMonth() + 1),
  year: z.coerce
    .number()
    .int()
    .min(1)
    .max(9999)
    .default(() => new Date().getUTCFullYear()),
})
export const listQuery = z
  .object({
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(1).max(9999).optional(),
    categoryId: id.optional(),
    type: kind.optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (value) => Boolean(value.month) === Boolean(value.year),
    'Provide both month and year',
  )
export const budgetInput = period.extend({ amount: money }).strict()
export const profileInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    currency: z.enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD']),
  })
  .strict()
export const loginInput = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z
      .string()
      .min(1)
      .max(128)
      .refine(
        (value) => Buffer.byteLength(value) <= 72,
        'Password exceeds 72 bytes',
      ),
  })
  .strict()
export const registerInput = loginInput.extend({
  name: z.string().trim().min(1).max(100),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(72)
    .refine(
      (value) => Buffer.byteLength(value) <= 72,
      'Password exceeds 72 bytes',
    ),
})
export function monthRange(month: number, year: number) {
  // setUTCFullYear handles years 1–99 without Date.UTC's 1900 offset.
  const start = new Date(0)
  start.setUTCFullYear(year, month - 1, 1)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  return { gte: start, lt: end }
}
