import type { Role } from "@/lib/db/enums";

/**
 * UX-ONLY authorization helper. NOT the security boundary — the server
 * middleware (middleware.ts) and the org_id-scoped repository (lib/db/*)
 * are authoritative (ADR-0004). Use this only to show/hide affordances.
 */
export function can(
  action: "access",
  entity: "admin" | "barista",
  ctx: { role: Role },
): boolean {
  if (entity === "admin") return ctx.role === "ADMIN";
  return ctx.role === "ADMIN" || ctx.role === "BARISTA";
}
