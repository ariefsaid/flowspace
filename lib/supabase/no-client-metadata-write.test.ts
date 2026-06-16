/**
 * M-1 — static guard: app_metadata (role / org_id) is admin-API-only.
 *
 * `role` and `org_id` are mirrored into the Supabase JWT as app-metadata claims
 * at signup via the **admin (service-role) API**, and the edge gate + RLS read
 * them as trusted. If a client-reachable ("use client") module could call
 * `auth.updateUser` with `app_metadata`/`role`/`org_id`, a user could forge
 * their own role/tenant claim and elevate privileges — a privilege-escalation
 * hole. This test scans the committed source and fails if any client module ever
 * makes such a call.
 *
 * This is a source-scanning invariant guard (not behavior under a mock). It
 * passes today because no client module calls updateUser at all; it exists to
 * fail loudly the moment someone adds one. See ADR-0014 §1.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Recursively collect source files under a directory. */
function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Only files that opt into the client bundle with a "use client" directive. */
function isClientModule(text: string): boolean {
  // The directive must be at the very top (optionally after a hashbang/comment
  // line). A leading-slice check is sufficient and avoids matching the string
  // mid-source.
  return /^\s*("|')use client("|')/.test(text);
}

/** The argument region right after an `updateUser(` call (best-effort window). */
function forbiddenUpdateUserArgs(text: string): boolean {
  const idx = text.search(/auth\s*\.\s*updateUser\s*\(/);
  if (idx === -1) return false;
  const region = text.slice(idx, idx + 400);
  return /app_metadata\b|"role"|'role'|"org_id"|'org_id'/.test(region);
}

const SOURCE_DIRS = ["app", "components", "lib"].map((d) => join(ROOT, d));

const TEST_FILE_RE = /\.(int\.test|test|spec)\.(ts|tsx)$/;

function clientSourceFiles(): string[] {
  return SOURCE_DIRS.flatMap((dir) => walk(dir)).filter((f) => {
    if (TEST_FILE_RE.test(f)) return false;
    const text = readFileSync(f, "utf8");
    return isClientModule(text);
  });
}

describe("M-1: app_metadata is admin-API-only (never client-writable)", () => {
  it("no client-reachable ('use client') module calls auth.updateUser with app_metadata/role/org_id", () => {
    const offenders = clientSourceFiles().filter((f) =>
      forbiddenUpdateUserArgs(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
