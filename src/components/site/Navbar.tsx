"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/lib/use-auth";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/fleet", label: "Fleet" },
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, roles, signOut } = useAuth();
  const pathname = usePathname();

  const portalLink = roles.includes("admin")
    ? { href: "/admin", label: "Admin" }
    : roles.includes("driver")
    ? { href: "/driver", label: "Driver" }
    : { href: "/dashboard", label: "My Bookings" };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="font-display text-2xl tracking-wide">SophRia</Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition-colors hover:text-foreground ${
                  isActive ? "text-foreground font-medium" : "text-ink-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/become-chauffeur" className="text-sm text-ink-muted hover:text-foreground">Drive with us</Link>
          {user ? (
            <>
              <Link href={portalLink.href} className="text-sm text-ink-muted hover:text-foreground">{portalLink.label}</Link>
              <button onClick={signOut} className="text-sm text-ink-muted hover:text-foreground cursor-pointer">Sign out</button>
              <Link href="/book" className="rounded-sm bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]">Book Now</Link>
            </>
          ) : (
            <>
              <Link href="/auth" className="text-sm text-ink-muted hover:text-foreground">Sign in</Link>
              <Link href="/book" className="rounded-sm bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]">Book Now</Link>
            </>
          )}
        </div>

        <button className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background lg:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="py-2 text-sm text-ink-muted">{item.label}</Link>
            ))}
            <div className="my-2 h-px bg-border" />
            <Link href="/become-chauffeur" onClick={() => setOpen(false)} className="py-2 text-sm">Drive with us</Link>
            {user ? (
              <>
                <Link href={portalLink.href} onClick={() => setOpen(false)} className="py-2 text-sm">{portalLink.label}</Link>
                <button onClick={() => { signOut(); setOpen(false); }} className="py-2 text-left text-sm cursor-pointer">Sign out</button>
              </>
            ) : (
              <Link href="/auth" onClick={() => setOpen(false)} className="py-2 text-sm">Sign in</Link>
            )}
            <Link href="/book" onClick={() => setOpen(false)} className="mt-2 rounded-sm bg-primary px-5 py-3 text-center text-sm font-medium text-primary-foreground">Book Now</Link>
          </div>
        </div>
      )}
    </header>
  );
}
