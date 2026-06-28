"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, roles, signOut } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const portalLink = roles.includes("admin")
    ? { href: "/admin", label: "Admin" }
    : roles.includes("driver")
    ? { href: "/driver", label: "Driver" }
    : { href: "/dashboard", label: "My Bookings" };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full">
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between px-6 transition-all duration-500 ${
          isScrolled ? "py-3" : "py-5"
        }`}
      >
        {/* Logo */}
        <Link
          href="/"
          className={`font-display text-2xl tracking-wide transition-colors duration-500 ${
            isScrolled ? "text-foreground" : "text-white drop-shadow-sm"
          }`}
        >
          SophRia
        </Link>

        {/* Floating pill nav */}
        <nav
          className={`hidden items-center gap-0.5 rounded-full border px-2 py-1.5 backdrop-blur-xl transition-all duration-500 lg:flex ${
            isScrolled
              ? "border-black/[0.07] bg-white/85 shadow-md"
              : "border-white/20 bg-white/10 shadow-lg"
          }`}
        >
          {NAV.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                  isScrolled
                    ? isActive
                      ? "bg-black/[0.07] text-foreground"
                      : "text-ink-muted hover:bg-black/[0.04] hover:text-foreground"
                    : isActive
                    ? "bg-white/20 text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="hidden items-center gap-4 lg:flex">
          <Link
            href="/become-chauffeur"
            className={`text-sm transition-colors duration-500 ${
              isScrolled ? "text-ink-muted hover:text-foreground" : "text-white/70 hover:text-white"
            }`}
          >
            Drive with us
          </Link>
          {user ? (
            <>
              <Link
                href={portalLink.href}
                className={`text-sm transition-colors duration-500 ${
                  isScrolled ? "text-ink-muted hover:text-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                {portalLink.label}
              </Link>
              <button
                onClick={signOut}
                className={`cursor-pointer text-sm transition-colors duration-500 ${
                  isScrolled ? "text-ink-muted hover:text-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className={`text-sm transition-colors duration-500 ${
                isScrolled ? "text-ink-muted hover:text-foreground" : "text-white/70 hover:text-white"
              }`}
            >
              Sign in
            </Link>
          )}
          <Link
            href="/book"
            className={`rounded-sm px-5 py-2 text-sm font-medium shadow-sm transition-all duration-500 ${
              isScrolled
                ? "bg-primary text-primary-foreground hover:bg-[#2A2A2A]"
                : "bg-white text-black hover:bg-white/90"
            }`}
          >
            Book Now
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className={`transition-colors duration-500 lg:hidden ${isScrolled ? "text-foreground" : "text-white"}`}
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          className={`mx-4 mt-1 overflow-hidden rounded-2xl border shadow-xl backdrop-blur-2xl lg:hidden ${
            isScrolled
              ? "border-black/[0.07] bg-white/90"
              : "border-white/15 bg-black/60"
          }`}
        >
          <div className="flex flex-col gap-1 p-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-xl px-4 py-2.5 text-sm transition-colors ${
                  isScrolled
                    ? "text-ink-muted hover:bg-black/[0.04] hover:text-foreground"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className={`my-2 h-px ${isScrolled ? "bg-border" : "bg-white/10"}`} />
            <Link
              href="/become-chauffeur"
              onClick={() => setOpen(false)}
              className={`rounded-xl px-4 py-2.5 text-sm transition-colors ${
                isScrolled
                  ? "text-ink-muted hover:bg-black/[0.04] hover:text-foreground"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              Drive with us
            </Link>
            {user ? (
              <>
                <Link
                  href={portalLink.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-4 py-2.5 text-sm transition-colors ${
                    isScrolled
                      ? "text-ink-muted hover:bg-black/[0.04] hover:text-foreground"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {portalLink.label}
                </Link>
                <button
                  onClick={() => { signOut(); setOpen(false); }}
                  className={`cursor-pointer rounded-xl px-4 py-2.5 text-left text-sm transition-colors ${
                    isScrolled
                      ? "text-ink-muted hover:bg-black/[0.04] hover:text-foreground"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/auth"
                onClick={() => setOpen(false)}
                className={`rounded-xl px-4 py-2.5 text-sm transition-colors ${
                  isScrolled
                    ? "text-ink-muted hover:bg-black/[0.04] hover:text-foreground"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                Sign in
              </Link>
            )}
            <Link
              href="/book"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-sm bg-primary px-5 py-3 text-center text-sm font-medium text-primary-foreground"
            >
              Book Now
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
