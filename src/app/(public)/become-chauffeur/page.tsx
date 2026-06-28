"use client";

import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";
import { Check, Upload } from "lucide-react";

const schema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(40),
  license: z.string().trim().min(3).max(60),
  experience: z.coerce.number().min(0).max(60),
});

const STEPS = ["Submitted", "Under Review", "Approved"];

const DOCS = [
  { k: "license_doc", l: "Driver's License" },
  { k: "registration", l: "Vehicle Registration" },
  { k: "insurance", l: "Insurance Certificate" },
  { k: "background", l: "Background Check Consent" },
];

export default function BecomeChauffeurPage() {
  const { user, refreshRoles } = useAuth();
  const supabase = useSupabase();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", license: "", experience: "0" });
  const [files, setFiles] = useState<Record<string, File | null>>({ license_doc: null, registration: null, insurance: null, background: null });
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<"submitted" | "review" | "approved" | null>(null);

  const activeStep = stage === "approved" ? 2 : stage === "review" ? 1 : stage === "submitted" ? 0 : -1;

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-ink-muted">{label}</label>
      {node}
    </div>
  );

  const inputCls = "w-full rounded-xl border bg-input px-4 py-3 text-sm text-foreground transition focus:border-foreground focus:outline-none";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Please sign in to apply."); return; }
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setSubmitting(true);
    try {
      const { data: driver, error: drvErr } = await supabase.from("drivers").upsert({
        user_id: user.id,
        license_number: parsed.data.license,
        experience_years: parsed.data.experience,
      }, { onConflict: "user_id" }).select().single();
      if (drvErr) throw drvErr;

      await supabase.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone }).eq("id", user.id);
      await supabase.from("user_roles").upsert({ user_id: user.id, role: "driver" });

      for (const [docType, file] of Object.entries(files)) {
        if (!file) continue;
        const path = `${user.id}/${docType}-${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("driver-documents").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        await supabase.from("driver_documents").insert({ driver_id: driver.id, doc_type: docType, file_url: path });
      }

      await refreshRoles();
      setStage("submitted");
      toast.success("Application submitted. We'll review and respond shortly.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to submit");
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
            Join Toronto's most discerning private fleet. Vetted professionals only.
          </p>
        </div>
      </section>

      <section className="bg-background px-6 py-20">
        <div className="mx-auto max-w-3xl space-y-8">

          {/* Step tracker */}
          <div className="flex items-center gap-0 rounded-2xl border border-border bg-card p-6 shadow-sm">
            {STEPS.map((s, i) => {
              const done = i < activeStep + 1;
              const current = i === activeStep;
              return (
                <div key={s} className="flex flex-1 items-center">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                    done
                      ? "border-foreground bg-foreground text-background"
                      : current
                      ? "border-foreground text-foreground"
                      : "border-border text-ink-soft"
                  }`}>
                    {done && i < activeStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={`ml-2.5 text-xs font-medium ${done || current ? "text-foreground" : "text-ink-soft"}`}>{s}</span>
                  {i < STEPS.length - 1 && (
                    <div className={`mx-4 h-px flex-1 transition-colors ${i < activeStep ? "bg-foreground" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Not signed in */}
          {!user ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
              <p className="text-ink-muted">
                Please{" "}
                <Link href="/auth" className="font-medium text-foreground underline underline-offset-2">
                  sign in
                </Link>{" "}
                to submit your application.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-8 shadow-sm">
              {/* Personal info */}
              <div className="mb-6 text-xs uppercase tracking-[0.22em] text-ink-muted">Personal Info</div>
              <div className="grid gap-5 md:grid-cols-2">
                {field("Full Name",
                  <input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
                )}
                {field("Email",
                  <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                )}
                {field("Phone",
                  <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (416) …" required />
                )}
                {field("License Number",
                  <input className={inputCls} value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} required />
                )}
                <div className="md:col-span-2">
                  {field("Years of Experience",
                    <input type="number" min={0} max={60} className={inputCls} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} required />
                  )}
                </div>
              </div>

              {/* Documents */}
              <div className="mt-8 border-t border-border pt-7">
                <div className="mb-5 text-xs uppercase tracking-[0.22em] text-ink-muted">Documents</div>
                <div className="space-y-3">
                  {DOCS.map((d) => (
                    <label
                      key={d.k}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-foreground/30"
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">{d.l}</div>
                        <div className="mt-0.5 text-xs text-ink-soft">
                          {files[d.k] ? files[d.k]!.name : "PDF or image — click to upload"}
                        </div>
                      </div>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                        files[d.k] ? "border-foreground bg-foreground text-background" : "border-border text-ink-muted"
                      }`}>
                        {files[d.k] ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                      </div>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => setFiles({ ...files, [d.k]: e.target.files?.[0] ?? null })}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <button
                disabled={submitting}
                className="mt-8 w-full cursor-pointer rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A] disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit Application"}
              </button>
            </form>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
