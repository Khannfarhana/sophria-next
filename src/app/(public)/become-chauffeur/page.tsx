"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageHero } from "@/components/site/PageHero";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";
import { submitDriverApplicationAction } from "@/lib/actions";
import { formatDate } from "@/lib/datetime";
import {
  driverApplicationSchema,
  wizardStepsFor,
  APPLICATION_TYPES,
  PROVINCES,
  WORK_AUTH,
  AVAILABILITY,
  LICENCE_CLASSES,
  VEHICLE_CLASSES,
  MIN_EXPERIENCE_YEARS,
  type ApplicationType,
  type ApplicationStage,
} from "@/lib/driver-application";
import {
  paperworkDocsFor,
  vehiclePhotosFor,
  DOC_LABELS,
  ACCEPTED_DOC_MIME,
  ACCEPTED_IMAGE_MIME,
  validateUpload,
} from "@/lib/driver-docs";
import { Check, Upload, Camera, ImageIcon, ArrowLeft, ArrowRight, Loader2, X, Clock, ShieldCheck, Car, KeyRound, CloudUpload } from "lucide-react";

type Application = { is_verified: boolean; is_available: boolean; created_at: string; license_number: string };

/** What we persist per uploaded document: where it landed + what to show. */
type DocMeta = { path: string; name: string };

type Draft = {
  application_type: string;
  stage: string;
  form: Record<string, string> | null;
  photo_path: string | null;
  doc_paths: Record<string, DocMeta> | null;
};

const STATUS_STEPS = ["Submitted", "Under Review", "Approved"];

// Storage keys can't contain spaces/special chars — sanitize filenames. The
// timestamp keeps a replacement from colliding with the file it replaces.
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_");
const stampedPath = (uid: string, key: string, fileName: string) =>
  `${uid}/${key}-${Date.now()}-${safeName(fileName)}`;

const emptyForm = {
  fullName: "", email: "", phone: "", city: "", province: "", workAuthorization: "",
  languages: "", availability: "", referral: "",
  license: "", licenceClass: "", experience: "",
  vehicleClass: "", vehicleMake: "", vehicleModel: "", vehicleYear: "", limoPlate: "",
};

export default function BecomeChauffeurPage() {
  const { user } = useAuth();
  const supabase = useSupabase();

  // Application type drives everything: which wizard steps exist and which
  // documents are mandatory. null = the applicant hasn't chosen yet.
  const [appType, setAppType] = useState<ApplicationType | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [docs, setDocs] = useState<Record<string, DocMeta>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // undefined = still checking · null = no application · object = already applied
  const [application, setApplication] = useState<Application | null | undefined>(undefined);
  // Draft restore happens once, after the application check says "no application".
  const [draftReady, setDraftReady] = useState(false);

  const steps = appType ? wizardStepsFor(appType) : [];
  const step = steps[stepIdx] ?? null;
  const isLastStep = appType !== null && stepIdx === steps.length - 1;

  // On load, check whether this account already has an application on file,
  // then pull any saved draft so a half-finished application resumes in place.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional signed-out reset; runs once per user change
    if (!user) { setApplication(null); setDraftReady(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("drivers")
        .select("is_verified, is_available, created_at, license_number")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) { setApplication(data as Application); return; }
      setApplication(null);

      const { data: draft } = await supabase
        .from("driver_application_drafts")
        .select("application_type, stage, form, photo_path, doc_paths")
        .eq("user_id", user.id)
        .maybeSingle<Draft>();
      if (cancelled || !draft) { setDraftReady(true); return; }

      const type = (draft.application_type === "fleet_driver" ? "fleet_driver" : "owner_operator") as ApplicationType;
      const restoredSteps = wizardStepsFor(type);
      const idx = restoredSteps.findIndex((s) => s.key === draft.stage);
      setAppType(type);
      setStepIdx(idx >= 0 ? idx : 0);
      setForm({ ...emptyForm, ...(draft.form ?? {}) });
      setDocs(draft.doc_paths ?? {});
      if (draft.photo_path) {
        setPhotoPath(draft.photo_path);
        const { data: signed } = await supabase.storage.from("driver-documents").createSignedUrl(draft.photo_path, 3600);
        if (!cancelled && signed?.signedUrl) setPhotoPreview(signed.signedUrl);
      }
      if (!cancelled) setDraftReady(true);
    })();
    return () => { cancelled = true; };
  }, [user, supabase]);

  // Blob previews are revoked on replace/remove; this covers unmount.
  useEffect(() => () => { if (photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  /**
   * Persist the draft. Values are passed explicitly (not read from state) so a
   * save always writes what just changed, never a stale closure. Failures are
   * silent by design — autosave must never interrupt the applicant.
   */
  const persistDraft = useCallback(async (next: {
    type: ApplicationType;
    stage: ApplicationStage;
    form: typeof emptyForm;
    photoPath: string | null;
    docs: Record<string, DocMeta>;
  }) => {
    if (!user) return;
    const { error } = await supabase.from("driver_application_drafts").upsert({
      user_id: user.id,
      application_type: next.type,
      stage: next.stage,
      form: next.form,
      photo_path: next.photoPath,
      doc_paths: next.docs,
    }, { onConflict: "user_id" });
    if (error) console.warn("Draft autosave failed:", error.message);
  }, [user, supabase]);

  // Debounced autosave while typing. Uploads and step changes save eagerly.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageKey = step?.key ?? "personal";
  useEffect(() => {
    if (!draftReady || !appType || application) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const t = setTimeout(() => {
      void persistDraft({ type: appType, stage: stageKey, form, photoPath, docs });
    }, 1000);
    saveTimer.current = t;
    return () => clearTimeout(t);
  }, [form, appType, stageKey, photoPath, docs, draftReady, application, persistDraft]);

  const inputCls = "w-full rounded-sm border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/40 transition focus:border-gold focus:outline-none";
  const selectCls = (value: string) => `${inputCls} cursor-pointer ${value ? "text-white" : "text-white/50"}`;

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">{label}</label>
      {node}
    </div>
  );

  /** Upload one file under the applicant's own prefix (path-based storage RLS). */
  const uploadFile = async (key: string, file: File): Promise<string> => {
    const path = stampedPath(user!.id, key, file.name);
    const { error } = await supabase.storage
      .from("driver-documents")
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) throw new Error(`Couldn't upload ${DOC_LABELS[key] ?? key}: ${error.message}`);
    return path;
  };

  /** Files upload the moment they're picked, so progress survives a reload. */
  const onDoc = async (key: string, f: File | null) => {
    if (!f || !appType) return;
    const allowed = key.startsWith("vehicle_photo_") ? ACCEPTED_IMAGE_MIME : ACCEPTED_DOC_MIME;
    const err = validateUpload(f, allowed);
    if (err) { toast.error(err); return; }
    setUploading((u) => ({ ...u, [key]: true }));
    try {
      const path = await uploadFile(key, f);
      const nextDocs = { ...docs, [key]: { path, name: f.name } };
      setDocs(nextDocs);
      void persistDraft({ type: appType, stage: stageKey, form, photoPath, docs: nextDocs });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  };

  const onPhoto = async (f: File | null) => {
    if (!appType) return;
    if (!f) {
      setPhotoPath(null);
      setPhotoPreview((prev) => { if (prev.startsWith("blob:")) URL.revokeObjectURL(prev); return ""; });
      void persistDraft({ type: appType, stage: stageKey, form, photoPath: null, docs });
      return;
    }
    const err = validateUpload(f, ACCEPTED_IMAGE_MIME);
    if (err) { toast.error(err); return; }
    setUploading((u) => ({ ...u, photo: true }));
    try {
      const path = await uploadFile("photo", f);
      setPhotoPath(path);
      setPhotoPreview((prev) => { if (prev.startsWith("blob:")) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
      void persistDraft({ type: appType, stage: stageKey, form, photoPath: path, docs });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading((u) => ({ ...u, photo: false }));
    }
  };

  const chooseType = (type: ApplicationType) => {
    setAppType(type);
    setStepIdx(0);
    void persistDraft({ type, stage: "personal", form, photoPath, docs });
  };

  /** Switching type keeps everything entered; only the requirements change. */
  const switchType = () => {
    if (!appType) return;
    const type: ApplicationType = appType === "owner_operator" ? "fleet_driver" : "owner_operator";
    const nextSteps = wizardStepsFor(type);
    let idx = nextSteps.findIndex((s) => s.key === stageKey);
    if (idx < 0) idx = nextSteps.findIndex((s) => s.key === "documents");
    setAppType(type);
    setStepIdx(idx);
    void persistDraft({ type, stage: nextSteps[idx].key, form, photoPath, docs });
  };

  const goTo = (idx: number) => {
    if (!appType) return;
    setStepIdx(idx);
    void persistDraft({ type: appType, stage: steps[idx].key, form, photoPath, docs });
  };

  const next = () => {
    if (!step) return;
    if (step.schema) {
      const r = step.schema.safeParse(form);
      if (!r.success) { toast.error(r.error.issues[0].message); return; }
    }
    goTo(Math.min(stepIdx + 1, steps.length - 1));
  };

  const requiredDocs = appType ? [...paperworkDocsFor(appType), ...vehiclePhotosFor(appType)] : [];
  const anyUploading = Object.values(uploading).some(Boolean);

  const onSubmit = async () => {
    if (!user || !appType) { toast.error("Please sign in to apply."); return; }
    if (anyUploading) { toast.error("Hold on — a file is still uploading."); return; }

    const parsed = driverApplicationSchema.safeParse({ ...form, applicationType: appType, termsAccepted });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!photoPath) { toast.error("Please add a driver photo."); return; }

    const missing = requiredDocs.filter((d) => !docs[d.key]);
    if (missing.length > 0) {
      toast.error(`Still needed: ${missing.map((d) => d.label).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      // Files are already in storage (uploaded per step) — submission just
      // posts their paths. The server re-validates everything, creates the
      // PENDING application, and clears the draft. This does NOT grant the
      // driver role — an admin does that when they approve.
      await submitDriverApplicationAction({
        application: parsed.data,
        photoPath,
        docs: requiredDocs.map((d) => ({ docType: d.key, path: docs[d.key].path })),
      });

      // Flip straight to the status view.
      setApplication({
        is_verified: false,
        is_available: false,
        created_at: new Date().toISOString(),
        license_number: parsed.data.license,
      });
      toast.success("Application submitted. We'll review and respond shortly.");
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const docRow = (d: { key: string; label: string; hint: string }) => {
    const meta = docs[d.key];
    const busy = uploading[d.key];
    const isVehiclePhoto = d.key.startsWith("vehicle_photo_");
    return (
      <label
        key={d.key}
        className={`flex cursor-pointer items-center justify-between gap-3 rounded-sm border bg-white/[0.04] px-5 py-4 transition-colors ${
          meta ? "border-gold/50" : "border-white/20 hover:border-gold"
        }`}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">
            {d.label} <span className="text-white/50">*</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-white/50">{meta ? meta.name : d.hint}</div>
        </div>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
            meta ? "border-gold bg-gold text-night" : "border-white/20 text-white/60"
          }`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : meta ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
        </div>
        <input
          type="file"
          accept={isVehiclePhoto ? "image/*" : "image/*,application/pdf"}
          className="hidden"
          disabled={busy || submitting}
          onChange={(e) => { void onDoc(d.key, e.target.files?.[0] ?? null); e.target.value = ""; }}
        />
      </label>
    );
  };

  const uploadedCount = requiredDocs.filter((d) => docs[d.key]).length;
  const paperwork = appType ? paperworkDocsFor(appType) : [];
  const vehicleShots = appType ? vehiclePhotosFor(appType) : [];
  const typeLabel = appType === "owner_operator" ? "Bringing your own vehicle" : "Driving a SophRia vehicle";

  return (
    <SiteLayout>
      <PageHero
        narrow
        eyebrow="Drive with SophRia"
        title={<>Become a <span className="text-gold-soft">chauffeur.</span></>}
        sub={<>Join Toronto&apos;s most discerning private fleet. Vetted professionals only — a full Ontario G licence with{" "}{MIN_EXPERIENCE_YEARS}+ years. Drive one of our vehicles, or onboard your own luxury sedan or SUV on a limousine plate.</>}
      />

      <section className="bg-night px-6 py-20 text-white">
        <div className="mx-auto max-w-3xl space-y-8">
          {!user ? (
            <div className="rounded-sm bg-night-card p-10 text-center">
              <p className="text-white/70">
                Please{" "}
                <Link href="/auth" className="font-medium text-gold-soft underline underline-offset-2 hover:text-gold">sign in</Link>{" "}
                to submit your application.
              </p>
            </div>
          ) : application === undefined || (application === null && !draftReady) ? (
            <div className="rounded-sm bg-night-card flex items-center justify-center p-16">
              <Loader2 className="h-5 w-5 animate-spin text-white/70" />
            </div>
          ) : application ? (
            /* Already applied — show status instead of the form */
            (() => {
              const approved = application.is_verified;
              const activeIdx = approved ? 2 : 1; // 0 Submitted · 1 Under Review · 2 Approved
              return (
                <div className="space-y-8">
                  <div className="rounded-sm bg-night-card p-10 text-center">
                    <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full shadow-lg ${approved ? "bg-gradient-to-br from-gold-soft to-gold" : "bg-white/5"}`}>
                      {approved ? <ShieldCheck className="h-8 w-8 text-night" strokeWidth={2} /> : <Clock className="h-7 w-7 text-white/70" />}
                    </div>
                    <h2 className="text-2xl font-light text-white">
                      {approved ? "You're a SophRia chauffeur" : "Application under review"}
                    </h2>
                    <p className="mt-2 text-sm text-white/70">
                      {approved
                        ? "Your application has been approved. You can now access the driver portal and start accepting rides."
                        : "Thanks for applying. Our team is reviewing your details and will be in touch — you don't need to submit again."}
                    </p>
                    <div className="mt-5 text-xs text-white/50">
                      Applied {formatDate(application.created_at)} · License {application.license_number}
                    </div>
                    {approved && (
                      <Link href="/driver" className="mt-6 inline-flex items-center gap-2 rounded-sm bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-gold-soft">
                        Go to Driver Portal <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                  <div className="rounded-sm bg-night-card flex items-center p-6">
                    {STATUS_STEPS.map((s, i) => {
                      const done = i < activeIdx;
                      const current = i === activeIdx;
                      return (
                        <div key={s} className="flex flex-1 items-center">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${done || current ? "border-gold" : "border-white/15 text-white/50"} ${done ? "bg-gold text-night" : current ? "text-white" : ""}`}>
                            {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                          </div>
                          <span className={`ml-2.5 text-xs font-medium ${done || current ? "text-white" : "text-white/50"}`}>{s}</span>
                          {i < STATUS_STEPS.length - 1 && <div className={`mx-4 h-px flex-1 ${i < activeIdx ? "bg-gold" : "bg-white/15"}`} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : !appType ? (
            /* Choose how you want to drive before the wizard starts */
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-light text-white">How would you like to drive?</h2>
                <p className="mt-1.5 text-sm text-white/55">You can change this later — everything you enter is kept.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {APPLICATION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => chooseType(t.value)}
                    className="group cursor-pointer rounded-sm border border-white/15 bg-night-card p-7 text-left transition hover:border-gold"
                  >
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-sm border border-white/20 text-white/70 transition group-hover:border-gold group-hover:text-gold-soft">
                      {t.value === "fleet_driver" ? <KeyRound className="h-5 w-5" /> : <Car className="h-5 w-5" />}
                    </div>
                    <div className="text-base font-medium text-white">{t.label}</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/55">{t.description}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-gold-soft">
                      Start application <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Step indicator */}
              <div>
                <div className="flex items-center gap-1.5">
                  {steps.map((_, i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= stepIdx ? "bg-gold" : "bg-white/15"}`} />
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-xs text-white/50">Step {stepIdx + 1} of {steps.length} · {typeLabel}</span>
                  <span className="text-xs font-medium text-white/70">{step?.title}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40">
                    <CloudUpload className="h-3 w-3 shrink-0" /> Progress saves automatically — you can leave and finish later.
                  </span>
                  <button type="button" onClick={switchType} disabled={submitting} className="cursor-pointer text-[11px] text-white/50 underline underline-offset-2 transition hover:text-gold-soft">
                    {appType === "owner_operator" ? "Switch to driving a SophRia vehicle" : "Switch to bringing your own vehicle"}
                  </button>
                </div>
              </div>

              <div className="rounded-sm bg-night-card p-8">
                {/* Personal details */}
                {step?.key === "personal" && (
                  <>
                    <div className="mb-6 text-xs uppercase tracking-[0.22em] text-white/60">Personal Details</div>
                    <div className="grid gap-5 md:grid-cols-2">
                      {field("Full Name *", <input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />)}
                      {field("Email *", <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />)}
                      {field("Phone *", <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (416) …" required />)}
                      {field("City of Residence *", <input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Toronto" required />)}
                      {field("Province/State *",
                        <select className={selectCls(form.province)} value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} required>
                          <option value="" disabled>Select a Province</option>
                          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      )}
                      {field("Work Authorization *",
                        <select className={selectCls(form.workAuthorization)} value={form.workAuthorization} onChange={(e) => setForm({ ...form, workAuthorization: e.target.value })} required>
                          <option value="" disabled>Select an option</option>
                          {WORK_AUTH.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                      )}
                      <div className="md:col-span-2">
                        {field("Languages Spoken *", <input className={inputCls} value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="English, French, Hindi" required />)}
                      </div>
                      {field("Time Availability *",
                        <select className={selectCls(form.availability)} value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} required>
                          <option value="" disabled>Select an option</option>
                          {AVAILABILITY.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                      )}
                      {field("Referral Name (optional)", <input className={inputCls} value={form.referral} onChange={(e) => setForm({ ...form, referral: e.target.value })} placeholder="Who referred you?" />)}
                    </div>
                  </>
                )}

                {/* Professional */}
                {step?.key === "professional" && (
                  <>
                    <div className="mb-6 text-xs uppercase tracking-[0.22em] text-white/60">Professional Details</div>
                    <div className="grid gap-5 md:grid-cols-2">
                      {field("Driver's Licence Number *", <input className={inputCls} value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} required />)}
                      {field("Licence Class *",
                        <select className={selectCls(form.licenceClass)} value={form.licenceClass} onChange={(e) => setForm({ ...form, licenceClass: e.target.value })} required>
                          <option value="" disabled>Select your class</option>
                          {LICENCE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                      <div className="md:col-span-2">
                        {field(`Years of Experience * (minimum ${MIN_EXPERIENCE_YEARS})`,
                          <input type="number" min={MIN_EXPERIENCE_YEARS} max={60} className={inputCls} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder={String(MIN_EXPERIENCE_YEARS)} required />
                        )}
                      </div>
                    </div>
                    <p className="mt-5 text-xs text-white/50">
                      A full Ontario G licence held for at least {MIN_EXPERIENCE_YEARS} years is required, along with a
                      licence to operate as a vehicle-for-hire driver and a clean driver&apos;s abstract.
                    </p>
                  </>
                )}

                {/* Vehicle — owner-operators only */}
                {step?.key === "vehicle" && (
                  <>
                    <div className="mb-6 text-xs uppercase tracking-[0.22em] text-white/60">Your Vehicle</div>
                    <div className="grid gap-5 md:grid-cols-2">
                      {field("Vehicle Class *",
                        <select className={selectCls(form.vehicleClass)} value={form.vehicleClass} onChange={(e) => setForm({ ...form, vehicleClass: e.target.value })} required>
                          <option value="" disabled>Select a class</option>
                          {VEHICLE_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      )}
                      {field("Limousine Plate *", <input className={inputCls} value={form.limoPlate} onChange={(e) => setForm({ ...form, limoPlate: e.target.value.toUpperCase() })} placeholder="e.g. LIMO 123" required />)}
                      {field("Make *", <input className={inputCls} value={form.vehicleMake} onChange={(e) => setForm({ ...form, vehicleMake: e.target.value })} placeholder="Cadillac" required />)}
                      {field("Model *", <input className={inputCls} value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} placeholder="Escalade" required />)}
                      {field("Year *", <input type="number" min={1980} max={2027} className={inputCls} value={form.vehicleYear} onChange={(e) => setForm({ ...form, vehicleYear: e.target.value })} placeholder="2023" required />)}
                    </div>
                    <p className="mt-5 text-xs text-white/50">
                      Your vehicle must be a late-model luxury sedan or SUV carrying a limousine plate, with commercial
                      insurance in good standing and a valid safety certificate.
                    </p>
                  </>
                )}

                {/* Photo & Documents */}
                {step?.key === "documents" && (
                  <>
                    <div className="mb-6 text-xs uppercase tracking-[0.22em] text-white/60">Driver Photo *</div>
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-white/20 bg-white/[0.04]">
                        {uploading.photo ? (
                          <Loader2 className="h-6 w-6 animate-spin text-white/60" />
                        ) : photoPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoPreview} alt="Driver" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-white/60">
                            <Camera className="h-6 w-6" />
                            <span className="text-[11px]">No photo yet</span>
                          </div>
                        )}
                      </div>

                      {/* Two explicit inputs. A single input with capture="user"
                          forces the selfie camera on mobile and removes the
                          library option entirely — the client asked for both. */}
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-white/25 px-4 py-2 text-xs text-white transition hover:border-gold hover:text-gold-soft">
                          <Camera className="h-3.5 w-3.5" /> Take photo
                          <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { void onPhoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-white/25 px-4 py-2 text-xs text-white transition hover:border-gold hover:text-gold-soft">
                          <ImageIcon className="h-3.5 w-3.5" /> Upload from photos or files
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onPhoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                        </label>
                        {photoPath && (
                          <button type="button" onClick={() => void onPhoto(null)} className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
                            <X className="h-3.5 w-3.5" /> Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-white/50">A clear, front-facing headshot.</p>
                    </div>

                    <div className="mt-8 border-t border-white/10 pt-7">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/60">Documents — all required</div>
                        <span className="text-xs text-white/50">{uploadedCount}/{requiredDocs.length}</span>
                      </div>
                      <p className="mb-5 text-xs text-white/50">
                        Images or PDF, up to 10 MB each.
                        {appType === "fleet_driver" && " No vehicle paperwork needed — you'll drive a SophRia car."}
                      </p>
                      <div className="space-y-3">{paperwork.map(docRow)}</div>

                      {vehicleShots.length > 0 && (
                        <>
                          <div className="mb-4 mt-8 text-xs uppercase tracking-[0.22em] text-white/60">
                            Vehicle Photos — all four sides
                          </div>
                          <div className="space-y-3">{vehicleShots.map(docRow)}</div>
                        </>
                      )}
                    </div>

                    <div className="mt-8 border-t border-white/10 pt-7">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#c9a76a]"
                        />
                        <span className="text-xs leading-relaxed text-white/70">
                          I confirm the information and documents above are accurate and mine, and I accept the{" "}
                          <Link href="/chauffeur-terms" target="_blank" className="font-medium text-gold-soft underline underline-offset-2 hover:text-gold">
                            Chauffeur Terms
                          </Link>
                          . I understand I drive as an independent contractor, that I am responsible for my{" "}
                          {appType === "owner_operator" ? "vehicle, insurance and licensing" : "licensing and conduct"} at all
                          times, and that SophRia may verify these documents and decline or end the arrangement if they lapse.
                        </span>
                      </label>
                    </div>
                  </>
                )}

                {/* Nav */}
                <div className="mt-8 flex items-center justify-between gap-3">
                  {stepIdx > 0 ? (
                    <button type="button" onClick={() => goTo(stepIdx - 1)} disabled={submitting} className="inline-flex items-center gap-2 rounded-sm border border-white/25 px-5 py-3 text-sm text-white transition hover:border-gold hover:text-gold-soft disabled:opacity-60">
                      <ArrowLeft className="h-4 w-4" /> Back
                    </button>
                  ) : <span />}
                  {!isLastStep ? (
                    <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-sm bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-gold-soft">
                      Continue <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={() => void onSubmit()} disabled={submitting || anyUploading} className="inline-flex items-center gap-2 rounded-sm bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-gold-soft disabled:opacity-60">
                      {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>)
                        : anyUploading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>)
                        : "Submit Application"}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
