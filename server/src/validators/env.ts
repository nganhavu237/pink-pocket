import { z } from 'zod'

const httpOrigin = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && value === url.origin
    } catch {
      return false
    }
  }, 'Use an HTTP(S) origin without a path or trailing slash')

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  JWT_SECRET: z.string().min(32, 'Must contain at least 32 characters'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => /^postgres(?:ql)?:\/\//.test(value),
      'Use a PostgreSQL connection URL',
    ),
  FRONTEND_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(httpOrigin).min(1)),
})

export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    // Never include values: DATABASE_URL may contain credentials.
    throw new Error(
      `Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    )
  }
  return result.data
}
