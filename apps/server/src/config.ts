import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  APP_URL: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgres://callyou:callyou@localhost:5432/callyou'),
  SESSION_SECRET: z.string().min(32).default('development-only-secret-change-me-123456'),
  SESSION_HOURS: z.coerce.number().positive().default(24),
  ROOM_INACTIVITY_HOURS: z.coerce.number().positive().default(24),
  RECONNECT_GRACE_SECONDS: z.coerce.number().int().positive().default(30),
  TURN_SHARED_SECRET: z.string().default(''),
  TURN_REALM: z.string().default('callyou.ir'),
  TURN_HOST: z.string().default(''),
  TURN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
