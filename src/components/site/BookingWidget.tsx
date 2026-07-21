"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Calendar, Car, Clock, Plane } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { TripTypeToggle } from "@/components/site/TripTypeToggle";
import { AddressAutocomplete } from "@/components/site/AddressAutocomplete";
import { HOURLY_MIN_HOURS, type TripType } from "@/lib/pricing";
import { minPickupLocalValue } from "@/lib/datetime";
import type { Place } from "@/lib/mapbox";

type Coords = { lng: number; lat: number } | null;

export function BookingWidget() {
  const router = useRouter();
  const [tripType, setTripType] = useState<TripType>("one_way");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupCoords, setPickupCoords] = useState<Coords>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords>(null);
  const [datetime, setDatetime] = useState("");
  const [vehicle, setVehicle] = useState("sedan");
  const [duration, setDuration] = useState(HOURLY_MIN_HOURS);
  const [flight, setFlight] = useState("");

  const cell =
    "relative flex items-center gap-3 border-b border-border pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-4";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ tripType, pickup, datetime, vehicle });
    if (pickupCoords) {
      params.set("pickupLng", String(pickupCoords.lng));
      params.set("pickupLat", String(pickupCoords.lat));
    }
    if (tripType === "hourly") {
      params.set("duration", String(duration));
    } else {
      params.set("dropoff", dropoff);
      if (dropoffCoords) {
        params.set("dropoffLng", String(dropoffCoords.lng));
        params.set("dropoffLat", String(dropoffCoords.lat));
      }
    }
    if (tripType === "airport") params.set("flight", flight);
    router.push(`/book?q=${encodeURIComponent(params.toString())}`);
  };

  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <TripTypeToggle value={tripType} onChange={setTripType} className="mb-4" />

      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        {/* Pickup — always */}
        <div className={`${cell} md:flex-1 md:min-w-[180px]`}>
          <AddressAutocomplete
            value={pickup}
            onChange={(v) => {
              setPickup(v);
              setPickupCoords(null);
            }}
            onSelect={(p: Place) => {
              setPickup(p.address);
              setPickupCoords({ lng: p.lng, lat: p.lat });
            }}
            placeholder="Pickup location"
            leadingIcon={<MapPin className="h-4 w-4 shrink-0 text-ink-muted" />}
            mapInitial={dropoffCoords}
            mapTitle="Choose pickup on map"
            required
          />
        </div>

        {/* Drop-off (one-way / airport) OR Duration (hourly) */}
        {tripType === "hourly" ? (
          <label className={`${cell} md:min-w-[150px]`}>
            <Clock className="h-4 w-4 shrink-0 text-ink-muted" />
            <CustomSelect
              variant="ghost"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              wrapperClassName="w-full"
            >
              {Array.from({ length: 11 }, (_, i) => i + HOURLY_MIN_HOURS).map((h) => (
                <option key={h} value={h}>{h} hours</option>
              ))}
            </CustomSelect>
          </label>
        ) : (
          <div className={`${cell} md:flex-1 md:min-w-[180px]`}>
            <AddressAutocomplete
              value={dropoff}
              onChange={(v) => {
                setDropoff(v);
                setDropoffCoords(null);
              }}
              onSelect={(p: Place) => {
                setDropoff(p.address);
                setDropoffCoords({ lng: p.lng, lat: p.lat });
              }}
              placeholder={tripType === "airport" ? "Airport / address" : "Drop-off location"}
              leadingIcon={<MapPin className="h-4 w-4 shrink-0 text-ink-muted" />}
              mapInitial={pickupCoords}
              mapTitle="Choose drop-off on map"
              required
            />
          </div>
        )}

        {/* Flight number — airport only */}
        {tripType === "airport" && (
          <label className={`${cell} md:min-w-[130px]`}>
            <Plane className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              value={flight}
              onChange={(e) => setFlight(e.target.value)}
              placeholder="Flight no."
              className="w-full bg-transparent text-sm placeholder:text-ink-soft"
            />
          </label>
        )}

        {/* Date & time — always */}
        <label className={`${cell} md:min-w-[180px]`}>
          <Calendar className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            type="datetime-local"
            value={datetime}
            min={minPickupLocalValue()}
            onChange={(e) => setDatetime(e.target.value)}
            className="w-full bg-transparent text-sm"
            required
          />
        </label>

        {/* Vehicle — always */}
        <label className="flex items-center gap-3 md:border-r md:pr-4 md:min-w-[150px]">
          <Car className="h-4 w-4 shrink-0 text-ink-muted" />
          <CustomSelect
            variant="ghost"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            wrapperClassName="w-full"
          >
            <option value="sedan">Luxury Sedan</option>
            <option value="business">Business Class</option>
            <option value="suv">SUV</option>
            <option value="limousine">Limousine</option>
            <option value="party_bus">Party Bus</option>
          </CustomSelect>
        </label>

        <button className="rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover cursor-pointer">
          See Prices
        </button>
      </form>
    </div>
  );
}
