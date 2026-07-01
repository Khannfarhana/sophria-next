"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type AppRole } from "@/lib/use-auth";

export function ProtectedRoute({ children, role }: { children: ReactNode; role?: AppRole }) {
  const { user, roles, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/auth");
      return;
    }
    if (role && !roles.includes(role)) {
      router.push("/dashboard");
    }
  }, [user, roles, loading, role, router]);

  if (loading || !user || (role && !roles.includes(role))) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
          <span className="text-sm text-white/40">Verifying access…</span>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

