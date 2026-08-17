import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Config } from '../config.js';

export function createDatabase(config: Config) {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
  return { pool, db: drizzle(pool) };
}
export type Database = ReturnType<typeof createDatabase>;
