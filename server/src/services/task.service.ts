import type { z } from 'zod'
import type { PrismaClient, Task } from '../generated/prisma/client.js'
import type { taskInput, taskUpdate } from '../validators/task.js'
import { HttpError } from '../middleware/error-handler.js'

function serializeTask(task: Task) {
  return { ...task, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null }
}
function dateValue(value: string | null | undefined) {
  return value ? new Date(value + 'T00:00:00Z') : value
}
export function createTasks(db: PrismaClient) {
  return {
    async list(userId: string) {
      const tasks = await db.task.findMany({
        where: { userId },
        orderBy: [
          { completed: 'asc' },
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { dueTime: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
      })
      return tasks.map(serializeTask)
    },
    async create(userId: string, input: z.infer<typeof taskInput>) {
      return serializeTask(
        await db.task.create({
          data: {
            ...input,
            userId,
            dueDate: dateValue(input.dueDate),
            completed: input.completed ?? false,
          },
        }),
      )
    },
    async update(
      userId: string,
      id: string,
      input: z.infer<typeof taskUpdate>,
    ) {
      // Include ownership in the write, not only an earlier authorization check.
      return db.$transaction(async (tx) => {
        const task = await tx.task.updateMany({
          where: { id, userId },
          data: { ...input, dueDate: dateValue(input.dueDate) },
        })
        if (!task.count) throw new HttpError(404, 'NOT_FOUND', 'Task not found')
        const saved = await tx.task.findFirst({ where: { id, userId } })
        if (!saved) throw new HttpError(404, 'NOT_FOUND', 'Task not found')
        return serializeTask(saved)
      })
    },
    async remove(userId: string, id: string) {
      const result = await db.task.deleteMany({ where: { id, userId } })
      if (!result.count) throw new HttpError(404, 'NOT_FOUND', 'Task not found')
    },
  }
}
