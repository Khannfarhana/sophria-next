import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { ROUTE_ROLES } from "@/lib/roles";

/**
 * Edge proxy (Next.js 16 convention replacing middleware) for server-side route protection.
 *
 * Layer 1 of 3 in the RBAC defense-in-depth strategy:
 *   1. Edge proxy   — blocks requests before any page HTML/JS is served
 *   2. Route layout — server-side role check in each route group's layout.tsx
 *   3. Client guard — ProtectedRoute component for client-side enforcement
 *
 * Handles both authentication (is user logged in?) and authorization (does user
 * have the required role for this route?).
 */
export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // Determine which protected prefix (if any) the pathname matches
  const matchedPrefix = Object.keys(ROUTE_ROLES).find((prefix) =>
    nextUrl.pathname.startsWith(prefix)
  );

  if (!matchedPrefix) {
    return NextResponse.next();
  }

  // 1. Unauthenticated users → redirect to /auth
  if (!isLoggedIn) {
    const loginUrl = new URL("/auth", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Role-based enforcement
  const requiredRole = ROUTE_ROLES[matchedPrefix];

  if (requiredRole) {
    const roles = (req.auth?.user?.roles as string[]) || [];

    if (!roles.includes(requiredRole)) {
      // User is authenticated but lacks the required role → redirect to dashboard
      return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  // Run proxy on protected routes only
  matcher: ["/dashboard/:path*", "/admin/:path*", "/driver/:path*", "/book/:path*"],
};
