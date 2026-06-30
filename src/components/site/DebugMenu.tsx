"use client";

import { useEffect, useRef, useState } from "react";
import { Bug, Check } from "lucide-react";
import { useAuth, type AppRole } from "@/lib/use-auth";

const ROLES: AppRole[] = ["customer", "driver", "admin"];

/**
 * Floating dev/demo control to toggle auth state and role without a real login.
 * Hidden in production unless NEXT_PUBLIC_ENABLE_DEMO === "true".
 */
export function DebugMenu({ dark = false }: { dark?: boolean }) {
  const { demo, setDemo, user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const show =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!show) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Demo / debug controls"
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          demo.enabled
            ? "border-amber-400/50 bg-amber-400/15 text-amber-300"
            : dark
            ? "border-white/20 bg-white/10 text-white/70 hover:text-white"
            : "border-black/10 bg-black/5 text-ink-muted hover:text-foreground"
        }`}
      >
        <Bug className="h-3.5 w-3.5" />
        {demo.enabled ? `Demo: ${demo.loggedIn ? demo.role : "logged out"}` : "Debug"}
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-2 w-64 rounded-xl border border-black/10 bg-white p-3 text-foreground shadow-2xl">
          <Row
            label="Demo mode"
            hint="Bypass real auth"
            checked={demo.enabled}
            onClick={() => setDemo({ enabled: !demo.enabled })}
          />

          <div className={`mt-2 space-y-2 ${demo.enabled ? "" : "pointer-events-none opacity-40"}`}>
            <Row
              label="Logged in"
              checked={demo.loggedIn}
              onClick={() => setDemo({ loggedIn: !demo.loggedIn })}
            />

            <div>
              <p className="mb-1 px-1 text-[11px] uppercase tracking-wide text-ink-muted">Role</p>
              <div className="grid grid-cols-3 gap-1">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDemo({ role: r, loggedIn: true })}
                    className={`rounded-lg px-2 py-1.5 text-xs capitalize transition-colors ${
                      demo.role === r
                        ? "bg-foreground text-background"
                        : "bg-black/5 text-ink-muted hover:bg-black/10"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-3 truncate border-t border-black/10 pt-2 text-[11px] text-ink-muted">
            {user ? `as ${user.email}` : "signed out"}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  hint,
  checked,
  onClick,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left hover:bg-black/5"
    >
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
      </span>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
          checked ? "border-foreground bg-foreground text-background" : "border-black/20"
        }`}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}
