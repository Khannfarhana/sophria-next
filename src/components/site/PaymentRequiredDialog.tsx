"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, Car, CreditCard, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/datetime";
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

  const b = booking;
  if (!b) return null;

  const pay = () =>
    startTransition(async () => {
      try {
        if (SUPABASE_ENABLED) {
          const { url } = await createCheckoutSessionAction(b.id);
          window.location.href = url; // hosted Stripe Checkout
        } else {
          await mockPayBooking(b.id);
          toast.success("Payment recorded");
          onPaid();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start payment");
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden border-white/10 bg-[#0d0d0e] p-0 text-white">
        <DialogHeader className="border-b border-white/10 px-6 py-4">
          <DialogTitle className="font-display text-2xl tracking-wide text-[#e7d3a8]">
            Complete your payment
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5">
          <p className="text-sm text-white/70">
            Your booking <span className="font-mono text-[#e7d3a8]">{b.reference}</span> is
            confirmed. Pay the fare to secure your chauffeur — we&apos;ll assign one as soon as
            payment is received.
          </p>

          <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-[#141416] p-4">
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Pickup</div>
                <div className="truncate text-sm">{b.pickup_location}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c9a76a]" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Drop-off</div>
                <div className="truncate text-sm">{b.dropoff_location}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 border-t border-white/10 pt-3 text-xs text-white/60">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> {formatDateTime(b.pickup_datetime)}
              </span>
              {b.vehicles?.name && (
                <span className="inline-flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5" /> {b.vehicles.name}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-[#141416] px-4 py-3">
            <span className="text-sm text-white/60">Total fare</span>
            <span className="font-display text-2xl text-[#e7d3a8]">
              ${Number(b.fare_estimate).toFixed(2)} <span className="text-sm">CAD</span>
            </span>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={pay}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-sm bg-[#e7d3a8] px-4 py-2.5 text-sm font-medium text-[#0d0d0e] transition hover:bg-[#f0e2c0] disabled:opacity-60 cursor-pointer"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay Now
            </button>
            <button
              onClick={onClose}
              disabled={pending}
              className="rounded-sm border border-white/15 px-4 py-2.5 text-sm text-white/80 transition hover:bg-white/5 disabled:opacity-60 cursor-pointer"
            >
              Later
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] text-white/40">
            Secure payment via Stripe. You&apos;ll be redirected back here after paying.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
