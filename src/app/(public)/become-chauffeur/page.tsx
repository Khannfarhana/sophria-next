"use client";

import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";
import { Check, Upload, Camera, ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";

const schema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(40),
  city: z.string().trim().min(1, "City of residence is required").max(100),
  province: z.string().trim().min(1, "Select your province/state"),
  workAuthorization: z.string().trim().min(1, "Select your work authorization"),
  languages: z.string().trim().min(1, "Languages spoken is required").max(200),
  availability: z.string().trim().min(1, "Select your availability"),
  referral: z.string().trim().max(100).optional(),
  license: z.string().trim().min(3, "License number is required").max(60),
  experience: z.coerce.number().min(0).max(60),
});

const step1Schema = schema.pick({
  fullName: true, email: true, phone: true, city: true,
  province: true, workAuthorization: true, languages: true, availability: true,
});
const step2Schema = schema.pick({ license: true, experience: true });

const FORM_STEPS = ["Personal", "Professional", "Photo & Docs"];
const STATUS_STEPS = ["Submitted", "Under Review", "Approved"];

const PROVINCES = [
  "Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba", "Saskatchewan",
  "Nova Scotia", "New Brunswick", "Newfoundland and Labrador", "Prince Edward Island",
  "Northwest Territories", "Yukon", "Nunavut",
];
const WORK_AUTH = ["Canadian Citizen", "Permanent Resident", "Valid Work Permit", "Other"];
const AVAILABILITY = ["Full-time", "Part-time", "Weekends only", "Evenings only", "Flexible"];

// Driver-only onboarding — no vehicle documents collected.
const DOCS = [
  { k: "license_doc", l: "Driver's License" },
  { k: "background", l: "Background Check Consent" },
];

export default function BecomeChauffeurPage() {
  const { user, refreshRoles } = useAuth();
  const supabase = useSupabase();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", city: "", province: "", workAuthorization: "",
    languages: "", availability: "", referral: "", license: "", experience: "0",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [files, setFiles] = useState<Record<string, File | null>>({ license_doc: null, background: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const inputCls = "w-full rounded-xl border bg-input px-4 py-3 text-sm text-foreground transition focus:border-foreground focus:outline-none";
  const selectCls = (value: string) => `${inputCls} cursor-pointer ${value ? "text-foreground" : "text-ink-soft"}`;

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-ink-muted">{label}</label>
      {node}
    </div>
  );

  const onPhoto = (f: File | null) => {
    setPhoto(f);
    setPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ""; });
  };

  const next = () => {
    if (step === 1) {
      const r = step1Schema.safeParse(form);
      if (!r.success) { toast.error(r.error.issues[0].message); return; }
    }
    if (step === 2) {
      const r = step2Schema.safeParse(form);
      if (!r.success) { toast.error(r.error.issues[0].message); return; }
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const onSubmit = async () => {
    if (!user) { toast.error("Please sign in to apply."); return; }
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!photo) { toast.error("Please add a driver photo."); return; }

    setSubmitting(true);
    try {
      // Upload the driver photo first so we can store its path on the record.
      // Non-fatal: a storage hiccup shouldn't discard the whole application.
      let photoPath: string | null = null;
      const photoUpload = `${user.id}/photo-${Date.now()}-${photo.name}`;
      const { error: photoErr } = await supabase.storage.from("driver-documents").upload(photoUpload, photo, { upsert: true });
      if (photoErr) { console.warn("photo upload failed", photoErr); toast.warning("Photo couldn't be uploaded — we'll follow up for it."); }
      else photoPath = photoUpload;

      const { data: driver, error: drvErr } = await supabase.from("drivers").upsert({
        user_id: user.id,
        license_number: parsed.data.license,
        experience_years: parsed.data.experience,
        city_of_residence: parsed.data.city,
        province: parsed.data.province,
        work_authorization: parsed.data.workAuthorization,
        languages_spoken: parsed.data.languages,
        time_availability: parsed.data.availability,
        referral_name: parsed.data.referral || null,
        photo_url: photoPath,
      }, { onConflict: "user_id" }).select().single();
      if (drvErr) throw drvErr;

      await supabase.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone }).eq("id", user.id);
      await supabase.from("user_roles").upsert({ user_id: user.id, role: "driver" });

      for (const [docType, file] of Object.entries(files)) {
        if (!file) continue;
        const path = `${user.id}/${docType}-${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("driver-documents").upload(path, file, { upsert: true });
        if (upErr) { console.warn(`${docType} upload failed`, upErr); continue; }
        await supabase.from("driver_documents").insert({ driver_id: driver.id, doc_type: docType, file_url: path });
      }

      await refreshRoles();
      setSubmitted(true);
      toast.success("Application submitted. We'll review and respond shortly.");
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteLayout>
      {/* Dark page header */}
      <section className="bg-[#0d0d0e] px-6 pb-20 pt-36 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/55">Drive with SophRia</div>
          <h1 className="text-5xl font-light leading-[1.05] md:text-6xl">
            Become a <span className="text-[#e7d3a8]">chauffeur.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/70">
            Join Toronto&apos;s most discerning private fleet. Vetted professionals only.
          </p>
        </div>
      </section>

      <section className="bg-background px-6 py-20">
        <div className="mx-auto max-w-3xl space-y-8">
          {!user ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
              <p className="text-ink-muted">
                Please{" "}
                <Link href="/auth" className="font-medium text-foreground underline underline-offset-2">sign in</Link>{" "}
                to submit your application.
              </p>
            </div>
          ) : submitted ? (
            /* Success + status tracker */
            <div className="space-y-8">
              <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#e7d3a8] to-[#c9a76a] shadow-lg">
                  <Check className="h-8 w-8 text-[#0d0d0e]" strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl font-light text-foreground">Application submitted</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Thanks{form.fullName ? `, ${form.fullName.split(" ")[0]}` : ""}. Our team will review your details and reach out shortly.
                </p>
              </div>
              <div className="flex items-center rounded-2xl border border-border bg-card p-6 shadow-sm">
                {STATUS_STEPS.map((s, i) => (
                  <div key={s} className="flex flex-1 items-center">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${i === 0 ? "border-foreground bg-foreground text-background" : "border-border text-ink-soft"}`}>
                      {i === 0 ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={`ml-2.5 text-xs font-medium ${i === 0 ? "text-foreground" : "text-ink-soft"}`}>{s}</span>
                    {i < STATUS_STEPS.length - 1 && <div className={`mx-4 h-px flex-1 ${i === 0 ? "bg-foreground" : "bg-border"}`} />}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Step indicator */}
              <div>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${n <= step ? "bg-foreground" : "bg-border"}`} />
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-xs text-ink-soft">Step {step} of 3</span>
                  <span className="text-xs font-medium text-ink-muted">{FORM_STEPS[step - 1]}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
                {/* Step 1 — Personal details */}
                {step === 1 && (
                  <>
                    <div className="mb-6 text-xs uppercase tracking-[0.22em] text-ink-muted">Personal Details</div>
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

                {/* Step 2 — Professional */}
                {step === 2 && (
                  <>
                    <div className="mb-6 text-xs uppercase tracking-[0.22em] text-ink-muted">Professional Details</div>
                    <div className="grid gap-5 md:grid-cols-2">
                      {field("Driver's License Number *", <input className={inputCls} value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} required />)}
                      {field("Years of Experience *", <input type="number" min={0} max={60} className={inputCls} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} required />)}
                    </div>
                  </>
                )}

                {/* Step 3 — Photo & Documents */}
                {step === 3 && (
                  <>
                    <div className="mb-6 text-xs uppercase tracking-[0.22em] text-ink-muted">Driver Photo *</div>
                    <div className="flex flex-col items-center gap-3">
                      <label className="group relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-surface transition-colors hover:border-foreground/40">
                        {photoPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoPreview} alt="Driver" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-ink-soft">
                            <Camera className="h-6 w-6" />
                            <span className="text-[11px]">Add photo</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
                      </label>
                      {photo ? (
                        <button type="button" onClick={() => onPhoto(null)} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-foreground">
                          <X className="h-3.5 w-3.5" /> Remove photo
                        </button>
                      ) : (
                        <p className="text-xs text-ink-soft">A clear, front-facing headshot. Tap to take or upload.</p>
                      )}
                    </div>

                    <div className="mt-8 border-t border-border pt-7">
                      <div className="mb-5 text-xs uppercase tracking-[0.22em] text-ink-muted">Documents (optional)</div>
                      <div className="space-y-3">
                        {DOCS.map((d) => (
                          <label key={d.k} className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-foreground/30">
                            <div>
                              <div className="text-sm font-medium text-foreground">{d.l}</div>
                              <div className="mt-0.5 text-xs text-ink-soft">{files[d.k] ? files[d.k]!.name : "PDF or image — click to upload"}</div>
                            </div>
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${files[d.k] ? "border-foreground bg-foreground text-background" : "border-border text-ink-muted"}`}>
                              {files[d.k] ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                            </div>
                            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFiles({ ...files, [d.k]: e.target.files?.[0] ?? null })} />
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Nav */}
                <div className="mt-8 flex items-center justify-between gap-3">
                  {step > 1 ? (
                    <button type="button" onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-2 rounded-sm border border-border px-5 py-3 text-sm text-foreground transition hover:bg-muted">
                      <ArrowLeft className="h-4 w-4" /> Back
                    </button>
                  ) : <span />}
                  {step < 3 ? (
                    <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A]">
                      Continue <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={onSubmit} disabled={submitting} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A] disabled:opacity-60">
                      {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : "Submit Application"}
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
