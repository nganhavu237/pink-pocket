import { z } from 'zod'
import { dateOnly } from './finance.js'

export const taskInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a task name')
      .max(200, 'Use 200 characters or fewer'),
    dueDate: dateOnly.nullable().optional(),
    // Wall-clock time, independent of date. No timezone conversion or reminders.
    dueTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid time (HH:mm)')
      .nullable()
      .optional(),
    completed: z.boolean().optional(),
  })
  .strict()
export const taskUpdate = taskInput
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide a task field to update',
  )
