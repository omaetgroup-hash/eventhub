import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../server/db';

const TABLE_PK: Record<string, string> = {
  organizations: 'id',
  venues: 'id',
  events: 'id',
  ticket_tiers: 'id',
  orders: 'id',
  issued_tickets: 'id',
  scan_records: 'id',
  audit_log: 'id',
  campaigns: 'id',
  discounts: 'id',
  referral_links: 'id',
  devices: 'id',
  access_rules: 'id',
  conference_sessions: 'id',
  speakers: 'id',
  exhibitors: 'id',
  sponsors: 'id',
  membership_plans: 'id',
  dynamic_pricing_rules: 'id',
};

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const inFile = args.find((a) => !a.startsWith('-'));
  if (!inFile) {
    console.error('Usage: tsx scripts/import-data.ts <export-file.json> [--dry-run]');
    process.exit(1);
  }

  const inPath = path.resolve(inFile);
  if (!fs.existsSync(inPath)) {
    console.error(`File not found: ${inPath}`);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(inPath, 'utf8')) as Record<string, unknown[]>;
  const meta = (dump['_meta'] ?? [{}]) as Array<Record<string, unknown>>;
  console.log(`Import source: ${inPath}`);
  console.log(`  Exported at: ${(meta[0] as { exportedAt?: string }).exportedAt ?? 'unknown'}`);
  if (dryRun) console.log('  Dry-run mode — no changes written.');

  const db = getDb();

  for (const [table, rows] of Object.entries(dump)) {
    if (table === '_meta' || !TABLE_PK[table]) continue;
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const firstRow = rows[0] as Record<string, unknown>;
    const cols = Object.keys(firstRow);

    if (dryRun) {
      console.log(`  [dry-run] ${table}: would import ${rows.length} row(s)`);
      continue;
    }

    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
    const stmt = db.prepare(sql);
    const insert = db.transaction(() => {
      let imported = 0;
      for (const row of rows as Array<Record<string, unknown>>) {
        const values = cols.map((c) => row[c] ?? null);
        const info = stmt.run(values);
        if (info.changes > 0) imported++;
      }
      return imported;
    });

    const imported = insert();
    console.log(`  ${table}: ${imported}/${rows.length} rows imported (skipped ${rows.length - imported} existing)`);
  }

  console.log(dryRun ? 'Dry-run complete — no changes made.' : 'Import complete.');
  process.exit(0);
}

main();
