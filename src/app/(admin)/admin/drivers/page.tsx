"use client";

import { useState } from "react";
import { Star, ChevronRight, Car, KeyRound, FileText, Mail, Check, Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import { Panel, CountChip } from "@/components/admin/ui";
import { DriverReviewDialog } from "@/components/site/DriverReviewDialog";
import { DEFAULT_DRIVER_PAYOUT_RATE } from "@/lib/pricing";
import { formatDate } from "@/lib/datetime";
import {
  STAGE_LABELS,
  wizardStepsFor,
  type ApplicationType,
  type ApplicationStage,
} from "@/lib/driver-application";
import { requiredDocKeysFor } from "@/lib/driver-docs";
import {
  useAdminDrivers,
  useAdminDriverDrafts,
  useAdminActions,
  type AdminDriver,
  type AdminDriverDraft,
} from "@/components/admin/admin-data";

export default function AdminDriversPage() {
  return (
    <ProtectedRoute role="admin">
      <Drivers />
    </ProtectedRoute>
  );
}

/**
 * The application funnel, by stage: everyone who STARTED the form (drafts,
 * with the stage they're on), then submitted applications waiting for review,
 * then the verified roster. The stage filter narrows to one slice.
 */
const FILTERS = [
  { v: "all", l: "All" },
  { v: "in_progress", l: "In progress" },
  { v: "submitted", l: "Submitted" },
  { v: "approved", l: "Approved" },
] as const;
type Filter = (typeof FILTERS)[number]["v"];

const DRAFT_STAGES: { v: "any" | ApplicationStage; l: string }[] = [
  { v: "any", l: "Any stage" },
  { v: "personal", l: STAGE_LABELS.personal },
  { v: "professional", l: STAGE_LABELS.professional },
  { v: "vehicle", l: STAGE_LABELS.vehicle },
  { v: "documents", l: STAGE_LABELS.documents },
];

const asType = (t: string | null): ApplicationType => (t === "fleet_driver" ? "fleet_driver" : "owner_operator");

/** Mirrors the server's 24h nudge cooldown so the button doesn't invite a guaranteed error. */
const nudgedWithin24h = (nudgedAt: string | null): boolean =>
  !!nudgedAt && Date.now() - new Date(nudgedAt).getTime() < 24 * 60 * 60 * 1000;

/** Small badge naming how the applicant wants to drive. */
function TypeChip({ type }: { type: string | null }) {
  const fleet = asType(type) === "fleet_driver";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
      {fleet ? <KeyRound className="h-2.5 w-2.5" /> : <Car className="h-2.5 w-2.5" />}
      {fleet ? "SophRia vehicle" : "Own vehicle"}
    </span>
  );
}

function DraftCard({ draft, onNudge }: { draft: AdminDriverDraft; onNudge: (userId: string) => Promise<void> }) {
  const [nudging, setNudging] = useState(false);
  const type = asType(draft.application_type);
  const steps = wizardStepsFor(type);
  const idx = Math.max(0, steps.findIndex((s) => s.key === draft.stage));
  const name = draft.profile?.full_name ?? draft.form?.fullName ?? "Unnamed applicant";
  const email = draft.profile?.email ?? draft.form?.email ?? "";
  const docsDone = Object.keys(draft.doc_paths ?? {}).length + (draft.photo_path ? 1 : 0);
  const docsTotal = requiredDocKeysFor(type).length + 1; // + driver photo
  const nudgedRecently = nudgedWithin24h(draft.nudged_at);

  const nudge = async () => {
    setNudging(true);
    try { await onNudge(draft.user_id); } finally { setNudging(false); }
  };

  return (
    <div className="rounded-sm border border-white/12 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-medium text-white/70">
            {String(name).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{name}</div>
            <div className="truncate text-xs text-white/50">{email}</div>
          </div>
        </div>
        <TypeChip type={draft.application_type} />
      </div>

      {/* Stage progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/70">On: {STAGE_LABELS[steps[idx]?.key ?? "personal"]}</span>
          <span className="text-white/45">Step {idx + 1} of {steps.length}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s.key} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-gold/70" : "bg-white/12"}`} title={STAGE_LABELS[s.key]} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-xs text-white/50">
        <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> {docsDone}/{docsTotal} files</span>
        <span>Started {formatDate(draft.created_at)}</span>
        <span>Last active {formatDate(draft.updated_at)}</span>
        <span className="ml-auto">
          {nudgedRecently ? (
            <span className="inline-flex items-center gap-1.5 text-white/45" title={`Reminder sent ${formatDate(draft.nudged_at!)}`}>
              <Check className="h-3 w-3" /> Nudged today
            </span>
          ) : (
            <button
              onClick={() => void nudge()}
              disabled={nudging}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-white/20 px-3 py-1.5 text-xs text-white/80 transition hover:border-gold hover:text-gold-soft disabled:opacity-60"
              title={draft.nudged_at ? `Last reminder ${formatDate(draft.nudged_at)}` : "Email a reminder to finish the application"}
            >
              {nudging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Send reminder
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function Drivers() {
  const { data: drivers } = useAdminDrivers();
  const { data: drafts } = useAdminDriverDrafts();
  const { verifyDriver, setCommission, declineApplication, nudgeApplicant } = useAdminActions();
  const [reviewDriver, setReviewDriver] = useState<AdminDriver | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [stage, setStage] = useState<"any" | ApplicationStage>("any");

  const applications = (drivers ?? []).filter((d) => !d.is_verified);
  const roster = (drivers ?? []).filter((d) => d.is_verified);
  // Drafts belonging to someone with a submitted application are stale echoes
  // (submission deletes the draft) — never show them next to a real application.
  const submittedUserIds = new Set((drivers ?? []).map((d) => d.user_id));
  // The stage dropdown only exists on the "In progress" tab, so it must only
  // bite there — otherwise "All" would silently show a stage-filtered subset.
  const inProgress = (drafts ?? [])
    .filter((d) => !submittedUserIds.has(d.user_id))
    .filter((d) => filter !== "in_progress" || stage === "any" || d.stage === stage);

  const showDrafts = filter === "all" || filter === "in_progress";
  const showApplications = filter === "all" || filter === "submitted";
  const showRoster = filter === "all" || filter === "approved";

  return (
    <AdminShell
      title="Drivers"
      sub="Track applications from first click to approval, and manage the verified roster."
    >
      {/* Funnel filter — same chip pattern as the bookings panel */}
      <div className="mb-5 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`shrink-0 cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              filter === f.v ? "bg-white text-black" : "bg-white/[0.06] text-white/60 hover:text-white"
            }`}
          >
            {f.l}
            {f.v === "in_progress" && ` · ${(drafts ?? []).filter((d) => !submittedUserIds.has(d.user_id)).length}`}
            {f.v === "submitted" && ` · ${applications.length}`}
            {f.v === "approved" && ` · ${roster.length}`}
          </button>
        ))}
        {filter === "in_progress" && (
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as "any" | ApplicationStage)}
            className="ml-auto shrink-0 cursor-pointer rounded-sm border border-white/15 bg-transparent px-2.5 py-1.5 text-xs text-white/70 focus:border-gold focus:outline-none [&>option]:bg-night"
            aria-label="Filter in-progress applications by stage"
          >
            {DRAFT_STAGES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
        )}
      </div>

      {/* In progress — started but not submitted */}
      {showDrafts && (
        <Panel title="In progress" badge={<CountChip n={inProgress.length} tone="dim" />} className="mb-6">
          {inProgress.length === 0 ? (
            <div className="py-6 text-sm text-white/45">
              {filter === "in_progress" && stage !== "any"
                ? `No one is currently on the ${STAGE_LABELS[stage].toLowerCase()} step.`
                : "Nobody is mid-application right now."}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {inProgress.map((d) => <DraftCard key={d.user_id} draft={d} onNudge={nudgeApplicant} />)}
            </div>
          )}
        </Panel>
      )}

      {/* Submitted applications */}
      {showApplications && (
        <Panel title="Applications" badge={<CountChip n={applications.length} />}>
          {applications.length === 0 ? (
            <div className="py-6 text-sm text-white/45">No applications waiting for review.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {applications.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setReviewDriver(d)}
                  className="cursor-pointer rounded-sm border border-gold/30 bg-white/[0.03] p-4 text-left transition hover:border-gold hover:bg-gold/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-sm font-medium text-gold-soft">
                        {(d.profile?.full_name ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{d.profile?.full_name ?? "Unnamed applicant"}</div>
                        <div className="truncate text-xs text-white/50">{d.profile?.email ?? ""}</div>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gold-soft">
                      Review <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 text-xs text-white/55">
                    <TypeChip type={d.application_type} />
                    <span>{d.experience_years}y experience</span>
                    {d.vehicle_make && <span>{d.vehicle_make} {d.vehicle_model ?? ""} {d.vehicle_year ?? ""}</span>}
                    {d.city_of_residence && <span>{d.city_of_residence}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Verified roster */}
      {showRoster && (
        <Panel title="Roster" badge={<CountChip n={roster.length} tone="dim" />} className="mt-6">
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {roster.map((d) => (
              <button
                key={d.id}
                onClick={() => setReviewDriver(d)}
                className="block w-full cursor-pointer rounded-sm bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{d.profile?.full_name ?? "Driver"}</div>
                    <div className="truncate text-xs text-white/50">{d.profile?.email ?? ""}</div>
                  </div>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${d.is_available ? "bg-emerald-400" : "bg-white/25"}`} title={d.is_available ? "Online" : "Offline"} />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-white/55">
                  <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-gold" />{Number(d.rating).toFixed(2)} · {d.experience_years}y · {Math.round(Number(d.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100)}%</span>
                  <span>${Number(d.total_earnings).toFixed(0)} earned</span>
                </div>
              </button>
            ))}
            {roster.length === 0 && <div className="py-6 text-sm text-white/45">No verified drivers yet.</div>}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-3 pb-3">Driver</th>
                  <th className="px-3 pb-3">Vehicle</th>
                  <th className="px-3 pb-3">Availability</th>
                  <th className="px-3 pb-3">Rating</th>
                  <th className="px-3 pb-3">Experience</th>
                  <th className="px-3 pb-3">Share</th>
                  <th className="px-3 pb-3">Earnings</th>
                  <th className="px-3 pb-3 text-right" aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {roster.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setReviewDriver(d)}
                    className="group cursor-pointer border-b border-white/10 text-white transition-colors last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="p-3">
                      <div className="font-medium">{d.profile?.full_name ?? "Driver"}</div>
                      <div className="text-xs text-white/45">{d.profile?.email ?? String(d.user_id).slice(0, 8)}</div>
                    </td>
                    <td className="p-3"><TypeChip type={d.application_type} /></td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-2 text-xs ${d.is_available ? "text-emerald-300" : "text-white/45"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${d.is_available ? "bg-emerald-400" : "bg-white/25"}`} />
                        {d.is_available ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-gold" />{Number(d.rating).toFixed(2)}</span>
                    </td>
                    <td className="p-3 text-white/70">{d.experience_years}y</td>
                    <td className="p-3 text-white/70">{Math.round(Number(d.commission_rate ?? DEFAULT_DRIVER_PAYOUT_RATE) * 100)}%</td>
                    <td className="p-3 text-white/70">${Number(d.total_earnings).toFixed(0)}</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-white/45 group-hover:text-white">
                        View <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </td>
                  </tr>
                ))}
                {roster.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-white/45">No verified drivers yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <DriverReviewDialog
        driver={reviewDriver}
        open={!!reviewDriver}
        onClose={() => setReviewDriver(null)}
        onDecision={async (verified) => { await verifyDriver(reviewDriver!.id, verified); }}
        onDecline={async () => { await declineApplication(reviewDriver!.id); }}
        onCommission={async (rate) => {
          await setCommission(reviewDriver!.id, rate);
          setReviewDriver((d) => d && { ...d, commission_rate: rate });
        }}
      />
    </AdminShell>
  );
}
