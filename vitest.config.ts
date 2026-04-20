import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    singleThread: true,
    setupFiles: ['./server/tests/setup.ts'],
    include: ['server/tests/**/*.test.ts'],
    env: {
      DATABASE_PATH: ':memory:',
      QR_CHECKSUM_SALT: 'test-salt',
      NODE_ENV: 'test',
      SEED_DEMO_DATA: 'false',
    },
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts'],
      exclude: ['server/tests/**'],
    },
  },
});
