/**
 * Setup file for integration tests (runs in each test worker before the test file).
 * Sets DATABASE_URL to the Supabase local stack DB so the Drizzle client connects
 * to the test DB.
 * Default: Supabase local stack (ADR-0015, Task 2.4).
 */
const testUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

// Override DATABASE_URL before lib/db/drizzle.ts is evaluated.
process.env.DATABASE_URL = testUrl;
