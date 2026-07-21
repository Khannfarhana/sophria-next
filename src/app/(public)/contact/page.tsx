"use client";

import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageHero } from "@/components/site/PageHero";
import { SITE } from "@/lib/site-config";
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
      <PageHero
        eyebrow="Contact"
        title={<>We&apos;re <span className="text-gold-soft">listening.</span></>}
        sub="Available 24/7. Bookings answered within 30 minutes."
      />

      {/* Form + info */}
      <section className="bg-night px-6 py-20 text-white md:py-28">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_auto] lg:gap-12">
          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-5 rounded-sm bg-night-card p-8">
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">Name</label>
              <input
                className="w-full rounded-sm border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/40 transition focus:border-gold"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">Email</label>
                <input
                  type="email"
                  className="w-full rounded-sm border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/40 transition focus:border-gold"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">Phone</label>
                <input
                  className="w-full rounded-sm border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/40 transition focus:border-gold"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 (416) …"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">Message</label>
              <textarea
                rows={5}
                className="w-full rounded-sm border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/40 transition focus:border-gold"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
              />
            </div>
            <button
              disabled={submitting}
              className="w-full cursor-pointer rounded-sm bg-white py-3 text-sm font-medium text-black transition hover:bg-gold-soft disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send Message"}
            </button>
          </form>

          {/* Contact info + map */}
          <div className="flex w-full flex-col gap-5 md:w-72">
            <div className="rounded-sm bg-night-card p-7">
              <div className="space-y-5 text-sm">
                <div className="flex gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <address className="not-italic leading-relaxed text-white/70">
                    {SITE.address.line1}
                    <br />
                    {SITE.address.line2}
                    <br />
                    {SITE.address.country}
                  </address>
                </div>
                <div className="flex gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <a href={SITE.phoneHref} className="text-white/70 hover:text-gold-soft">{SITE.phone}</a>
                </div>
                <div className="flex gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <a href={SITE.emailHref} className="text-white/70 hover:text-gold-soft">{SITE.email}</a>
                </div>
              </div>
              <div className="mt-5 border-t border-white/10 pt-5 text-xs text-white/50">
                24/7 dispatch · Bookings answered within 30 min
              </div>
            </div>
            <div className="overflow-hidden rounded-sm bg-night-card">
              {MAPBOX_TOKEN ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Map of our Toronto service area"
                  width={600}
                  height={280}
                  loading="lazy"
                  style={{ display: "block", width: "100%", height: 280, objectFit: "cover" }}
                  src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/-79.3832,43.6532,10.5,0/600x280@2x?access_token=${MAPBOX_TOKEN}`}
                />
              ) : (
                <div className="flex h-[280px] items-center justify-center bg-night-card text-sm text-white/60">
                  Map unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
