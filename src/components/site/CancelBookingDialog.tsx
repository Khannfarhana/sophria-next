"use client";

import { useTransition } from "react";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/datetime";
import { refundQuote, CANCELLATION_TIERS } from "@/lib/cancellation";
import type { BookingRow } from "@/components/site/BookingDetailDialog";

/**
 * Confirmation for a cancellation that may cost money.
 *
 * The figures here are computed client-side purely to show the customer what
 * they are agreeing to — cancelBookingAction recomputes the tier server-side
 * against its own clock and that result is what's charged. A stale tab could
 * therefore show a lower penalty than is actually applied, which is why the
 * copy says "may apply" and the ladder is spelled out in full.
 */
export function CancelBookingDialog({
  booking,
  open,
  onClose,
  onConfirm,
}: {
  booking: BookingRow | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  const b = booking;
  if (!b) return null;

  const paid = b.payment_status === "paid";
  const q = refundQuote(b);
  const free = q.rate === 0;

  const confirm = () =>
    startTransition(async () => {
      await onConfirm(b.id);
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-0 overflow-hidden border-white/10 bg-[#0d0d0e] p-0 text-white">
        <DialogHeader className="space-y-0 border-b border-white/10 px-6 py-4 pr-12">
          <DialogTitle className="font-display text-2xl font-normal tracking-wide text-[#e7d3a8]">
            Cancel this ride?
          </DialogTitle>
          <div className="mt-1.5 font-mono text-xs tracking-wide text-white/50">{b.reference}</div>
        </DialogHeader>

        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
            <CalendarClock className="h-3.5 w-3.5" /> Pickup
          </div>
          <div className="mt-1 text-sm">{formatDateTime(b.pickup_datetime)}</div>
        </div>

        {free ? (
          <div className="px-6 py-4 text-sm text-white/70">
            {paid
              ? "This cancellation is free — you'll be refunded in full, including any tip."
              : "This cancellation is free. Nothing has been charged."}
          </div>
        ) : (
          <div className="bg-[#141416] px-6 py-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-[#c9a76a]/30 bg-[#c9a76a]/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#e7d3a8]" />
              <p className="text-xs leading-relaxed text-white/70">
                A <span className="text-[#e7d3a8]">{Math.round(q.rate * 100)}% cancellation fee</span> may apply —
                this ride is inside the {Math.round(q.rate * 100)}% window.
              </p>
            </div>

            {paid && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-sm text-white/60">
                  <span>Paid</span>
                  <span>${q.chargedTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-white/60">
                  <span>Cancellation fee</span>
                  <span className="text-[#e7d3a8]">−${q.penalty.toFixed(2)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Refund to you</span>
                  <span className="font-display text-2xl text-[#e7d3a8]">
                    ${q.refund.toFixed(2)}
                    <span className="ml-1 text-sm text-white/50">CAD</span>
                  </span>
                </div>
                <p className="pt-1 text-[11px] text-white/40">
                  Any tip is refunded in full. Refunds reach your card in 5–10 business days.
                </p>
              </div>
            )}
            {!paid && (
              <p className="mt-3 text-xs text-white/50">
                You haven&apos;t paid for this ride yet, so nothing will be charged.
              </p>
            )}
          </div>
        )}

        <div className="border-t border-white/10 px-6 py-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Cancellation policy</div>
          <ul className="mt-2 space-y-0.5 text-[11px] text-white/45">
            <li>More than 12 hours before pickup — free</li>
            {[...CANCELLATION_TIERS]
              .sort((a, b2) => b2.withinMinutes - a.withinMinutes)
              .map((t) => (
                <li key={t.withinMinutes}>
                  Cancelled {t.label} — {Math.round(t.rate * 100)}% fee
                </li>
              ))}
          </ul>
        </div>

        <div className="border-t border-white/10 px-6 py-5">
          <button
            onClick={confirm}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#e7d3a8] px-4 py-3 text-sm font-medium text-[#0d0d0e] transition hover:bg-[#f0e2c0] disabled:opacity-60 cursor-pointer"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {free || !paid ? "Cancel this ride" : `Cancel and refund $${q.refund.toFixed(2)}`}
          </button>
          <button
            onClick={onClose}
            disabled={pending}
            className="mt-2 inline-flex w-full items-center justify-center rounded-sm border border-white/15 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/5 disabled:opacity-60 cursor-pointer"
          >
            Keep my booking
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
