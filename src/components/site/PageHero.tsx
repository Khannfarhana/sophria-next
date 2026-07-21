import type { ReactNode } from "react";

/**
 * Shared dark hero header for public subpages. One H1 spec, one eyebrow spec,
 * one nav offset — edit here, not per page.
 */
export function PageHero({
  eyebrow,
  title,
  sub,
  narrow = false,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  /** Narrow column for text-heavy pages (FAQ, forms). */
  narrow?: boolean;
  /** Extra content below the subtitle (CTAs, meta). */
  children?: ReactNode;
}) {
  return (
    <section className="hero-offset relative overflow-hidden bg-night px-6 pb-20 text-white">
      {/* Faint gold glow keeps the dark header from reading as a flat slab. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_75%_-10%,rgba(201,167,106,0.10),transparent_60%)]"
      />
      <div className={`relative mx-auto ${narrow ? "max-w-3xl" : "max-w-7xl"}`}>
        <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/70">
          <span className="h-px w-8 bg-gold" aria-hidden />
          {eyebrow}
        </div>
        <h1 className="text-5xl font-light leading-[1.05] md:text-6xl">{title}</h1>
        {sub ? <p className="mt-5 max-w-xl text-base text-white/75">{sub}</p> : null}
        {children}
      </div>
    </section>
  );
}
