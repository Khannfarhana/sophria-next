import { SiteLayout } from "@/components/site/SiteLayout";
import { SITE } from "@/lib/site-config";

export interface LegalSection {
  h: string;
  /** Paragraphs. */
  p?: string[];
  /** Optional bullet list rendered after the paragraphs. */
  li?: string[];
}

/**
 * Shared shell for the legal pages, so the four of them stay visually and
 * structurally identical instead of drifting apart.
 */
export function LegalPage({
  title,
  accent,
  updated,
  intro,
  sections,
  footnote,
}: {
  /** First half of the heading, rendered plain. */
  title: string;
  /** Second half, rendered in the brand accent. */
  accent: string;
  /** Version or last-updated line. */
  updated: string;
  intro?: string;
  sections: LegalSection[];
  footnote?: React.ReactNode;
}) {
  return (
    <SiteLayout>
      <section className="hero-offset bg-night px-6 pb-16 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/70">
            <span className="h-px w-8 bg-gold" aria-hidden />
            {SITE.fullName}
          </div>
          <h1 className="text-4xl font-light leading-[1.1] md:text-5xl">
            {title} <span className="text-gold-soft">{accent}</span>
          </h1>
          <p className="mt-5 text-sm text-white/60">{updated}</p>
          {intro && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">{intro}</p>}
        </div>
      </section>

      <section className="bg-night px-6 py-16 text-white">
        <div className="mx-auto max-w-3xl space-y-10">
          {sections.map((s) => (
            <div key={s.h}>
              <h2 className="text-lg font-medium text-white">{s.h}</h2>
              {s.p && s.p.length > 0 && (
                <div className="mt-3 space-y-3">
                  {s.p.map((para, i) => (
                    <p key={i} className="text-sm leading-relaxed text-white/70">{para}</p>
                  ))}
                </div>
              )}
              {s.li && s.li.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {s.li.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-white/70">
                      <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <div className="rounded-sm bg-night-card p-5">
            <div className="text-xs leading-relaxed text-white/50">
              {footnote ?? (
                <>
                  Questions about this policy? Contact{" "}
                  <a href={SITE.emailHref} className="font-medium text-gold-soft underline underline-offset-2 hover:text-gold">
                    {SITE.email}
                  </a>{" "}
                  or call{" "}
                  <a href={SITE.phoneHref} className="font-medium text-gold-soft underline underline-offset-2 hover:text-gold">
                    {SITE.phone}
                  </a>
                  .
                </>
              )}
              <div className="mt-3 not-italic">
                {SITE.fullName} · {SITE.address.full}
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
