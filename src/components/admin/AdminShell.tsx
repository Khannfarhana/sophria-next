"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarClock,
  Users,
  Car,
  SlidersHorizontal,
  BarChart3,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { BrandMark } from "@/components/site/BrandMark";

const NAV = [
  { href: "/admin", label: "Overview", Icon: LayoutDashboard },
  { href: "/admin/bookings", label: "Bookings", Icon: CalendarClock },
  { href: "/admin/drivers", label: "Drivers", Icon: Users },
  { href: "/admin/fleet", label: "Fleet", Icon: Car },
  { href: "/admin/rates", label: "Rates", Icon: SlidersHorizontal },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart3 },
] as const;

/**
 * Dark console shell for /admin/*: fixed sidebar on desktop, top bar with a
 * horizontal nav on mobile. Marketing chrome (footer, WhatsApp) stays out —
 * this is a work surface.
 */
export function AdminShell({
  title,
  sub,
  actions,
  children,
}: {
  title: string;
  /** One quiet line under the title — what this page is for. */
  sub?: string;
  /** Right-aligned header widgets (filters, buttons). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const navLinks = (compact: boolean) =>
    NAV.map(({ href, label, Icon }) => {
      const active = isActive(href);
      return (
        <Link
          key={href}
          href={href}
          className={
            compact
              ? `flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
                  active ? "bg-white text-black" : "text-white/60 hover:text-white"
                }`
              : `group relative flex items-center gap-3 rounded-sm px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-white/[0.07] text-white"
                    : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                }`
          }
        >
          {!compact && (
            <span
              aria-hidden
              className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold transition-opacity ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          <Icon className={`h-4 w-4 ${active ? "text-gold-soft" : ""}`} />
          {label}
        </Link>
      );
    });

  return (
    <div className="flex min-h-screen bg-night text-white">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/10 bg-night-panel px-4 py-6 lg:flex">
        <Link href="/admin" className="px-4">
          <BrandMark />
          <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-gold">Console</div>
        </Link>
        <nav className="mt-8 flex flex-col gap-1">{navLinks(false)}</nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-4">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-sm px-4 py-2.5 text-sm text-white/55 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>
          <button
            onClick={signOut}
            className="flex cursor-pointer items-center gap-3 rounded-sm px-4 py-2.5 text-left text-sm text-white/55 transition-colors hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1 lg:pl-60">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 border-b border-white/10 bg-night/90 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <Link href="/admin">
              <BrandMark />
            </Link>
            <div className="flex items-center gap-4 text-sm text-white/60">
              <Link href="/" className="hover:text-white">Site</Link>
              <button onClick={signOut} className="cursor-pointer hover:text-white">Sign out</button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            {navLinks(true)}
          </nav>
        </div>

        <main className="px-5 py-8 md:px-10 md:py-10">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-gold">
                  <span aria-hidden className="h-px w-6 bg-gold/60" />
                  Admin
                </div>
                <h1 className="mt-2 font-display text-4xl">{title}</h1>
                {sub && <p className="mt-2 max-w-xl text-sm text-white/55">{sub}</p>}
              </div>
              {actions}
            </div>
            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
