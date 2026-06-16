/**
 * Shared application-level types.
 *
 * Domain entity types come from the Drizzle schema (`@/lib/db/schema`) and the
 * enum source (`@/lib/db/enums`, ADR-0015); keep this for cross-cutting types
 * (API envelopes, tenancy context, etc.).
 */

/** Resolved tenant context passed through server requests. */
export interface TenantContext {
  orgId: string;
}
