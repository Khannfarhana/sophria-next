import type { AppRole } from "@/lib/use-auth";

/** Maps each role to its default landing route. */
export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin",
  driver: "/driver",
  customer: "/dashboard",
};

/** Maps route prefixes to required roles. null = any authenticated user. */
export const ROUTE_ROLES: Record<string, AppRole | null> = {
  "/admin": "admin",
  "/driver": "driver",
  "/dashboard": null,
  "/book": null,
};

/** Returns the best landing page for a set of roles. */
export function getDefaultRoute(roles: AppRole[]): string {
  if (roles.includes("admin")) return ROLE_HOME.admin;
  if (roles.includes("driver")) return ROLE_HOME.driver;
  return ROLE_HOME.customer;
}
