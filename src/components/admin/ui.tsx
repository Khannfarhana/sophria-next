"use client";

import type { ReactNode } from "react";

/** Card wrapper — the one admin surface style. */
export function Panel({
  title,
  hint,
  badge,
  action,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-sm bg-night-card ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl">{title}</h2>
            {badge}
          </div>
          {action}
        </header>
      )}
      {hint && <p className="px-5 pt-4 text-xs text-white/50">{hint}</p>}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Big number tile with a quiet label — for the overview strip. */
export function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-sm p-5 ${accent ? "bg-gold/10" : "bg-night-card"}`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">{label}</div>
      <div className={`mt-2 font-display text-3xl ${accent ? "text-gold-soft" : "text-white"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-white/45">{sub}</div>}
    </div>
  );
}

/** Count chip, gold = needs attention. */
export function CountChip({ n, tone = "gold" }: { n: number; tone?: "gold" | "dim" }) {
  if (n <= 0) return null;
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        tone === "gold" ? "bg-gold/15 text-gold-soft" : "bg-white/10 text-white/60"
      }`}
    >
      {n}
    </span>
  );
}

const STATUS_META: Record<string, { label: string; dot: string; text?: string }> = {
  pending: { label: "Pending", dot: "bg-gold", text: "text-gold-soft" },
  confirmed: { label: "Confirmed", dot: "bg-white" },
  driver_assigned: { label: "Assigned", dot: "bg-white" },
  accepted: { label: "Accepted", dot: "bg-emerald-400" },
  in_progress: { label: "In progress", dot: "bg-emerald-400" },
  completed: { label: "Completed", dot: "bg-white/40", text: "text-white/50" },
  cancelled: { label: "Cancelled", dot: "bg-white/25", text: "text-white/40" },
  rejected: { label: "Rejected", dot: "bg-red-400", text: "text-white/50" },
};

/** Dot + label — scannable without shouting. */
export function StatusDot({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, dot: "bg-white/40" };
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${m.text ?? "text-white/80"}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

/** True when the customer's funds are secured — paid, or held on the card. */
export function isPaymentSecured(paymentStatus: string) {
  return paymentStatus === "paid" || paymentStatus === "authorized";
}

/** Payment state chip: green paid / green held / gold awaiting. */
export function PaymentChip({ b }: { b: { status: string; payment_status: string; payment_mode?: string | null; balance_due?: number | null; balance_paid_at?: string | null; balance_method?: string | null } }) {
  if (b.payment_status === "paid" && b.payment_mode === "deposit") {
    // Deposit secured; the chauffeur's share may still be outstanding.
    if (!b.balance_paid_at) {
      return (
        <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-medium text-gold-soft">
          Deposit · ${Number(b.balance_due ?? 0).toFixed(0)} due
        </span>
      );
    }
    return (
      <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
        Deposit · balance {b.balance_method === "cash" ? "cash" : "online"}
      </span>
    );
  }
  if (b.payment_status === "paid") {
    return <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">Paid</span>;
  }
  if (b.payment_status === "authorized") {
    // Manual-capture hold — money is secured on the card, captured at ride end.
    return <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">Card held</span>;
  }
  if (b.status === "confirmed" && b.payment_status === "pending") {
    return <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-medium text-gold-soft">Awaiting payment</span>;
  }
  return null;
}

export const inputDark =
  "w-full rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/40 transition focus:border-gold";

export const btnPrimary =
  "cursor-pointer rounded-sm bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gold-soft disabled:opacity-60";

export const btnGhost =
  "cursor-pointer rounded-sm border border-white/25 px-4 py-2 text-sm text-white transition hover:border-gold hover:text-gold-soft disabled:opacity-60";
