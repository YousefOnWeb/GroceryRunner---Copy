import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';
import migrationsList from '../drizzle/migrations';
import * as schema from './schema';

const expoDb = openDatabaseSync('grocery_runner.db', { enableChangeListener: true });
export const db = drizzle(expoDb, { schema });

// Run migrations using Drizzle's migrate function
(async () => {
  try {
    await migrate(db, migrationsList);
  } catch (err) {
    console.error('Migration error:', err);
  }
})();
