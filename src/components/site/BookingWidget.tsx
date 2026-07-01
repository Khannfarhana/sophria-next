"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Calendar, Car, Clock, Plane } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { TripTypeToggle } from "@/components/site/TripTypeToggle";
import { HOURLY_MIN_HOURS, type TripType } from "@/lib/pricing";

export function BookingWidget() {
  const router = useRouter();
  const [tripType, setTripType] = useState<TripType>("one_way");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [datetime, setDatetime] = useState("");
  const [vehicle, setVehicle] = useState("sedan");
  const [duration, setDuration] = useState(HOURLY_MIN_HOURS);
  const [flight, setFlight] = useState("");

  const cell =
    "flex items-center gap-3 border-b border-border pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-4";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ tripType, pickup, datetime, vehicle });
    if (tripType === "hourly") params.set("duration", String(duration));
    else params.set("dropoff", dropoff);
    if (tripType === "airport") params.set("flight", flight);
    router.push(`/book?q=${encodeURIComponent(params.toString())}`);
  };

  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <TripTypeToggle value={tripType} onChange={setTripType} className="mb-4" />

      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        {/* Pickup — always */}
        <label className={`${cell} md:flex-1 md:min-w-[180px]`}>
          <MapPin className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="Pickup location"
            className="w-full bg-transparent text-sm placeholder:text-ink-soft focus:outline-none"
            required
          />
        </label>

        {/* Drop-off (one-way / airport) OR Duration (hourly) */}
        {tripType === "hourly" ? (
          <label className={`${cell} md:min-w-[150px]`}>
            <Clock className="h-4 w-4 shrink-0 text-ink-muted" />
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full cursor-pointer bg-transparent text-sm text-foreground focus:outline-none"
            >
              {Array.from({ length: 11 }, (_, i) => i + HOURLY_MIN_HOURS).map((h) => (
                <option key={h} value={h}>{h} hours</option>
              ))}
            </select>
          </label>
        ) : (
          <label className={`${cell} md:flex-1 md:min-w-[180px]`}>
            <MapPin className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              placeholder={tripType === "airport" ? "Airport / address" : "Drop-off location"}
              className="w-full bg-transparent text-sm placeholder:text-ink-soft focus:outline-none"
              required
            />
          </label>
        )}

        {/* Flight number — airport only */}
        {tripType === "airport" && (
          <label className={`${cell} md:min-w-[130px]`}>
            <Plane className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              value={flight}
              onChange={(e) => setFlight(e.target.value)}
              placeholder="Flight no."
              className="w-full bg-transparent text-sm placeholder:text-ink-soft focus:outline-none"
            />
          </label>
        )}

        {/* Date & time — always */}
        <label className={`${cell} md:min-w-[180px]`}>
          <Calendar className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            type="datetime-local"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
            className="w-full bg-transparent text-sm focus:outline-none"
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

        <button className="rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A] cursor-pointer">
          View Options
        </button>
      </form>
    </div>
  );
}
