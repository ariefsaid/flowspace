/**
 * Setup file for integration tests (runs in each test worker before the test file).
 * Sets DATABASE_URL to the throwaway test DB so the app's Prisma singleton
 * connects to the test DB instead of the dev DB.
 */
const testUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/flowspace_test?schema=public";

// Override DATABASE_URL before lib/db/client.ts is evaluated.
process.env.DATABASE_URL = testUrl;
