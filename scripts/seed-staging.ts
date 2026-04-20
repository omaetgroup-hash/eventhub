import {
  appendAudit,
  countUsers,
  createOrUpdateUser,
  updateOrganizationRecord,
} from '../server/db';

function nowIso() {
  return new Date().toISOString();
}

function main() {
  if (countUsers() > 0) {
    console.log('Database already has users. Staging seed skipped — wipe the DB first if you want to re-seed.');
    process.exit(0);
  }

  updateOrganizationRecord({
    name: 'EventHub Staging',
    slug: 'eventhub-staging',
    timezone: 'Pacific/Auckland',
    region: 'NZ',
    plan: 'starter',
    enabledPacks: ['standard', 'operations'],
  });

  const admin = createOrUpdateUser({
    id: 'user_staging_admin',
    name: 'Staging Admin',
    email: 'admin@staging.eventhub.example',
    role: 'super_admin',
    scope: 'EventHub Staging (all organizations)',
    lastActive: nowIso(),
  });

  createOrUpdateUser({
    id: 'user_staging_ops',
    name: 'Staging Ops',
    email: 'ops@staging.eventhub.example',
    role: 'staff',
    scope: 'EventHub Staging',
    lastActive: nowIso(),
  });

  appendAudit({ actor: admin.id, action: 'system.seed_completed', target: 'staging', severity: 'info', note: 'seed:staging' });

  console.log('Staging seed complete.');
  console.log('  Admin:   admin@staging.eventhub.example');
  console.log('  Ops:     ops@staging.eventhub.example');
}

main();
process.exit(0);
