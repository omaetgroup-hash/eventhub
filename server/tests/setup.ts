import { bootstrapFirstAdmin, countUsers } from '../db';

if (countUsers() === 0) {
  bootstrapFirstAdmin({
    organizationName: 'Test Org',
    organizationSlug: 'test-org',
    name: 'Test Admin',
    email: 'admin@test.com',
    timezone: 'UTC',
    region: 'NZ',
  });
}
