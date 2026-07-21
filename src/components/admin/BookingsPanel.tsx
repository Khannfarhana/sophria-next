"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, X, UserPlus, Star, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CustomSelect } from "@/components/ui/custom-select";
import { formatDateTime } from "@/lib/datetime";
import { DEFAULT_DRIVER_PAYOUT_RATE } from "@/lib/pricing";
import {
  REJECT_REASONS,
  useAdminBookings,
  useAdminDrivers,
  useAdminActions,
  type AdminBooking,
  type AdminDriver,
} from "./admin-data";
import { StatusDot, PaymentChip, isPaymentSecured, inputDark, btnPrimary, btnGhost } from "./ui";

const FILTERS = [
  { v: "all", l: "All" },
  { v: "pending", l: "Pending" },
  { v: "confirmed", l: "Confirmed" },
  { v: "driver_assigned", l: "Assigned" },
  { v: "accepted", l: "Accepted" },
  { v: "in_progress", l: "In progress" },
  { v: "completed", l: "Completed" },
  { v: "cancelled", l: "Cancelled" },
  { v: "rejected", l: "Rejected" },
];

const dialogCls = "bg-night-panel border border-white/10 text-white";

/**
 * The bookings work surface: status filter chips, the booking list, and the
 * confirm / reject / re-fare / assign flows. Lives on /admin/bookings; the
 * overview page links here for anything beyond a one-click confirm.
 */
export function BookingsPanel({ initialFilter = "all" }: { initialFilter?: string }) {
  const [filter, setFilter] = useState<string>(
    FILTERS.some((f) => f.v === initialFilter) ? initialFilter : "all",
  );
  const { data: bookings } = useAdminBookings(filter);
  const { data: drivers } = useAdminDrivers();
  const { confirmBooking, rejectBooking, updateFare, assignDriver } = useAdminActions();

  const [rejectFor, setRejectFor] = useState<AdminBooking | null>(null);
  const [rejReason, setRejReason] = useState<string>("no_drivers");
  const [rejNotes, setRejNotes] = useState<string>("");
  const [assignFor, setAssignFor] = useState<AdminBooking | null>(null);
  // Payout-config step inside the assign dialog: which driver was picked,
  // plus linked %/$ inputs (editing one recomputes the other from the fare).
  const [payoutDriver, setPayoutDriver] = useState<AdminDriver | null>(null);
  const [payoutPct, setPayoutPct] = useState("");
  const [payoutAmt, setPayoutAmt] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [fareFor, setFareFor] = useState<AdminBooking | null>(null);
  const [fareValue, setFareValue] = useState("");
  const [fareReason, setFareReason] = useState("");
  const [savingFare, setSavingFare] = useState(false);

  const openFareEditor = (b: AdminBooking) => {
    setFareFor(b);
    setFareValue(Number(b.fare_estimate).toFixed(2));
    setFareReason("");
  };

  const submitReject = async () => {
    if (!rejectFor) return;
    try {
      await rejectBooking(rejectFor, rejReason, rejNotes || null);
      setRejectFor(null);
      setRejNotes("");
      setRejReason("no_drivers");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject booking");
    }
  };

  const submitFare = async () => {
    if (!fareFor) return;
    const amount = Number(fareValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid fare amount");
      return;
    }
    if (!fareReason.trim()) {
      toast.error("Add a reason — it's included in the customer's email");
      return;
    }
    setSavingFare(true);
    try {
      await updateFare(fareFor, amount, fareReason.trim());
      setFareFor(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update fare");
    } finally {
      setSavingFare(false);
    }
  };

  const openPayoutConfig = (d: AdminDriver) => {
    if (!assignFor) return;
    const fare = Number(assignFor.fare_estimate);
    const pct = Math.round(Number(d.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100);
    setPayoutDriver(d);
    setPayoutPct(String(pct));
    setPayoutAmt(((fare * pct) / 100).toFixed(2));
  };

  const onPayoutPct = (v: string) => {
    const clean = v.replace(/[^\d.]/g, "").slice(0, 5);
    setPayoutPct(clean);
    const fare = Number(assignFor?.fare_estimate ?? 0);
    const pct = Number(clean);
    if (Number.isFinite(pct) && fare > 0) setPayoutAmt(((fare * pct) / 100).toFixed(2));
  };

  const onPayoutAmt = (v: string) => {
    const clean = v.replace(/[^\d.]/g, "").slice(0, 8);
    setPayoutAmt(clean);
    const fare = Number(assignFor?.fare_estimate ?? 0);
    const amt = Number(clean);
    if (Number.isFinite(amt) && fare > 0) setPayoutPct(((amt / fare) * 100).toFixed(1).replace(/\.0$/, ""));
  };

  const closeAssignDialog = () => {
    setAssignFor(null);
    setPayoutDriver(null);
  };

  const submitAssign = async () => {
    if (!assignFor || !payoutDriver) return;
    const payout = Number(payoutAmt);
    if (!Number.isFinite(payout) || payout < 0) {
      toast.error("Enter a valid driver payout");
      return;
    }
    setAssigning(true);
    try {
      await assignDriver(assignFor, payoutDriver.id, payout);
      closeAssignDialog();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign driver");
    } finally {
      setAssigning(false);
    }
  };

  const availableDrivers = (drivers ?? [])
    .filter((d) => d.is_verified && d.is_available)
    .sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));

  const rowAction = (b: AdminBooking) => {
    if (b.status === "pending") {
      return (
        <div className="flex justify-end gap-2">
          <button onClick={() => confirmBooking(b)} className="inline-flex cursor-pointer items-center gap-1 rounded-sm bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gold-soft">
            <Check className="h-3 w-3" /> Confirm
          </button>
          <button onClick={() => setRejectFor(b)} className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-white/25 px-3 py-1.5 text-xs font-medium text-white transition hover:border-gold hover:text-gold-soft">
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
      );
    }
    // "authorized" (card hold) counts as secured — the server accepts assignment
    // for both, and capture only happens at ride completion.
    if (b.status === "confirmed" && !isPaymentSecured(b.payment_status)) {
      return <span className="text-xs text-white/45">Awaiting payment</span>;
    }
    if (b.status === "confirmed" || b.status === "driver_assigned" || b.status === "accepted") {
      return (
        <button onClick={() => setAssignFor(b)} className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-white/25 px-3 py-1.5 text-xs font-medium text-white transition hover:border-gold hover:text-gold-soft">
          <UserPlus className="h-3 w-3" /> {b.driver_id ? "Reassign" : "Assign driver"}
        </button>
      );
    }
    if (b.status === "rejected" && b.rejection_reason) {
      return <span className="text-xs text-white/45">{REJECT_REASONS.find((r) => r.v === b.rejection_reason)?.l ?? b.rejection_reason}</span>;
    }
    return null;
  };

  const fareCell = (b: AdminBooking) => (
    <>
      {["pending", "confirmed"].includes(b.status) && b.payment_status === "pending" ? (
        <button
          onClick={() => openFareEditor(b)}
          title="Change fare"
          className="group/fare inline-flex cursor-pointer items-center gap-1.5 font-medium text-white hover:text-gold-soft"
        >
          ${Number(b.fare_estimate).toFixed(2)}
          <Pencil className="h-3 w-3 text-white/40 group-hover/fare:text-gold-soft" />
        </button>
      ) : (
        <div className="font-medium text-white">${Number(b.fare_estimate).toFixed(2)}</div>
      )}
      {b.driver_payout != null && (
        <div className="text-xs text-white/45">pay ${Number(b.driver_payout).toFixed(2)}</div>
      )}
      {Number(b.tip ?? 0) > 0 && (
        <div className="text-xs text-gold-soft">tip ${Number(b.tip).toFixed(2)}</div>
      )}
    </>
  );

  return (
    <>
      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`shrink-0 cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              filter === f.v ? "bg-white text-black" : "bg-white/[0.06] text-white/60 hover:text-white"
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="mt-4 space-y-3 md:hidden">
        {(bookings ?? []).map((b) => (
          <div key={b.id} className="rounded-sm bg-night-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-xs text-white/45">{b.reference}</div>
                <div className="mt-0.5 truncate text-sm font-medium text-white">{b.customer?.full_name || b.passenger_name || "—"}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusDot status={b.status} />
                <PaymentChip b={b} />
              </div>
            </div>
            <div className="mt-3 space-y-1 text-sm text-white/70">
              <div className="truncate">{b.pickup_location} → {b.dropoff_location}</div>
              <div className="text-xs text-white/45">{formatDateTime(b.pickup_datetime)}</div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
              <span className="text-white/60">{b.vehicles?.name ?? "—"} · {b.driver?.profile?.full_name ?? "Unassigned"}</span>
              <span className="text-right">{fareCell(b)}</span>
            </div>
            {(b.status === "pending" || b.status === "confirmed" || b.status === "driver_assigned" || b.status === "accepted") && (
              <div className="mt-3 flex justify-end gap-2">{rowAction(b)}</div>
            )}
          </div>
        ))}
        {(!bookings || bookings.length === 0) && (
          <div className="rounded-sm bg-night-card p-8 text-center text-white/50">No bookings match this filter.</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-hidden rounded-sm bg-night-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wider text-white/50">
              <tr>
                <th className="p-3">Booking</th>
                <th className="p-3">Pickup</th>
                <th className="p-3">Route</th>
                <th className="p-3">Driver · Vehicle</th>
                <th className="p-3">Fare</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(bookings ?? []).map((b) => (
                <tr key={b.id} className="border-b border-white/10 text-white last:border-0 hover:bg-white/[0.03]">
                  <td className="p-3">
                    <div className="font-medium">{b.customer?.full_name || b.passenger_name || "—"}</div>
                    <div className="font-mono text-xs text-white/40">{b.reference}</div>
                  </td>
                  <td className="p-3 text-white/70">{formatDateTime(b.pickup_datetime)}</td>
                  <td className="max-w-[260px] p-3 text-white/70">
                    <div className="truncate">{b.pickup_location}</div>
                    <div className="truncate text-white/45">→ {b.dropoff_location}</div>
                  </td>
                  <td className="p-3 text-white/70">
                    <div>{b.driver?.profile?.full_name ?? <span className="text-white/40">Unassigned</span>}</div>
                    <div className="text-xs text-white/45">{b.vehicles?.name ?? "—"}</div>
                  </td>
                  <td className="p-3">{fareCell(b)}</td>
                  <td className="p-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <StatusDot status={b.status} />
                      <PaymentChip b={b} />
                    </div>
                  </td>
                  <td className="p-3 text-right">{rowAction(b)}</td>
                </tr>
              ))}
              {(!bookings || bookings.length === 0) && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-white/50">No bookings match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-white">Reject booking {rejectFor?.reference}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">Reason</label>
              <CustomSelect value={rejReason} onChange={(e) => setRejReason(e.target.value)}>
                {REJECT_REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </CustomSelect>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">Notes (optional)</label>
              <textarea
                value={rejNotes}
                onChange={(e) => setRejNotes(e.target.value)}
                rows={3}
                className={inputDark}
                placeholder="Anything the customer should know…"
              />
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <button onClick={() => setRejectFor(null)} className={btnGhost}>Cancel</button>
            <button onClick={submitReject} className={btnPrimary}>Reject booking</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change fare dialog */}
      <Dialog open={!!fareFor} onOpenChange={(o) => !o && setFareFor(null)}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-white">Change fare — {fareFor?.reference}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-xs text-white/60">
              {fareFor?.pickup_location} → {fareFor?.dropoff_location}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">
                New fare (current ${fareFor ? Number(fareFor.fare_estimate).toFixed(2) : "—"})
              </label>
              <div className="flex items-center gap-2 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2">
                <span className="text-sm text-white/60">$</span>
                <input
                  value={fareValue}
                  onChange={(e) => setFareValue(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  className="w-full bg-transparent text-sm text-white focus:outline-none"
                  aria-label="New fare in CAD"
                />
                <span className="text-xs text-white/45">CAD</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">Reason (sent to the customer)</label>
              <textarea
                value={fareReason}
                onChange={(e) => setFareReason(e.target.value)}
                rows={3}
                className={inputDark}
                placeholder="e.g. Route updated to include a second pickup; extra waiting time at request…"
              />
            </div>
            <p className="text-xs text-white/45">
              No separate email is sent — the change and this reason appear in the payment-request email. Awaiting-payment bookings get that email again immediately (and any open payment page is cancelled); pending bookings see it when you confirm.
            </p>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <button onClick={() => setFareFor(null)} className={btnGhost}>Cancel</button>
            <button onClick={submitFare} disabled={savingFare} className={btnPrimary}>
              {savingFare ? "Saving…" : "Update fare & notify"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign driver dialog */}
      <Dialog open={!!assignFor} onOpenChange={(o) => !o && closeAssignDialog()}>
        <DialogContent className={`max-w-2xl ${dialogCls}`}>
          <DialogHeader>
            <DialogTitle className="text-white">
              {payoutDriver ? `Driver payout — ${assignFor?.reference}` : `Assign driver — ${assignFor?.reference}`}
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-white/60">
            Pickup: {assignFor?.pickup_location} · {assignFor && formatDateTime(assignFor.pickup_datetime)}
          </div>

          {payoutDriver ? (
            /* Step 2 — configure this ride's payout, then assign */
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3 rounded-sm bg-white/5 p-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-medium text-white">
                  {(payoutDriver.profile?.full_name ?? "D").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{payoutDriver.profile?.full_name ?? "Driver"}</div>
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-gold" />{Number(payoutDriver.rating).toFixed(2)}</span>
                    <span>· {payoutDriver.experience_years}y exp</span>
                    <span>· default {Math.round(Number(payoutDriver.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100)}%</span>
                  </div>
                </div>
                <div className="ml-auto shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-white/45">Customer fare</div>
                  <div className="text-sm font-medium text-white">${Number(assignFor?.fare_estimate ?? 0).toFixed(2)}</div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">Commission</label>
                  <div className="flex items-center gap-2 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2">
                    <input
                      value={payoutPct}
                      onChange={(e) => onPayoutPct(e.target.value)}
                      inputMode="decimal"
                      className="w-full bg-transparent text-sm text-white focus:outline-none"
                      aria-label="Commission percentage for this ride"
                    />
                    <span className="text-xs text-white/45">% of fare</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">Driver payout</label>
                  <div className="flex items-center gap-2 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2">
                    <span className="text-sm text-white/60">$</span>
                    <input
                      value={payoutAmt}
                      onChange={(e) => onPayoutAmt(e.target.value)}
                      inputMode="decimal"
                      className="w-full bg-transparent text-sm text-white focus:outline-none"
                      aria-label="Driver payout in CAD for this ride"
                    />
                    <span className="text-xs text-white/45">CAD</span>
                  </div>
                </div>
              </div>

              {Number(payoutAmt) > Number(assignFor?.fare_estimate ?? 0) && (
                <p className="text-xs font-medium text-amber-400">Heads up — this payout exceeds the customer fare.</p>
              )}
              <p className="text-xs text-white/45">
                Applies to this ride only and is locked in when you assign. The driver&apos;s default commission is unchanged — edit that from their profile on the Drivers page.
              </p>
            </div>
          ) : (
            /* Step 1 — pick a driver */
            <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-sm border border-white/10">
              {availableDrivers.length === 0 ? (
                <div className="p-8 text-center text-sm text-white/60">No verified, available drivers right now.</div>
              ) : (
                <ul className="divide-y divide-white/10">
                  {availableDrivers.map((d) => {
                    const isCurrent = d.id === assignFor?.driver_id;
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 p-3 hover:bg-white/[0.03]">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-medium text-white">
                            {(d.profile?.full_name ?? "D").slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white">{d.profile?.full_name ?? "Driver"}</div>
                            <div className="flex items-center gap-2 text-xs text-white/60">
                              <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-gold" />{Number(d.rating).toFixed(2)}</span>
                              <span>· {d.experience_years}y exp</span>
                              <span>· {Math.round(Number(d.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100)}%</span>
                            </div>
                            {d.profile?.email && <div className="mt-0.5 truncate text-xs text-white/45">{d.profile.email}</div>}
                          </div>
                        </div>
                        <button
                          onClick={() => openPayoutConfig(d)}
                          disabled={isCurrent}
                          className="shrink-0 cursor-pointer rounded-sm bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gold-soft disabled:opacity-50"
                        >
                          {isCurrent ? "Current" : "Assign"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            {payoutDriver ? (
              <>
                <button onClick={() => setPayoutDriver(null)} disabled={assigning} className={btnGhost}>Back</button>
                <button onClick={submitAssign} disabled={assigning} className={btnPrimary}>
                  {assigning ? "Assigning…" : `Assign · payout $${(Number(payoutAmt) || 0).toFixed(2)}`}
                </button>
              </>
            ) : (
              <button onClick={closeAssignDialog} className={btnGhost}>Close</button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
