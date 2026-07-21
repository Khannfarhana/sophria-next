"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import { BookingsPanel } from "@/components/admin/BookingsPanel";

export default function AdminBookingsPage() {
  return (
    <ProtectedRoute role="admin">
      <Suspense fallback={<div className="min-h-screen bg-night" />}>
        <Bookings />
      </Suspense>
    </ProtectedRoute>
  );
}

function Bookings() {
  // Deep links from the overview preset the filter: /admin/bookings?f=pending
  const initialFilter = useSearchParams().get("f") ?? "all";
  return (
    <AdminShell
      title="Bookings"
      sub="Confirm, price, and dispatch every ride. New requests appear automatically."
    >
      <BookingsPanel initialFilter={initialFilter} />
    </AdminShell>
  );
}
