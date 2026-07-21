import type { AppRole } from "@/lib/use-auth";

/**
 * Maps each role to its default landing route.
 *
 * `pricing` is a CAPABILITY, not a place — it grants the right to publish the
 * rate card and is always held alongside another role. It has no home of its
 * own, so it lands where a customer would; getDefaultRoute never picks it.
 */
export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin",
  driver: "/driver",
  customer: "/dashboard",
  pricing: "/dashboard",
};

/** Maps route prefixes to required roles. null = any authenticated user. */
export const ROUTE_ROLES: Record<string, AppRole | null> = {
  "/admin": "admin",
  "/driver": "driver",
  "/dashboard": null,
  // "/book" is intentionally absent: quoting is public — auth is required only
  // at the confirm step (and enforced server-side by createBookingAction).
};

/** Returns the best landing page for a set of roles. */
export function getDefaultRoute(roles: AppRole[]): string {
  if (roles.includes("admin")) return ROLE_HOME.admin;
  if (roles.includes("driver")) return ROLE_HOME.driver;
  return ROLE_HOME.customer;
}
