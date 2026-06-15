import type { Role } from "@prisma/client";

const PUBLIC = ["/", "/login", "/signup", "/cafe/guest"];
const MEMBER_PREFIXES = [
  "/dashboard",
  "/booking",
  "/cafe",
  "/print",
  "/keycard",
  "/topup",
  "/history",
];

/**
 * Returns the authorization requirement for a given pathname.
 *  - "public"  → no auth required
 *  - []        → any authenticated user (any role)
 *  - [roles]   → the user's role must be in this list
 *
 * Fails closed: unknown app paths require at least authentication.
 */
export function requiredRolesFor(pathname: string): Role[] | "public" {
  // /cafe/guest check must precede the generic /cafe member-prefix check
  if (pathname === "/cafe/guest") return "public";
  if (PUBLIC.includes(pathname)) return "public";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return ["ADMIN"];
  if (pathname === "/barista") return ["BARISTA", "ADMIN"];
  if (
    MEMBER_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  )
    return [];
  // Unknown path: fail closed — require at least authentication
  return [];
}

export function roleHome(role: Role): "/admin" | "/barista" | "/dashboard" {
  if (role === "ADMIN") return "/admin";
  if (role === "BARISTA") return "/barista";
  return "/dashboard";
}
