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
      <section className="bg-[#0d0d0e] px-6 pb-16 pt-36 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/55">{SITE.fullName}</div>
          <h1 className="text-4xl font-light leading-[1.1] md:text-5xl">
            {title} <span className="text-[#e7d3a8]">{accent}</span>
          </h1>
          <p className="mt-5 text-sm text-white/60">{updated}</p>
          {intro && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">{intro}</p>}
        </div>
      </section>

      <section className="bg-background px-6 py-16">
        <div className="mx-auto max-w-3xl space-y-10">
          {sections.map((s) => (
            <div key={s.h}>
              <h2 className="text-lg font-medium text-foreground">{s.h}</h2>
              {s.p && s.p.length > 0 && (
                <div className="mt-3 space-y-3">
                  {s.p.map((para, i) => (
                    <p key={i} className="text-sm leading-relaxed text-ink-muted">{para}</p>
                  ))}
                </div>
              )}
              {s.li && s.li.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {s.li.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
                      <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="text-xs leading-relaxed text-ink-soft">
              {footnote ?? (
                <>
                  Questions about this policy? Contact{" "}
                  <a href={SITE.emailHref} className="font-medium text-foreground underline underline-offset-2">
                    {SITE.email}
                  </a>{" "}
                  or call{" "}
                  <a href={SITE.phoneHref} className="font-medium text-foreground underline underline-offset-2">
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
