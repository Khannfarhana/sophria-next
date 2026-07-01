"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Operations" },
  { href: "/admin/analytics", label: "Analytics" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="mt-6 inline-flex rounded-full border border-border bg-card p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-foreground text-background" : "text-ink-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
