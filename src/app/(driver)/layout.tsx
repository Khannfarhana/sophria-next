import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { ReactNode } from "react";

/**
 * Server-side layout guard for the (driver) route group.
 * Ensures only users with the "driver" role can access driver pages.
 * This is a second layer of defense after the edge proxy.
 */
export default async function DriverLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth");
  }

  const roles = (session.user.roles as string[]) || [];

  if (!roles.includes("driver")) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
