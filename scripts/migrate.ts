// Runs all pending DB migrations and exits.
// Use before deploying a new version to ensure the schema is up to date.

import { getDb } from '../server/db';

const rows = getDb().prepare('SELECT name, run_at FROM migrations ORDER BY run_at').all() as Array<{ name: string; run_at: string }>;
console.log(`Migrations complete. ${rows.length} migration(s) on record:`);
for (const row of rows) {
  console.log(`  [${row.run_at}] ${row.name}`);
}
process.exit(0);
