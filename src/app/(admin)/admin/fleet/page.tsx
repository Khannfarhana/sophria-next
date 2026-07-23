"use client";

import { useState } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Luggage, Plus, Pencil, X } from "lucide-react";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import { inputDark, btnPrimary, btnGhost } from "@/components/admin/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { VEHICLE_CUTOUTS, VEHICLE_LABELS } from "@/lib/vehicles";
import { useAdminVehicles } from "@/components/admin/admin-data";
import { updateVehicleAction, createVehicleAction } from "@/lib/actions";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import { mockUpdateVehicle, mockCreateVehicle } from "@/lib/mock-db/actions";
import type { Database } from "@/integrations/supabase/types";

type VehicleType = Database["public"]["Enums"]["vehicle_type"];

interface VehicleForm {
  name: string;
  type: VehicleType;
  base_rate: string;
  hourly_rate: string;
  /** One-way $/km for this class. Blank = the global rate from Admin → Rates. */
  per_km_rate: string;
  /** Floor for retail quotes. Blank = no minimum. */
  min_fare: string;
  /** Pearson tariff scale (sedan 1.0, SUV 1.3, limo 2.5 …). */
  tariff_multiplier: string;
  capacity: string;
  luggage: string;
  description: string;
  /** The actual vehicles offered in this class ("Cadillac LYRIQ", "Lexus ES"). */
  models: string[];
  amenities: string[];
}

const EMPTY_FORM: VehicleForm = {
  name: "",
  type: "sedan",
  base_rate: "",
  hourly_rate: "",
  per_km_rate: "",
  min_fare: "",
  tariff_multiplier: "1.0",
  capacity: "3",
  luggage: "2",
  description: "",
  models: [],
  amenities: [],
};

/** Split a stored model line ("Cadillac LYRIQ / Lexus ES") into chips. */
function parseModelLine(line: string | undefined): string[] {
  if (!line) return [];
  return line.split(/\s*[/·]\s*/).map((m) => m.trim()).filter(Boolean);
}

/** Tag-style list editor: type, press Enter (or Add) to add, × to remove. */
function ChipListInput({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [entry, setEntry] = useState("");
  const commit = () => {
    // "/" and "·" are the stored model-line separators — strip them so a chip
    // can't corrupt the round-trip parse on the next edit.
    const v = entry.replace(/[/·]/g, " ").replace(/\s+/g, " ").trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setEntry("");
  };
  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">{label}</span>
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] py-1 pl-3 pr-1.5 text-xs text-white">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="cursor-pointer rounded-full p-0.5 text-white/50 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
          }}
          placeholder={placeholder}
          className={inputDark}
        />
        <button
          type="button"
          onClick={commit}
          disabled={!entry.trim()}
          className="shrink-0 cursor-pointer rounded-sm border border-white/25 px-3 text-sm text-white transition hover:border-gold hover:text-gold-soft disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {hint && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
    </div>
  );
}

export default function AdminFleetPage() {
  return (
    <ProtectedRoute role="admin">
      <Fleet />
    </ProtectedRoute>
  );
}

function Fleet() {
  const { data: vehicles } = useAdminVehicles();
  const qc = useQueryClient();

  // One dialog serves both flows: editingId === "new" → create.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isNew = editingId === "new";

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId("new");
  };

  const openEdit = (v: NonNullable<typeof vehicles>[number]) => {
    const features = v.features ?? [];
    setForm({
      name: v.name,
      type: v.type as VehicleType,
      base_rate: String(v.base_rate),
      hourly_rate: v.hourly_rate != null ? String(v.hourly_rate) : "",
      per_km_rate: v.per_km_rate != null ? String(v.per_km_rate) : "",
      min_fare: v.min_fare != null ? String(v.min_fare) : "",
      tariff_multiplier: v.tariff_multiplier != null ? String(v.tariff_multiplier) : "1.0",
      capacity: String(v.capacity),
      luggage: String(v.luggage),
      description: v.description ?? "",
      models: parseModelLine(features[0]),
      amenities: features.slice(1),
    });
    setEditingId(v.id);
  };

  const set = (k: keyof VehicleForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-vehicles"] });
    // Public fleet + booking pages read these keys.
    qc.invalidateQueries({ queryKey: ["vehicles-book"] });
  };

  const parseForm = () => {
    const base = Number(form.base_rate);
    const hourly = form.hourly_rate.trim() === "" ? null : Number(form.hourly_rate);
    const perKm = form.per_km_rate.trim() === "" ? null : Number(form.per_km_rate);
    const minFare = form.min_fare.trim() === "" ? null : Number(form.min_fare);
    const multiplier = Number(form.tariff_multiplier);
    const capacity = Number(form.capacity);
    const luggage = Number(form.luggage);
    if (!form.name.trim()) throw new Error("Give the class a name.");
    if (!Number.isFinite(base) || base <= 0) throw new Error("Base rate must be a positive amount.");
    if (hourly !== null && (!Number.isFinite(hourly) || hourly <= 0)) throw new Error("Hourly rate must be positive, or left empty.");
    if (perKm !== null && (!Number.isFinite(perKm) || perKm <= 0 || perKm > 50)) throw new Error("Per-km rate must be between $0 and $50, or left empty to use the global rate.");
    if (minFare !== null && (!Number.isFinite(minFare) || minFare < 0)) throw new Error("Minimum fare can't be negative — leave it empty for no floor.");
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10) throw new Error("Tariff multiplier must be between 0 and 10 (sedan is 1.0).");
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Capacity must be at least 1.");
    if (!Number.isInteger(luggage) || luggage < 0) throw new Error("Luggage can't be negative.");
    // Shared convention: features[0] = model line, the rest are amenities.
    // With no models but some amenities, fall back to the class name so an
    // amenity is never misread as the model line.
    const features = form.models.length
      ? [form.models.join(" · "), ...form.amenities]
      : form.amenities.length
      ? [form.name.trim() || "—", ...form.amenities]
      : [];
    return {
      name: form.name.trim(),
      type: form.type,
      base_rate: base,
      hourly_rate: hourly,
      per_km_rate: perKm,
      min_fare: minFare,
      tariff_multiplier: multiplier,
      capacity,
      luggage,
      description: form.description.trim() || null,
      features,
    };
  };

  const save = async () => {
    let payload: ReturnType<typeof parseForm>;
    try {
      payload = parseForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check the form");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        if (SUPABASE_ENABLED) await createVehicleAction(payload);
        else await mockCreateVehicle(payload);
        toast.success(`${payload.name} added to the fleet`);
      } else if (editingId) {
        if (SUPABASE_ENABLED) await updateVehicleAction(editingId, payload);
        else await mockUpdateVehicle(editingId, payload);
        toast.success(`${payload.name} updated`);
      }
      setEditingId(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save vehicle");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (v: NonNullable<typeof vehicles>[number]) => {
    try {
      if (SUPABASE_ENABLED) await updateVehicleAction(v.id, { is_active: !v.is_active });
      else await mockUpdateVehicle(v.id, { is_active: !v.is_active });
      toast.success(`${v.name} is now ${v.is_active ? "inactive — hidden from booking" : "active"}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update vehicle");
    }
  };

  return (
    <AdminShell
      title="Fleet"
      sub="The classes customers can book. Rates here feed the fare engine directly."
      actions={
        <button onClick={openNew} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <Plus className="h-4 w-4" /> Add vehicle
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(vehicles ?? []).map((v) => (
          <div key={v.id} className="group rounded-sm bg-night-card p-5">
            <div className={`relative flex aspect-[16/9] items-center justify-center ${v.is_active ? "" : "opacity-40"}`}>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_60%,rgba(201,167,106,0.10),transparent_70%)]"
              />
              <Image
                src={VEHICLE_CUTOUTS[v.type] ?? VEHICLE_CUTOUTS.sedan}
                alt={v.name}
                sizes="(max-width: 640px) 100vw, 320px"
                className="relative max-h-full w-auto object-contain drop-shadow-[0_18px_16px_rgba(0,0,0,0.5)]"
              />
            </div>
            <div className="mt-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-display text-xl text-white">{v.name}</div>
                {v.features?.[0] && (
                  <div className="mt-0.5 truncate text-xs text-gold-soft">{v.features[0]}</div>
                )}
                <div className="mt-1 flex items-center gap-3 text-xs text-white/55">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{v.capacity}</span>
                  <span className="flex items-center gap-1"><Luggage className="h-3 w-3" />{v.luggage}</span>
                  <span>{VEHICLE_LABELS[v.type] ?? v.type}</span>
                </div>
              </div>
              {/* Active toggle — flipping off hides it from booking instantly */}
              <button
                onClick={() => toggleActive(v)}
                role="switch"
                aria-checked={v.is_active}
                aria-label={`${v.name} active`}
                className={`relative mt-1 h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                  v.is_active ? "bg-gold" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    v.is_active ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-white/10 text-center">
              <div className="bg-white/[0.04] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.15em] text-white/45">Base</div>
                <div className="mt-0.5 text-sm font-medium text-white">${Number(v.base_rate).toFixed(0)}</div>
              </div>
              <div className="bg-white/[0.04] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.15em] text-white/45">Hourly</div>
                <div className="mt-0.5 text-sm font-medium text-white">
                  {v.hourly_rate != null ? `$${Number(v.hourly_rate).toFixed(0)}` : "—"}
                </div>
              </div>
            </div>
            <button
              onClick={() => openEdit(v)}
              className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-white/15 py-2 text-xs font-medium text-white/70 transition hover:border-gold hover:text-gold-soft"
            >
              <Pencil className="h-3 w-3" /> Edit class
            </button>
          </div>
        ))}
        {(!vehicles || vehicles.length === 0) && (
          <div className="rounded-sm bg-night-card p-8 text-center text-white/50 sm:col-span-2 lg:col-span-3">
            No vehicles yet — add your first class.
          </div>
        )}
      </div>

      {/* Add / edit dialog — form left, live preview right */}
      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto bg-night-panel border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">{isNew ? "Add vehicle class" : `Edit — ${form.name || "vehicle"}`}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-[1fr_290px]">
            {/* Form */}
            <div className="space-y-5">
              {/* 1 — pick the look */}
              {isNew ? (
                <div>
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">1 · Choose the class type</span>
                  <div className="grid grid-cols-5 gap-2">
                    {(Object.keys(VEHICLE_LABELS) as VehicleType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set("type")(t)}
                        className={`cursor-pointer rounded-sm border p-2 transition ${
                          form.type === t
                            ? "border-gold bg-gold/10"
                            : "border-white/10 bg-white/[0.03] hover:border-white/30"
                        }`}
                      >
                        <Image
                          src={VEHICLE_CUTOUTS[t]}
                          alt={VEHICLE_LABELS[t]}
                          sizes="80px"
                          className="mx-auto h-8 w-auto object-contain"
                        />
                        <div className={`mt-1.5 truncate text-center text-[10px] ${form.type === t ? "text-gold-soft" : "text-white/55"}`}>
                          {VEHICLE_LABELS[t]}
                        </div>
                      </button>
                    ))}
                  </div>
                  <span className="mt-1.5 block text-[11px] text-white/40">Sets the photo and tariff class — fixed after creation.</span>
                </div>
              ) : null}

              {/* 2 — name it */}
              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">{isNew ? "2 · " : ""}Name &amp; description</span>
                <input value={form.name} onChange={(e) => set("name")(e.target.value)} className={inputDark} placeholder="e.g. Executive Sedan" />
                <textarea
                  value={form.description}
                  onChange={(e) => set("description")(e.target.value)}
                  rows={2}
                  className={`${inputDark} mt-2`}
                  placeholder="One line customers see — e.g. Refined executive sedan for airport transfers."
                />
              </div>

              {/* 3 — the numbers, one row */}
              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">{isNew ? "3 · " : ""}Rates &amp; capacity</span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="block">
                    <div className="flex items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2">
                      <span className="text-sm text-white/60">$</span>
                      <input value={form.base_rate} onChange={(e) => set("base_rate")(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="130" className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none" />
                    </div>
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-white/45">Base fare</span>
                  </label>
                  <label className="block">
                    <div className="flex items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2">
                      <span className="text-sm text-white/60">$</span>
                      <input value={form.hourly_rate} onChange={(e) => set("hourly_rate")(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="—" className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none" />
                    </div>
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-white/45">Per hour</span>
                  </label>
                  <label className="block">
                    <div className="flex items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2">
                      <span className="text-sm text-white/60">$</span>
                      <input value={form.per_km_rate} onChange={(e) => set("per_km_rate")(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="global" className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none" />
                    </div>
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-white/45">Per km</span>
                  </label>
                  <label className="block">
                    <div className="flex items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2">
                      <span className="text-sm text-white/60">$</span>
                      <input value={form.min_fare} onChange={(e) => set("min_fare")(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="none" className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none" />
                    </div>
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-white/45">Min fare</span>
                  </label>
                  <label className="block">
                    <div className="flex items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-2">
                      <span className="text-sm text-white/60">×</span>
                      <input value={form.tariff_multiplier} onChange={(e) => set("tariff_multiplier")(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="1.0" className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none" />
                    </div>
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-white/45">Tariff scale</span>
                  </label>
                  <label className="block">
                    <input value={form.capacity} onChange={(e) => set("capacity")(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${inputDark} text-center`} />
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-white/45">Seats</span>
                  </label>
                  <label className="block">
                    <input value={form.luggage} onChange={(e) => set("luggage")(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${inputDark} text-center`} />
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-white/45">Bags</span>
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-white/40">
                  Per km blank → the global one-way rate from Admin → Rates. Min fare floors one-way and hourly quotes (never
                  Pearson tariffs). Tariff scale multiplies the published Pearson tariff for this class — sedan 1.0, SUV 1.3,
                  stretch 2.5.
                </p>
              </div>

              {/* 4 — what's in the class */}
              <div className="space-y-4">
                <ChipListInput
                  label={`${isNew ? "4 · " : ""}Vehicles in this class`}
                  hint="The actual cars — e.g. Cadillac LYRIQ, Lexus ES."
                  values={form.models}
                  onChange={(models) => setForm((f) => ({ ...f, models }))}
                  placeholder="e.g. Cadillac LYRIQ"
                />
                <ChipListInput
                  label="Amenities"
                  hint="Perks shown with a gold check — e.g. Leather interior."
                  values={form.amenities}
                  onChange={(amenities) => setForm((f) => ({ ...f, amenities }))}
                  placeholder="e.g. Onboard Wi-Fi"
                />
              </div>
            </div>

            {/* Live preview — what the customer's fleet card will show */}
            <div className="md:sticky md:top-0">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">Preview</span>
              <div className="rounded-sm bg-night p-5">
                <div className="relative flex aspect-[16/9] items-center justify-center">
                  <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_60%,rgba(201,167,106,0.12),transparent_70%)]" />
                  <Image
                    src={VEHICLE_CUTOUTS[form.type]}
                    alt=""
                    sizes="260px"
                    className="relative max-h-full w-auto object-contain drop-shadow-[0_18px_16px_rgba(0,0,0,0.5)]"
                  />
                </div>
                <div className="mt-2 font-display text-xl text-white">{form.name.trim() || "Class name"}</div>
                {form.models.length > 0 && (
                  <div className="mt-0.5 text-xs text-gold-soft">{form.models.join(" · ")}</div>
                )}
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/55">
                  {form.description.trim() || "Description appears here."}
                </p>
                <div className="mt-3 flex items-center gap-3 text-xs text-white/55">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{form.capacity || "—"}</span>
                  <span className="flex items-center gap-1"><Luggage className="h-3 w-3" />{form.luggage || "—"}</span>
                </div>
                {form.amenities.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {form.amenities.slice(0, 4).map((a) => (
                      <li key={a} className="flex items-center gap-1.5 text-[11px] text-white/55">
                        <span aria-hidden className="h-1 w-1 rounded-full bg-gold" />
                        {a}
                      </li>
                    ))}
                    {form.amenities.length > 4 && (
                      <li className="text-[11px] text-white/35">+{form.amenities.length - 4} more</li>
                    )}
                  </ul>
                )}
                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-white/10 text-center">
                  <div className="bg-white/[0.04] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-white/45">Base</div>
                    <div className="mt-0.5 text-sm font-medium text-white">{form.base_rate ? `$${form.base_rate}` : "—"}</div>
                  </div>
                  <div className="bg-white/[0.04] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-white/45">Hourly</div>
                    <div className="mt-0.5 text-sm font-medium text-white">{form.hourly_rate ? `$${form.hourly_rate}` : "—"}</div>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                This is how the class appears on the public fleet page and in booking.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2">
            <button onClick={() => setEditingId(null)} className={btnGhost}>Cancel</button>
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : isNew ? "Add to fleet" : "Save changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
