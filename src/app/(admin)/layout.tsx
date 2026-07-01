import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { ReactNode } from "react";

/**
 * Server-side layout guard for the (admin) route group.
 * Ensures only users with the "admin" role can access admin pages.
 * This is a second layer of defense after the edge proxy.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth");
  }

  const roles = (session.user.roles as string[]) || [];

  if (!roles.includes("admin")) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
