import type { Role } from "@/lib/db/enums";

/**
 * Paths that require no auth at all. `/cafe/guest` is the public guest-order
 * surface. The booking-status-sweep route (I-040, FR-852) does its own
 * robust Bearer-secret job auth inside the route handler — releasing it
 * from the edge session gate lets a headless scheduler invoke it with no
 * browser session. [SEC] Named EXACTLY (not a `/api/cron/*` wildcard
 * prefix) — a future `/api/cron/<something-else>` route must not silently
 * inherit "no session gate" just by living under the same path prefix; it
 * would need its own deliberate addition here.
 */
const PUBLIC_EXACT = ["/", "/login", "/signup", "/api/cron/booking-status-sweep"];
const PUBLIC_PREFIXES = ["/cafe/guest", "/api/print-agent"];

/** Member surfaces: any authenticated user (any role) may access. */
const MEMBER_PREFIXES = [
  "/dashboard",
  "/booking",
  "/cafe",
  "/print",
  "/keycard",
  "/topup",
  "/history",
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Returns the authorization requirement for a given pathname.
 *  - "public"  → no auth required
 *  - []        → any authenticated user (any role)
 *  - [roles]   → the user's role must be in this list
 *
 * Fails CLOSED: an unknown path returns ["ADMIN"], so a plain member is denied
 * and redirected to their role home by the `authorized` callback. We never
 * return [] (any-authed) for a path we do not explicitly recognise (M2).
 *
 * Ordering note: the public `/cafe/guest` prefix MUST be checked before the
 * `/cafe` member prefix, or the member rule would shadow it (M2).
 */
export function requiredRolesFor(pathname: string): Role[] | "public" {
  // Public must precede everything (esp. /cafe/guest before /cafe).
  if (PUBLIC_EXACT.includes(pathname)) return "public";
  if (PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "public";

  if (matchesPrefix(pathname, "/admin")) return ["ADMIN"];

  // M1: barista sub-paths (e.g. /barista/queue) must match the prefix too.
  if (matchesPrefix(pathname, "/barista")) return ["BARISTA", "ADMIN"];

  if (MEMBER_PREFIXES.some((p) => matchesPrefix(pathname, p))) return [];

  // M2: unknown path → fail closed (deny plain members).
  return ["ADMIN"];
}

export function roleHome(role: Role): "/admin" | "/barista" | "/dashboard" {
  if (role === "ADMIN") return "/admin";
  if (role === "BARISTA") return "/barista";
  return "/dashboard";
}
