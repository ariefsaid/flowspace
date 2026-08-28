/**
 * Authenticated booking-status-sweep entry point (I-040 Phase 10, FR-852).
 *
 * ORIG's sweep endpoint accepted unauthenticated requests (OBS-840 — a
 * defect, not behavior to copy). This route requires a job/scheduler Bearer
 * credential (`BOOKING_SWEEP_SECRET`) BEFORE any read/write and returns 401
 * for a public/wrong-credential request (AC-837). It has no browser session
 * of its own (a scheduled job has no cookies) — the Bearer secret IS the
 * "authenticated scheduled-job credential" FR-852 requires; it is deliberately
 * NOT layered with a Supabase session check (that would make a headless
 * cron invocation impossible).
 *
 * Deviation from the plan's task-32 sketch (noted, not a locked decision):
 * the plan's pseudocode additionally required `getSessionUser()` to be
 * non-null. A cron/job invocation carries no browser session cookies, so
 * requiring one would make the route uninvokable by a real scheduler. This
 * route instead resolves its single org scope server-side by slug — the
 * same `resolveGuestOrgId` pattern `app/cafe/actions.ts` already uses for
 * its other no-session, server-only path — never from a client-trusted id
 * (FR-852 "resolve one org scope"). `middleware.ts`/`route-policy.ts`
 * release `/api/cron/*` from the edge session gate (this route is its own
 * authority), matching the existing `/api/print-agent` pattern.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { organizations } from "@/lib/db/schema";
import { runStatusSweep } from "@/lib/db/bookings";

async function resolveOrgIdBySlug(slug: string): Promise<string | null> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org?.id ?? null;
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.BOOKING_SWEEP_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); // AC-837 — before any read/write
  }

  const slug = new URL(request.url).searchParams.get("org") ?? process.env.SEED_ORG_SLUG ?? "flowspace";
  const orgId = await resolveOrgIdBySlug(slug);
  if (!orgId) return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 });

  const result = await runStatusSweep(orgId, new Date());
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
