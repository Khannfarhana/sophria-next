"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2, Check, Pencil, X } from "lucide-react";
import { upsertTariffDestinationAction, deleteTariffDestinationAction } from "@/lib/pricing-actions";
import { useTariffDestinations } from "@/hooks/use-tariff-destinations";
import { useAuth } from "@/lib/use-auth";

/**
 * The out-of-town tariff table, editable.
 *
 * These are the ~200 fixed Pearson fares ("Hamilton $140", "Ottawa $949") from
 * the official GTAA card. They lived only in code until 20260717150000 moved
 * them to tariff_destinations — and the fare engine now actually reads that
 * table, so an edit here reprices quotes within a minute, no deploy.
 *
 * Prices are TAX-INCLUSIVE, exactly as the card publishes them: the engine
 * strips HST back out before markup so tax is never charged twice.
 */
export function TariffDestinationsPanel() {
  const { roles } = useAuth();
  const canEdit = roles.includes("pricing");
  const qc = useQueryClient();
  const destinations = useTariffDestinations();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ name: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ name: string; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // destination name being saved/deleted
  // Deleting silently drops the trip to the distance model — arm first.
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = Object.entries(destinations ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const q = search.trim().toLowerCase();
    return q ? all.filter(([name]) => name.toLowerCase().includes(q)) : all;
  }, [destinations, search]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["tariff-destinations"] });

  const save = async (name: string, value: string) => {
    const n = Number(value);
    if (!name.trim()) { toast.error("Give the destination a name."); return; }
    if (!Number.isFinite(n) || n < 0 || n > 5000) { toast.error("Tariff must be between $0 and $5,000."); return; }
    setBusy(name);
    try {
      await upsertTariffDestinationAction(name.trim(), n);
      toast.success(`${name.trim()} — $${n.toFixed(0)} (tax-in) published`);
      setEditing(null);
      setAdding(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    if (deleteArmed !== name) { setDeleteArmed(name); return; }
    setBusy(name);
    try {
      await deleteTariffDestinationAction(name);
      toast.success(`${name} removed — trips there now use the distance model`);
      setDeleteArmed(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(null);
    }
  };

  const priceInput = (value: string, onChange: (v: string) => void, onCommit: () => void) => (
    <span className="inline-flex items-center gap-1 rounded-sm border border-gold/60 bg-white/[0.06] px-2 py-1">
      <span className="text-xs text-white/50">$</span>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") { setEditing(null); setAdding(null); } }}
        className="w-16 bg-transparent text-right text-sm text-white focus:outline-none"
        aria-label="Tariff, tax included"
      />
    </span>
  );

  return (
    <section className="rounded-sm bg-night-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="font-display text-xl text-white">Out-of-town tariffs</h2>
          <p className="mt-0.5 text-xs text-white/45">
            Fixed Pearson fares by destination, tax included as published. Anywhere not listed prices by distance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search destinations…"
              className="w-40 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
          </div>
          {canEdit && !adding && (
            <button
              onClick={() => setAdding({ name: "", value: "" })}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-white/20 px-3 py-1.5 text-xs text-white transition hover:border-gold hover:text-gold-soft"
            >
              <Plus className="h-3.5 w-3.5" /> Add destination
            </button>
          )}
        </div>
      </header>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/[0.03] px-5 py-3">
          <input
            autoFocus
            value={adding.name}
            onChange={(e) => setAdding({ ...adding, name: e.target.value })}
            placeholder="Destination name — e.g. Collingwood"
            className="w-56 rounded-sm border border-white/15 bg-white/[0.06] px-3 py-1.5 text-sm text-white placeholder:text-white/40 focus:border-gold focus:outline-none"
          />
          {priceInput(adding.value, (v) => setAdding({ ...adding, value: v }), () => void save(adding.name, adding.value))}
          <button
            onClick={() => void save(adding.name, adding.value)}
            disabled={busy !== null}
            className="inline-flex cursor-pointer items-center gap-1 rounded-sm bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gold-soft disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
          </button>
          <button onClick={() => setAdding(null)} className="cursor-pointer text-xs text-white/60 hover:text-white">Cancel</button>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto px-5 py-3">
        {destinations === null ? (
          <div className="flex items-center gap-2 py-4 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-4 text-sm text-white/45">{search ? "No destination matches that search." : "No destinations yet."}</div>
        ) : (
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(([name, tariff]) => {
              const isEditing = editing?.name === name;
              const isBusy = busy === name;
              return (
                <li key={name} className="group flex items-center justify-between gap-2 border-b border-white/5 py-1.5 text-sm">
                  <span className="truncate text-white/80">{name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {isEditing ? (
                      <>
                        {priceInput(editing.value, (v) => setEditing({ name, value: v }), () => void save(name, editing.value))}
                        <button onClick={() => void save(name, editing.value)} disabled={isBusy} className="cursor-pointer text-gold-soft hover:text-gold" aria-label="Save">
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setEditing(null)} className="cursor-pointer text-white/50 hover:text-white" aria-label="Cancel">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="tabular-nums text-white">${Number(tariff).toFixed(0)}</span>
                        {canEdit && (
                          <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => { setEditing({ name, value: String(tariff) }); setDeleteArmed(null); }}
                              className="cursor-pointer text-white/45 hover:text-gold-soft"
                              aria-label={`Edit ${name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void remove(name)}
                              disabled={isBusy}
                              className={`cursor-pointer ${deleteArmed === name ? "text-red-400" : "text-white/45 hover:text-red-400"}`}
                              aria-label={deleteArmed === name ? `Confirm remove ${name}` : `Remove ${name}`}
                              title={deleteArmed === name ? "Click again to confirm" : "Remove"}
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="border-t border-white/10 px-5 py-2.5 text-[11px] text-white/40">
        {canEdit
          ? "Changes go live on new quotes within a minute. Removing a destination doesn't refuse the trip — it falls back to the in-zone distance model."
          : "Read-only — editing tariffs needs the pricing role."}
      </p>
    </section>
  );
}
