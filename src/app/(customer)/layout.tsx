import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { ReactNode } from "react";

/**
 * Server-side layout guard for the (customer) route group.
 * Ensures users are authenticated before accessing customer pages
 * (dashboard). Any role (customer, driver, admin) can access these
 * pages — only authentication is required. Booking lives in (public):
 * quoting is open to guests and auth happens at the confirm step.
 */
export default async function CustomerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth");
  }

  return <>{children}</>;
}
