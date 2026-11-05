import 'dotenv/config'
import { parseEnv } from '../validators/env.js'

export const env = parseEnv(process.env)
