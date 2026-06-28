"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Calendar, Car } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";

export function BookingWidget() {
  const router = useRouter();
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [datetime, setDatetime] = useState("");
  const [vehicle, setVehicle] = useState("sedan");

  return (
    <form
      onSubmit={(e) => {
      e.preventDefault();
      const params = new URLSearchParams({ pickup, dropoff, datetime, vehicle });
      router.push(`/book?q=${encodeURIComponent(params.toString())}`);
      }}
      className="grid gap-3 rounded-sm border border-border bg-card p-5 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
    >
      <label className="flex items-center gap-3 border-b border-border pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
        <MapPin className="h-4 w-4 text-ink-muted" />
        <input
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          placeholder="Pickup location"
          className="w-full bg-transparent text-sm placeholder:text-ink-soft focus:outline-none"
          required
        />
      </label>
      <label className="flex items-center gap-3 border-b border-border pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
        <MapPin className="h-4 w-4 text-ink-muted" />
        <input
          value={dropoff}
          onChange={(e) => setDropoff(e.target.value)}
          placeholder="Drop-off location"
          className="w-full bg-transparent text-sm placeholder:text-ink-soft focus:outline-none"
          required
        />
      </label>
      <label className="flex items-center gap-3 border-b border-border pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
        <Calendar className="h-4 w-4 text-ink-muted" />
        <input
          type="datetime-local"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          className="w-full bg-transparent text-sm focus:outline-none"
          required
        />
      </label>
      <label className="flex items-center gap-3 md:border-r md:pr-3">
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
      <button className="rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-[#E5E5E5] cursor-pointer">
        Reserve
      </button>
    </form>
  );
}
