import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../server/db';

const EXPORT_TABLES = [
  'organizations',
  'venues',
  'events',
  'ticket_tiers',
  'orders',
  'issued_tickets',
  'scan_records',
  'audit_log',
  'campaigns',
  'discounts',
  'referral_links',
  'devices',
  'access_rules',
  'conference_sessions',
  'speakers',
  'exhibitors',
  'sponsors',
  'membership_plans',
  'dynamic_pricing_rules',
];

function main() {
  const db = getDb();
  const outFile = process.argv[2] ?? `eventhub-export-${new Date().toISOString().slice(0, 10)}.json`;
  const outPath = path.resolve(outFile);

  const dump: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    try {
      dump[table] = db.prepare(`SELECT * FROM ${table}`).all() as unknown[];
    } catch {
      dump[table] = [];
    }
  }

  dump['_meta'] = [{
    exportedAt: new Date().toISOString(),
    tables: EXPORT_TABLES,
    version: 1,
  }];

  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf8');
  const size = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`Exported ${EXPORT_TABLES.length} tables → ${outPath} (${size} KB)`);
  for (const [table, rows] of Object.entries(dump)) {
    if (table !== '_meta') {
      console.log(`  ${table}: ${(rows as unknown[]).length} rows`);
    }
  }
  process.exit(0);
}

main();
