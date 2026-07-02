"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSession, signOut as nextAuthSignOut } from "next-auth/react";
import type { Session } from "next-auth";

export type AppRole = "customer" | "driver" | "admin";

type AuthUser = Session["user"] | null;

interface AuthCtx {
  user: AuthUser;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  roles: [],
  loading: true,
  signOut: async () => {},
  refreshRoles: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();

  const user = session?.user || null;
  const roles = (session?.user?.roles as AppRole[]) || [];
  const loading = status === "loading";

  const signOut = async () => {
    await nextAuthSignOut({ redirect: true, callbackUrl: "/auth" });
  };

  const refreshRoles = async () => {
    await update();
  };

  return (
    <Ctx.Provider value={{ user, session, roles, loading, signOut, refreshRoles }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
export const useHasRole = (role: AppRole) => useAuth().roles.includes(role);
