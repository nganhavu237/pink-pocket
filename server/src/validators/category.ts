import { z } from 'zod'
import { kind } from './finance.js'
const name = z
  .string()
  .trim()
  .min(1, 'Enter a category name')
  .max(100, 'Use 100 characters or fewer')
export const categoryInput = z.object({ name, type: kind }).strict()
export const categoryRename = z.object({ name }).strict()
