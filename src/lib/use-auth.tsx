"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useSession, signOut as nextAuthSignOut } from "next-auth/react";
import type { Session } from "next-auth";

export type AppRole = "customer" | "driver" | "admin";

export interface DemoState {
  enabled: boolean;
  loggedIn: boolean;
  role: AppRole;
}

const DEMO_STORAGE_KEY = "sophria:demo-auth";
const DEFAULT_DEMO: DemoState = { enabled: false, loggedIn: true, role: "customer" };

type AuthUser = Session["user"] | ReturnType<typeof makeDemoUser> | null;

interface AuthCtx {
  user: AuthUser;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  /** Demo / debug override state (dev tooling). */
  demo: DemoState;
  setDemo: (next: Partial<DemoState>) => void;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  roles: [],
  loading: true,
  signOut: async () => {},
  refreshRoles: async () => {},
  demo: DEFAULT_DEMO,
  setDemo: () => {},
});

// Map demo roles to seed user IDs (src/data/data.ts) so demo sessions see the
// mock DB's seeded bookings/driver data and any CRUD they perform persists.
const DEMO_SEED_IDS: Record<AppRole, string> = {
  customer: "00000000-0000-4000-a000-000000000002", // Jordan Avery
  driver: "00000000-0000-4000-a000-000000000011", // Marcus Bennett (driver1)
  admin: "00000000-0000-4000-a000-000000000001", // SophRia Operations
};

function makeDemoUser(role: AppRole) {
  return {
    id: DEMO_SEED_IDS[role],
    name: `Demo ${role[0].toUpperCase()}${role.slice(1)}`,
    email: `demo-${role}@sophria.test`,
    roles: [role],
    demo: true,
  };
}

// Demo mode is a dev/preview aid only. It fabricates a client-side session
// (no real accessToken, so it can't pass server layouts or authorize actions),
// but it should never be activatable in production. Gated behind a build flag.
const DEMO_ALLOWED =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();

  // Demo override state, hydrated from localStorage on the client.
  const [demo, setDemoState] = useState<DemoState>(DEFAULT_DEMO);
  const [demoReady, setDemoReady] = useState(false);

  useEffect(() => {
    if (!DEMO_ALLOWED) { setDemoReady(true); return; }
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) setDemoState({ ...DEFAULT_DEMO, ...JSON.parse(raw) });
    } catch {
      /* ignore malformed storage */
    }
    setDemoReady(true);
  }, []);

  const setDemo = useCallback((next: Partial<DemoState>) => {
    setDemoState((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      return merged;
    });
  }, []);

  // --- Resolve effective auth: demo override wins when enabled ---
  let user: AuthUser;
  let roles: AppRole[];
  let loading: boolean;

  if (DEMO_ALLOWED && demo.enabled) {
    loading = !demoReady;
    user = demo.loggedIn ? makeDemoUser(demo.role) : null;
    roles = demo.loggedIn ? [demo.role] : [];
  } else {
    loading = status === "loading";
    user = session?.user || null;
    roles = (session?.user?.roles as AppRole[]) || [];
  }

  const signOut = async () => {
    if (demo.enabled) {
      setDemo({ loggedIn: false });
      return;
    }
    await nextAuthSignOut({ redirect: true, callbackUrl: "/auth" });
  };

  const refreshRoles = async () => {
    if (demo.enabled) return;
    await update();
  };

  return (
    <Ctx.Provider
      value={{ user, session: demo.enabled ? null : session, roles, loading, signOut, refreshRoles, demo, setDemo }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
export const useHasRole = (role: AppRole) => useAuth().roles.includes(role);
