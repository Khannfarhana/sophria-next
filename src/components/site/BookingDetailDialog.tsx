"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { MapPin, Users, Pencil, X, Check, Loader2, Plane, CalendarClock, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RideMap } from "@/components/site/RideMap";
import { AddressAutocomplete } from "@/components/site/AddressAutocomplete";
import { StatusBadge } from "@/components/site/StatusBadge";
import { getDirections, type Place } from "@/lib/mapbox";
import { formatDateTime } from "@/lib/datetime";
import { priceBreakdown, tripTypeLabel, HOURLY_MIN_HOURS, type TripType } from "@/lib/pricing";
import { resolvePearsonTariff } from "@/lib/tariff";
import { VEHICLE_IMAGES } from "@/lib/vehicles";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { updateBookingLocationAction, getBookingDriverAction, getBookingOtpAction } from "@/lib/actions";
import { mockUpdateBookingLocation, mockBookingDriver, mockBookingOtp } from "@/lib/mock-db/actions";

type DriverInfo = { name: string | null; phone: string | null; rating: number | string | null; experience_years: number | null };

type Coords = { lng: number; lat: number } | null;

// Loose shape — the dashboard passes a Supabase/mock booking row + joined vehicle.
export interface BookingRow {
  id: string;
  reference: string;
  status: string;
  payment_status?: string;
  trip_type: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  distance_km: number | null;
  duration_min: number | null;
  pickup_datetime: string;
  duration_hours: number | null;
  flight_number: string | null;
  /** Pre-tax subtotal (markup + airport fee included). HST rides on top. */
  fare_estimate: number;
  airport_fee?: number | null;
  tax_amount?: number | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  driver_id?: string | null;
  rejection_reason?: string | null;
  rejection_notes?: string | null;
  vehicles?: { name?: string | null; type?: string | null; base_rate?: number | string | null; hourly_rate?: number | string | null } | null;
}

const EDITABLE = new Set(["pending", "confirmed"]);

export function BookingDetailDialog({
  booking,
  open,
  onClose,
  onUpdated,
}: {
  booking: BookingRow | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupCoords, setPickupCoords] = useState<Coords>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [otp, setOtp] = useState<string | null>(null);

  const b = booking;

  // Reset editing state whenever a DIFFERENT booking is opened. Keyed on the id
  // (a stable primitive) so it runs once per booking — never mid-edit, and never
  // loops on new object identities the way a render-phase setState would.
  useEffect(() => {
    setEditing(false);
    setPickup(b?.pickup_location ?? "");
    setDropoff(b?.dropoff_location ?? "");
    setPickupCoords(b?.pickup_lng != null && b?.pickup_lat != null ? { lng: b.pickup_lng, lat: b.pickup_lat } : null);
    setDropoffCoords(b?.dropoff_lng != null && b?.dropoff_lat != null ? { lng: b.dropoff_lng, lat: b.dropoff_lat } : null);
    setDistanceKm(b?.distance_km ?? null);
    setDurationMin(b?.duration_min ?? null);
    setDriverInfo(null);
    setOtp(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id]);

  const tripType = (b?.trip_type as TripType) ?? "one_way";
  const isHourly = tripType === "hourly";
  const canEdit = !!b && EDITABLE.has(b.status);

  // Fetch assigned-driver details (via an ownership-checked server action).
  useEffect(() => {
    if (!open || !b?.id || !b?.driver_id) return;
    let cancelled = false;
    const load = SUPABASE_ENABLED ? getBookingDriverAction(b.id) : mockBookingDriver(b.id);
    load.then((info) => { if (!cancelled) setDriverInfo(info); }).catch(() => { if (!cancelled) setDriverInfo(null); });
    return () => { cancelled = true; };
  }, [open, b?.id, b?.driver_id]);

  // Fetch the pickup code (start_otp isn't client-readable; owner-only action).
  useEffect(() => {
    if (!open || !b?.id) return;
    let cancelled = false;
    const load = SUPABASE_ENABLED ? getBookingOtpAction(b.id) : mockBookingOtp(b.id);
    load.then((code) => { if (!cancelled) setOtp(code); }).catch(() => { if (!cancelled) setOtp(null); });
    return () => { cancelled = true; };
  }, [open, b?.id, b?.status]);

  // Recompute distance while editing when both endpoints have coordinates.
  useEffect(() => {
    if (!editing || isHourly || !pickupCoords || !dropoffCoords) return;
    let cancelled = false;
    getDirections(pickupCoords, dropoffCoords).then((dir) => {
      if (cancelled || !dir) return;
      setDistanceKm(dir.distanceKm);
      setDurationMin(dir.durationMin);
    });
    return () => { cancelled = true; };
  }, [editing, isHourly, pickupCoords, dropoffCoords]);

  if (!b) return null;

  const vehicleRates = b.vehicles?.base_rate != null
    ? { base_rate: b.vehicles.base_rate, hourly_rate: b.vehicles.hourly_rate ?? null, type: b.vehicles.type ?? null }
    : null;
  // Pearson airport trips are priced by the official GTAA tariff.
  const editTariff =
    editing && tripType === "airport"
      ? resolvePearsonTariff({
          pickup,
          dropoff,
          pickupCoords: pickupCoords ?? undefined,
          dropoffCoords: dropoffCoords ?? undefined,
          distanceKm,
        })
      : null;
  // Live fare: re-quote from distance when we have vehicle rates, else keep the
  // stored fare. Both are pre-tax subtotals, matching bookings.fare_estimate.
  const liveFare = editing && vehicleRates
    ? priceBreakdown(tripType, vehicleRates, { durationHours: b.duration_hours ?? HOURLY_MIN_HOURS, distanceKm: distanceKm ?? undefined, tariff: editTariff }).subtotal
    : Number(b.fare_estimate);

  const save = async () => {
    if (!pickup || (!isHourly && !dropoff)) {
      toast.error("Add both a pickup and drop-off");
      return;
    }
    setSaving(true);
    try {
      // No fare sent — the server recomputes it from the vehicle's DB rates.
      const payload = {
        pickup,
        dropoff: isHourly ? (b.dropoff_location || "As directed (hourly)") : dropoff,
        pickupLat: pickupCoords?.lat ?? null,
        pickupLng: pickupCoords?.lng ?? null,
        dropoffLat: dropoffCoords?.lat ?? null,
        dropoffLng: dropoffCoords?.lng ?? null,
        distanceKm,
        durationMin,
      };
      if (SUPABASE_ENABLED) await updateBookingLocationAction(b.id, payload);
      else await mockUpdateBookingLocation(b.id, payload);
      toast.success("Booking updated");
      onUpdated();
      setEditing(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update booking");
    } finally {
      setSaving(false);
    }
  };

  const dt = formatDateTime(b.pickup_datetime);
  const vehImg = b.vehicles?.type ? (VEHICLE_IMAGES[b.vehicles.type] ?? VEHICLE_IMAGES.sedan) : VEHICLE_IMAGES.sedan;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden border-white/10 bg-[#0d0d0e] p-0 text-white">
        <DialogHeader className="flex-row items-center justify-between border-b border-white/10 px-6 py-4 space-y-0">
          <div>
            <DialogTitle className="font-display text-2xl tracking-wide text-[#e7d3a8]">{b.reference}</DialogTitle>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={b.status} />
              <span className="rounded-full border border-[#c9a76a]/40 bg-[#c9a76a]/10 px-2.5 py-0.5 text-[11px] text-[#e7d3a8]">
                {tripTypeLabel(tripType)}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* Route map */}
          {!isHourly && pickupCoords && dropoffCoords && (
            <RideMap
              pickup={pickup}
              dropoff={dropoff}
              pickupCoords={pickupCoords}
              dropoffCoords={dropoffCoords}
              height={190}
              className="!rounded-none !border-x-0 !border-t-0 !border-b !border-white/10"
            />
          )}

          {/* Assigned driver */}
          {b.driver_id && driverInfo && (
            <div className="flex items-center gap-4 border-b border-white/10 bg-[#141416] px-6 py-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-medium text-white/80 ring-1 ring-white/15">
                {(driverInfo.name ?? "D").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Your chauffeur</div>
                <div className="truncate text-base">{driverInfo.name ?? "Assigned driver"}</div>
                <div className="mt-0.5 text-xs text-white/55">
                  ★ {Number(driverInfo.rating ?? 5).toFixed(1)}
                  {driverInfo.experience_years != null && <> · {driverInfo.experience_years}y exp</>}
                </div>
                {driverInfo.phone ? (
                  <a href={`tel:${driverInfo.phone}`} className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#e7d3a8] hover:text-white">
                    <Phone className="h-3.5 w-3.5" /> {driverInfo.phone}
                  </a>
                ) : (
                  <div className="mt-1 text-xs text-white/40">No contact number on file</div>
                )}
              </div>
              {driverInfo.phone && (
                <a
                  href={`tel:${driverInfo.phone}`}
                  aria-label="Call driver"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e7d3a8] text-[#0d0d0e] transition hover:bg-[#f0e2c0]"
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

          {/* Pickup code */}
          {otp && !["completed", "cancelled", "rejected"].includes(b.status) && (
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Pickup code</div>
                <div className="mt-0.5 text-xs text-white/55">Share with your driver to start the ride</div>
              </div>
              <div className="font-mono text-2xl tracking-[0.3em] text-[#e7d3a8]">{otp}</div>
            </div>
          )}

          {/* Route (view or edit) */}
          <div className="border-b border-white/10 px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">Route</span>
              {canEdit && !editing && (
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs text-[#e7d3a8] hover:text-white">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <AddressAutocomplete
                  value={pickup}
                  onChange={(v) => { setPickup(v); setPickupCoords(null); }}
                  onSelect={(p: Place) => { setPickup(p.address); setPickupCoords({ lng: p.lng, lat: p.lat }); }}
                  placeholder="Pickup location"
                  inputClassName="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#c9a76a] focus:outline-none"
                  mapInitial={dropoffCoords}
                  mapTitle="Choose pickup on map"
                />
                {!isHourly && (
                  <AddressAutocomplete
                    value={dropoff}
                    onChange={(v) => { setDropoff(v); setDropoffCoords(null); }}
                    onSelect={(p: Place) => { setDropoff(p.address); setDropoffCoords({ lng: p.lng, lat: p.lat }); }}
                    placeholder="Drop-off location"
                    inputClassName="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#c9a76a] focus:outline-none"
                    mapInitial={pickupCoords}
                    mapTitle="Choose drop-off on map"
                  />
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-[#e7d3a8] px-4 py-2 text-sm font-medium text-[#0d0d0e] transition hover:bg-[#f0e2c0] disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save changes
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setPickup(b.pickup_location); setDropoff(b.dropoff_location);
                      setPickupCoords(b.pickup_lng != null && b.pickup_lat != null ? { lng: b.pickup_lng, lat: b.pickup_lat } : null);
                      setDropoffCoords(b.dropoff_lng != null && b.dropoff_lat != null ? { lng: b.dropoff_lng, lat: b.dropoff_lat } : null);
                      setDistanceKm(b.distance_km); setDurationMin(b.duration_min);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
                  >
                    <X className="h-4 w-4" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Pickup</div>
                    <div className="text-sm">{pickup || "—"}</div>
                  </div>
                </div>
                {!isHourly && (
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c9a76a]" />
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Drop-off</div>
                      <div className="text-sm">{dropoff || "—"}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vehicle */}
          <div className="flex items-center gap-4 border-b border-white/10 px-6 py-4">
            <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
              <Image src={vehImg} alt={b.vehicles?.name ?? "Vehicle"} fill sizes="80px" className="object-cover" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Vehicle</div>
              <div className="text-base">{b.vehicles?.name ?? "—"}</div>
            </div>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-px bg-white/10">
            <MetaCell icon={<CalendarClock className="h-3.5 w-3.5" />} label="Date & time" value={dt} />
            <MetaCell
              icon={<MapPin className="h-3.5 w-3.5" />}
              label={isHourly ? "Duration" : "Distance"}
              value={
                isHourly
                  ? `${Math.max(HOURLY_MIN_HOURS, b.duration_hours ?? HOURLY_MIN_HOURS)} hours`
                  : distanceKm != null
                  ? `${distanceKm.toFixed(1)} km${durationMin != null ? ` · ${Math.round(durationMin)} min` : ""}`
                  : "—"
              }
            />
            {b.passenger_name && <MetaCell icon={<Users className="h-3.5 w-3.5" />} label="Passenger" value={b.passenger_name} />}
            {tripType === "airport" && b.flight_number && (
              <MetaCell icon={<Plane className="h-3.5 w-3.5" />} label="Flight" value={b.flight_number} />
            )}
          </div>

          {/* Fare */}
          <div className="flex items-center justify-between bg-[#141416] px-6 py-4">
            <span className="text-sm text-white/60">{editing ? "Updated fare" : "Estimated fare"}</span>
            <span className="font-display text-2xl text-[#e7d3a8]">${liveFare.toFixed(2)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#0d0d0e] px-6 py-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
