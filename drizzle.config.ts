import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // App tables only; RLS/Storage/Realtime live in supabase/migrations (ADR-0015 §2).
  schemaFilter: ["public"],
  tablesFilter: ["organizations", "app_users"],
});
