"use client";

import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Mail, Phone, MapPin } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().min(1, "Required").max(2000),
});

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse(form);
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    setSubmitting(false);
    toast.success("Thank you. We'll be in touch shortly.");
    setForm({ name: "", email: "", phone: "", message: "" });
  };

  return (
    <SiteLayout>
      <section className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-5xl">
          <div className="eyebrow mb-6">Contact</div>
          <h1 className="text-5xl md:text-6xl font-light">We're listening.</h1>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-2">
          <form onSubmit={onSubmit} className="space-y-5 rounded-sm border border-border bg-card p-8">
            <div>
              <label className="eyebrow mb-2 block">Name</label>
              <input className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="eyebrow mb-2 block">Email</label>
                <input type="email" className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div>
                <label className="eyebrow mb-2 block">Phone</label>
                <input className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (416) …" />
              </div>
            </div>
            <div>
              <label className="eyebrow mb-2 block">Message</label>
              <textarea rows={5} className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
            </div>
            <button disabled={submitting} className="w-full rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-[#E5E5E5] disabled:opacity-60 cursor-pointer">
              {submitting ? "Sending…" : "Send Message"}
            </button>
          </form>

          <div className="space-y-8">
            <div className="rounded-sm border border-border bg-card p-8">
              <div className="space-y-5 text-sm">
                <div className="flex gap-3"><MapPin className="h-4 w-4 text-ink-muted" /><div>Toronto, Ontario<br />Canada</div></div>
                <div className="flex gap-3"><Phone className="h-4 w-4 text-ink-muted" />+1 (416) 555-0100</div>
                <div className="flex gap-3"><Mail className="h-4 w-4 text-ink-muted" />hello@sophria.com</div>
              </div>
              <div className="mt-6 border-t border-border pt-6 text-xs text-ink-soft">24/7 dispatch · Bookings answered within 30 minutes</div>
            </div>
            <div className="overflow-hidden rounded-sm border border-border bg-card">
              <iframe
                title="Toronto map"
                width="100%"
                height="300"
                style={{ border: 0, filter: "grayscale(1) invert(0.95)" }}
                loading="lazy"
                src="https://maps.google.com/maps?q=Toronto%2C%20Ontario%2C%20Canada&t=&z=12&ie=UTF8&iwloc=&output=embed"
              />
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
