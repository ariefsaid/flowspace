/**
 * Setup file for integration tests (runs in each test worker before the test file).
 * Sets DATABASE_URL (and DIRECT_URL for Prisma compatibility) to the Supabase
 * local stack DB so all DB clients connect to the test DB.
 * Default: Supabase local stack (ADR-0015, Task 2.4).
 */
const testUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

// Override DATABASE_URL before lib/db/drizzle.ts or lib/db/client.ts is evaluated.
process.env.DATABASE_URL = testUrl;
// Prisma's schema.prisma uses directUrl = env("DIRECT_URL") for Supabase (pooler bypass).
// Set it to the same URL so Prisma can connect during the Phases 1-5 bridge period.
process.env.DIRECT_URL = testUrl;
