"use client";

import { useEffect, useState } from "react";
import { Loader2, X, FileText, ExternalLink, ShieldCheck, Star, Percent } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSupabase } from "@/hooks/use-supabase";
import { formatDate } from "@/lib/datetime";

export interface ReviewDriver {
  id: string;
  user_id: string;
  license_number: string;
  experience_years: number;
  is_available: boolean;
  is_verified: boolean;
  rating: number;
  commission_rate: number;
  created_at: string;
  city_of_residence: string | null;
  province: string | null;
  work_authorization: string | null;
  languages_spoken: string | null;
  time_availability: string | null;
  referral_name: string | null;
  photo_url: string | null;
  profile: { full_name: string | null; email: string | null; phone: string | null } | null;
}

const DOC_LABELS: Record<string, string> = {
  license_doc: "Driver's License",
  background: "Background Check Consent",
  drivers_license: "Driver's License",
  insurance: "Insurance Certificate",
};

export function DriverReviewDialog({
  driver,
  open,
  onClose,
  onDecision,
  onCommission,
}: {
  driver: ReviewDriver | null;
  open: boolean;
  onClose: () => void;
  onDecision: (verified: boolean) => Promise<void>;
  onCommission: (rate: number) => Promise<void>;
}) {
  const supabase = useSupabase();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [docs, setDocs] = useState<{ label: string; url: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  // Commission input, derived from the stored rate unless the admin has an
  // in-flight edit for THIS driver (keying by id resets it per driver).
  const [rateEdit, setRateEdit] = useState<{ id: string; value: string } | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  const d = driver;

  useEffect(() => {
    if (!open || !d) { setPhotoUrl(null); setDocs([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Signed URL for the profile photo (private bucket).
      if (d.photo_url) {
        const { data } = await supabase.storage.from("driver-documents").createSignedUrl(d.photo_url, 3600);
        if (!cancelled) setPhotoUrl(data?.signedUrl ?? null);
      }
      // Documents + their signed URLs.
      const { data: rows } = await supabase
        .from("driver_documents")
        .select("doc_type, file_url")
        .eq("driver_id", d.id);
      const resolved = await Promise.all(
        (rows ?? []).map(async (r: { doc_type: string; file_url: string }) => {
          const { data } = await supabase.storage.from("driver-documents").createSignedUrl(r.file_url, 3600);
          return { label: DOC_LABELS[r.doc_type] ?? r.doc_type, url: data?.signedUrl ?? null };
        }),
      );
      if (!cancelled) { setDocs(resolved); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, d, supabase]);

  if (!d) return null;

  const name = d.profile?.full_name ?? "Unnamed applicant";
  const rows: [string, string][] = [
    ["City", d.city_of_residence ?? "—"],
    ["Province", d.province ?? "—"],
    ["Work authorization", d.work_authorization ?? "—"],
    ["Languages", d.languages_spoken ?? "—"],
    ["Availability", d.time_availability ?? "—"],
    ["Experience", `${d.experience_years} years`],
    ["License #", d.license_number],
    ...(d.referral_name ? ([["Referral", d.referral_name]] as [string, string][]) : []),
    ["Applied", formatDate(d.created_at)],
  ];

  const decide = async (verified: boolean) => {
    setActing(true);
    try { await onDecision(verified); onClose(); }
    finally { setActing(false); }
  };

  const storedPct = Math.round(Number(d.commission_rate ?? 0.2) * 100);
  const ratePct = rateEdit?.id === d.id ? rateEdit.value : String(storedPct);
  const pctNum = Number(ratePct);
  const rateValid = ratePct !== "" && Number.isFinite(pctNum) && pctNum >= 5 && pctNum <= 100;
  const rateDirty = rateValid && pctNum !== storedPct;

  const saveRate = async () => {
    if (!rateDirty) return;
    setSavingRate(true);
    try {
      await onCommission(pctNum / 100);
      setRateEdit(null); // fall back to the (now updated) stored rate
    } finally {
      setSavingRate(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden border-white/10 bg-[#0d0d0e] p-0 text-white">
        <DialogHeader className="border-b border-white/10 px-6 py-4 space-y-0">
          <DialogTitle className="text-lg text-white">Chauffeur application</DialogTitle>
        </DialogHeader>

        <div className="max-h-[72vh] overflow-y-auto">
          {/* Identity */}
          <div className="flex items-center gap-4 border-b border-white/10 px-6 py-5">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-lg font-medium text-white/70">{name.slice(0, 1).toUpperCase()}</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base">{name}</div>
              {d.profile?.email && <div className="truncate text-xs text-white/55">{d.profile.email}</div>}
              {d.profile?.phone && <div className="truncate text-xs text-white/55">{d.profile.phone}</div>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${d.is_verified ? "bg-[#e7d3a8] text-[#0d0d0e]" : "border border-white/20 text-white/70"}`}>
              {d.is_verified ? "Approved" : "Pending"}
            </span>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-px bg-white/10">
            {rows.map(([k, v]) => (
              <div key={k} className="bg-[#0d0d0e] px-5 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">{k}</div>
                <div className="mt-0.5 break-words text-sm">{v}</div>
              </div>
            ))}
          </div>

          {/* Compensation — the driver's cut of each fare; payouts are
              snapshotted per ride at assignment, so changing this only
              affects future assignments. */}
          <div className="border-t border-white/10 px-6 py-4">
            <div className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/45">
              <Percent className="h-3 w-3" /> Compensation
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2">
                <input
                  value={ratePct}
                  onChange={(e) => setRateEdit({ id: d.id, value: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
                  inputMode="numeric"
                  className="w-12 bg-transparent text-center text-sm text-white focus:outline-none"
                  aria-label="Commission percentage"
                />
                <span className="text-sm text-white/50">% of fare</span>
              </div>
              <button
                onClick={saveRate}
                disabled={!rateDirty || savingRate}
                className="inline-flex items-center gap-1.5 rounded-sm bg-[#e7d3a8] px-4 py-2 text-sm font-medium text-[#0d0d0e] transition hover:bg-[#f0e2c0] disabled:opacity-50"
              >
                {savingRate && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
            {!rateValid && <p className="mt-2 text-xs text-red-400">Enter a value between 5 and 100.</p>}
            <p className="mt-2 text-xs text-white/40">Applies to future ride assignments only — already-assigned rides keep their locked payout.</p>
          </div>

          {/* Documents */}
          <div className="border-t border-white/10 px-6 py-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/45">Documents</div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : docs.length === 0 ? (
              <div className="text-sm text-white/40">No documents uploaded.</div>
            ) : (
              <ul className="space-y-2">
                {docs.map((doc, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-white/50" /> {doc.label}</span>
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-[#e7d3a8] hover:text-white">
                        View <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : <span className="text-xs text-white/40">unavailable</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Rating (for already-verified drivers) */}
          {d.is_verified && (
            <div className="flex items-center gap-2 border-t border-white/10 px-6 py-3 text-sm text-white/60">
              <Star className="h-4 w-4 text-[#e7d3a8]" /> Rating {Number(d.rating).toFixed(2)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-white/10 px-6 py-4">
          {d.is_verified ? (
            <button onClick={() => decide(false)} disabled={acting} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-white/20 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 disabled:opacity-60">
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Revoke driver access
            </button>
          ) : (
            <button onClick={() => decide(true)} disabled={acting} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-[#e7d3a8] px-4 py-2.5 text-sm font-medium text-[#0d0d0e] transition hover:bg-[#f0e2c0] disabled:opacity-60">
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Approve &amp; grant driver role
            </button>
          )}
          <button onClick={onClose} className="rounded-sm border border-white/15 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5">Close</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
