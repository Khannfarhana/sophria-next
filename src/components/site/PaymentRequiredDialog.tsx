"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, Car, CreditCard, HandCoins, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime, pickupInstant } from "@/lib/datetime";
import { canHoldUntil } from "@/lib/payment-window";
import { DEFAULT_TIP_RATE, round2, suggestedTip } from "@/lib/pricing";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { createCheckoutSessionAction } from "@/lib/payment-actions";
import { mockPayBooking } from "@/lib/mock-db/actions";
import type { BookingRow } from "@/components/site/BookingDetailDialog";

/**
 * Shown when a booking is confirmed but unpaid: the customer must pay the
 * full fare (Stripe-hosted Checkout) before dispatch assigns a chauffeur.
 */
export function PaymentRequiredDialog({
  booking,
  open,
  onClose,
  onPaid,
}: {
  booking: BookingRow | null;
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [pending, startTransition] = useTransition();
  // Driver tip: a percentage of the pre-tax fare, or "custom" dollars. Tipping
  // is a strong expectation in this market, so DEFAULT_TIP_RATE is preselected
  // rather than "no tip" — the customer can still lower or clear it. The custom
  // input strips everything but digits and a dot, so it can never go negative;
  // the server and the DB check-constraint enforce tip >= 0 regardless.
  const [tipChoice, setTipChoice] = useState<number | "custom">(DEFAULT_TIP_RATE);
  const [customTip, setCustomTip] = useState("");

  const b = booking;
  if (!b) return null;

  // Whether this booking's funds will be held rather than taken. Mirrors the
  // server's decision (createCheckoutSessionAction) so the button doesn't
  // promise the wrong thing; the server is authoritative either way.
  const willHold = canHoldUntil(pickupInstant(b.pickup_datetime).getTime());

  // fare_estimate is the pre-tax subtotal; HST is charged on top of it.
  const fare = Number(b.fare_estimate);
  const tax = Number(b.tax_amount ?? 0);
  const tip =
    tipChoice === "custom"
      ? (Number.isFinite(Number(customTip)) && Number(customTip) > 0 ? round2(Number(customTip)) : 0)
      : suggestedTip(fare, tipChoice);
  const total = fare + tax + tip;

  const pay = () =>
    startTransition(async () => {
      try {
        if (SUPABASE_ENABLED) {
          const { url } = await createCheckoutSessionAction(b.id, tip);
          window.location.href = url; // hosted Stripe Checkout
        } else {
          await mockPayBooking(b.id, tip);
          toast.success("Payment recorded");
          onPaid();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start payment");
      }
    });

  const TIP_PRESETS: { label: string; value: number | "custom" }[] = [
    { label: "15%", value: 0.15 },
    { label: "18%", value: 0.18 },
    { label: "20%", value: 0.2 },
    { label: "Custom", value: "custom" },
    { label: "No tip", value: 0 },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-0 overflow-hidden border-white/10 bg-night p-0 text-white">
        {/* Header */}
        <DialogHeader className="space-y-0 border-b border-white/10 px-6 py-4 pr-12">
          <DialogTitle className="font-display text-2xl font-normal tracking-wide text-gold-soft">
            Complete your payment
          </DialogTitle>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs tracking-wide text-white/50">{b.reference}</span>
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] text-gold-soft">
              Confirmed — awaiting payment
            </span>
          </div>
        </DialogHeader>

        {/* Route */}
        <div className="min-w-0 border-b border-white/10 px-6 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Pickup</div>
              <div className="break-words text-sm leading-snug">{b.pickup_location}</div>
            </div>
          </div>
          <div className="ml-[3px] my-1.5 h-3 w-px bg-white/15" />
          <div className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Drop-off</div>
              <div className="break-words text-sm leading-snug">{b.dropoff_location}</div>
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="grid min-w-0 grid-cols-2 gap-px border-b border-white/10 bg-white/10">
          <div className="min-w-0 bg-night px-6 py-3.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
              <CalendarClock className="h-3.5 w-3.5" /> Date &amp; time
            </div>
            <div className="mt-1 break-words text-sm">{formatDateTime(b.pickup_datetime)}</div>
          </div>
          <div className="min-w-0 bg-night px-6 py-3.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
              <Car className="h-3.5 w-3.5" /> Vehicle
            </div>
            <div className="mt-1 break-words text-sm">{b.vehicles?.name ?? "—"}</div>
          </div>
        </div>

        {/* Tip */}
        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
            <HandCoins className="h-3.5 w-3.5" /> Add a tip for your chauffeur
          </div>
          <p className="mt-1 text-xs text-white/40">
            Calculated on the pre-tax fare. 100% goes directly to your driver.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TIP_PRESETS.map((t) => (
              <button
                key={t.label}
                onClick={() => setTipChoice(t.value)}
                disabled={pending}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                  tipChoice === t.value
                    ? "bg-gold-soft text-night"
                    : "border border-white/15 text-white/70 hover:bg-white/5"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tipChoice === "custom" && (
            <div className="mt-3 flex w-40 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2">
              <span className="text-sm text-white/50">$</span>
              <input
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                aria-label="Custom tip amount in CAD"
              />
              <span className="text-xs text-white/40">CAD</span>
            </div>
          )}
        </div>

        {/* Fare + total */}
        <div className="bg-night-panel px-6 py-4">
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>Fare</span>
            <span>${fare.toFixed(2)}</span>
          </div>
          {tax > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm text-white/60">
              <span>HST (13%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
          )}
          {tip > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm text-white/60">
              <span>Driver tip</span>
              <span>${tip.toFixed(2)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Total</div>
              <div className="mt-0.5 text-xs text-white/50">
                {willHold ? "Held now, charged after your ride" : "Charged now to secure your chauffeur"}
              </div>
            </div>
            <div className="shrink-0 font-display text-3xl text-gold-soft">
              ${total.toFixed(2)}
              <span className="ml-1 text-sm text-white/50">CAD</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-white/10 px-6 py-5">
          <button
            onClick={pay}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-gold-soft px-4 py-3 text-sm font-medium text-night transition hover:bg-[#f0e2c0] disabled:opacity-60 cursor-pointer"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {willHold ? `Hold $${total.toFixed(2)}` : `Pay $${total.toFixed(2)} now`}
          </button>
          <button
            onClick={onClose}
            disabled={pending}
            className="mt-2 inline-flex w-full items-center justify-center rounded-sm border border-white/15 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/5 disabled:opacity-60 cursor-pointer"
          >
            Pay later
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/40">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Secure payment via Stripe — you&apos;ll be redirected back here after paying.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
