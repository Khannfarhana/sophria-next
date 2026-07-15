"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { BrandMark } from "@/components/site/BrandMark";
import { SITE } from "@/lib/site-config";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/fleet", label: "Fleet" },
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function Navbar({ solid = false }: { solid?: boolean }) {
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

  // Pages without a dark hero (e.g. portals) need the light/solid nav from the top.
  const onLight = solid || isScrolled;

  const portalLink = roles.includes("admin")
    ? { href: "/admin", label: "Admin" }
    : roles.includes("driver")
    ? { href: "/driver", label: "Driver" }
    : { href: "/dashboard", label: "My Bookings" };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 w-full transition-colors duration-500 ${
        onLight ? "border-b border-border bg-background/90 shadow-sm backdrop-blur-md" : ""
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between px-6 transition-all duration-500 ${
          isScrolled ? "py-3" : "py-5"
        }`}
      >
        {/* Wordmark — "Limousine Services" drops below sm so the mark stays
            readable on a phone without losing the full name on desktop. */}
        <Link
          href="/"
          aria-label={`${SITE.fullName} — home`}
          className={`text-2xl transition-colors duration-500 ${
            onLight ? "text-foreground" : "text-white drop-shadow-sm"
          }`}
        >
          <BrandMark full subClassName="hidden text-base sm:inline" />
        </Link>

        {/* Floating pill nav */}
        <nav
          className={`hidden items-center gap-0.5 rounded-full border px-2 py-1.5 backdrop-blur-xl transition-all duration-500 lg:flex ${
            onLight
              ? "border-transparent bg-transparent shadow-none"
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
                  onLight
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
              onLight ? "text-ink-muted hover:text-foreground" : "text-white/70 hover:text-white"
            }`}
          >
            Drive with us
          </Link>
          {user ? (
            <>
              <Link
                href={portalLink.href}
                className={`text-sm transition-colors duration-500 ${
                  onLight ? "text-ink-muted hover:text-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                {portalLink.label}
              </Link>
              <button
                onClick={signOut}
                className={`cursor-pointer text-sm transition-colors duration-500 ${
                  onLight ? "text-ink-muted hover:text-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className={`text-sm transition-colors duration-500 ${
                onLight ? "text-ink-muted hover:text-foreground" : "text-white/70 hover:text-white"
              }`}
            >
              Sign in
            </Link>
          )}
          <Link
            href="/book"
            className={`rounded-sm px-5 py-2 text-sm font-medium shadow-sm transition-all duration-500 ${
              onLight
                ? "bg-primary text-primary-foreground hover:bg-[#2A2A2A]"
                : "bg-white text-black hover:bg-white/90"
            }`}
          >
            Book Now
          </Link>
        </div>

        {/* Mobile toggle */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            className={`transition-colors duration-500 ${onLight ? "text-foreground" : "text-white"}`}
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          className={`mx-4 mt-1 overflow-hidden rounded-2xl border shadow-xl backdrop-blur-2xl lg:hidden ${
            onLight
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
                  onLight
                    ? "text-ink-muted hover:bg-black/[0.04] hover:text-foreground"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className={`my-2 h-px ${onLight ? "bg-border" : "bg-white/10"}`} />
            <Link
              href="/become-chauffeur"
              onClick={() => setOpen(false)}
              className={`rounded-xl px-4 py-2.5 text-sm transition-colors ${
                onLight
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
                    onLight
                      ? "text-ink-muted hover:bg-black/[0.04] hover:text-foreground"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {portalLink.label}
                </Link>
                <button
                  onClick={() => { signOut(); setOpen(false); }}
                  className={`cursor-pointer rounded-xl px-4 py-2.5 text-left text-sm transition-colors ${
                    onLight
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
                  onLight
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
