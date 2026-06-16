#!/usr/bin/env node
/**
 * Apply the Supabase-owned up-migrations (supabase/migrations/*.sql, excluding
 * *.down.sql) in filename order against DATABASE_URL. Used by CI (and locally)
 * to apply the auth-link FK / RLS / Storage platform wiring AFTER drizzle-kit
 * has created the application tables. (ADR-0015 §2: drizzle-kit owns app DDL;
 * supabase/migrations own platform wiring that is not application tables.)
 *
 * Why a script (not `supabase migration`): for an unlinked local-only project
 * the CLI does not track/apply `supabase/migrations/`, so the platform wiring is
 * applied explicitly here in deterministic order. On a fresh DB (CI) every
 * migration runs exactly once.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migDir = join(root, "supabase", "migrations");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const files = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
  .sort();

const sql = postgres(url, { prepare: false });
try {
  for (const f of files) {
    const content = readFileSync(join(migDir, f), "utf8");
    process.stdout.write(`Applying ${f} ... `);
    await sql.unsafe(content);
    process.stdout.write("ok\n");
  }
} finally {
  await sql.end();
}
console.log(`Applied ${files.length} supabase migration(s).`);
