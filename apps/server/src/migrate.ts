import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from './config.js';
import { createDatabase } from './db/index.js';
const database = createDatabase(loadConfig());
await migrate(database.db, { migrationsFolder: './drizzle' });
await database.pool.end();
