"use client";

import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/hooks/use-supabase";

const schema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(40),
  license: z.string().trim().min(3).max(60),
  experience: z.coerce.number().min(0).max(60),
});

export default function BecomeChauffeurPage() {
  const { user, refreshRoles } = useAuth();
  const supabase = useSupabase();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", license: "", experience: "0" });
  const [files, setFiles] = useState<Record<string, File | null>>({ license_doc: null, registration: null, insurance: null, background: null });
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<"submitted" | "review" | "approved" | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Please sign in to apply."); return; }
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setSubmitting(true);
    try {
      // Upsert driver row
      const { data: driver, error: drvErr } = await supabase.from("drivers").upsert({
        user_id: user.id,
        license_number: parsed.data.license,
        experience_years: parsed.data.experience,
      }, { onConflict: "user_id" }).select().single();
      if (drvErr) throw drvErr;

      // Update profile
      await supabase.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone }).eq("id", user.id);

      // Grant driver role (pending verification)
      await supabase.from("user_roles").upsert({ user_id: user.id, role: "driver" });

      // Upload files
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
      <section className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-3xl">
          <div className="eyebrow mb-6">Drive with SophRia</div>
          <h1 className="text-5xl md:text-6xl font-light">Become a chauffeur.</h1>
          <p className="mt-6 text-lg text-ink-muted">Join Toronto's most discerning private fleet. Vetted professionals only.</p>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="mx-auto max-w-3xl">
          {/* Status tracker */}
          <div className="mb-12 flex items-center justify-between rounded-sm border border-border bg-card p-6 text-xs">
            {["Submitted", "Under Review", "Approved"].map((s, i) => {
              const idx = stage === "approved" ? 2 : stage === "review" ? 1 : stage === "submitted" ? 0 : -1;
              const active = i <= idx;
              return (
                <div key={s} className="flex flex-1 items-center">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border ${active ? "border-foreground bg-foreground text-background" : "border-border text-ink-soft"}`}>{i + 1}</div>
                  <div className={`ml-3 ${active ? "text-foreground font-medium" : "text-ink-soft"}`}>{s}</div>
                  {i < 2 && <div className="mx-4 h-px flex-1 bg-border" />}
                </div>
              );
            })}
          </div>

          {!user ? (
            <div className="rounded-sm border border-border bg-card p-8 text-center">
              <p className="text-ink-muted">Please <Link href="/auth" className="text-foreground underline">sign in</Link> to submit your application.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6 rounded-sm border border-border bg-card p-8">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="eyebrow mb-2 block">Full Name</label>
                  <input className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
                </div>
                <div>
                  <label className="eyebrow mb-2 block">Email</label>
                  <input type="email" className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div>
                  <label className="eyebrow mb-2 block">Phone</label>
                  <input className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (416) …" required />
                </div>
                <div>
                  <label className="eyebrow mb-2 block">License Number</label>
                  <input className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} required />
                </div>
                <div className="md:col-span-2">
                  <label className="eyebrow mb-2 block">Years of Experience</label>
                  <input type="number" min={0} max={60} className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} required />
                </div>
              </div>

              <div className="space-y-4 border-t border-border pt-6">
                <div className="eyebrow">Documents</div>
                {[
                  { k: "license_doc", l: "Driver's License" },
                  { k: "registration", l: "Vehicle Registration" },
                  { k: "insurance", l: "Insurance Certificate" },
                  { k: "background", l: "Background Check Consent" },
                ].map((d) => (
                  <div key={d.k} className="grid gap-2 md:grid-cols-[200px_1fr] md:items-center">
                    <div className="text-sm text-ink-muted">{d.l}</div>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setFiles({ ...files, [d.k]: e.target.files?.[0] ?? null })}
                      className="text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-foreground file:px-3 file:py-2 file:text-background file:cursor-pointer"
                    />
                  </div>
                ))}
              </div>

              <button disabled={submitting} className="w-full rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-[#E5E5E5] disabled:opacity-60 cursor-pointer">
                {submitting ? "Submitting…" : "Submit Application"}
              </button>
            </form>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
