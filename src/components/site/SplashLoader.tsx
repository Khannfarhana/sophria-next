"use client";

import { useEffect, useState } from "react";

const SPLASH_KEY = "sophria-splash-shown";
/** How long the intro plays before fading (ms). */
const HOLD_MS = 2400;
const REDUCED_HOLD_MS = 900;
const FADE_MS = 700;

/**
 * Branded intro loader: the limousine draws itself in silver line-art over
 * night black, the serif wordmark rises beneath it, then the overlay fades to
 * reveal the page. Plays once per browser session.
 */
export function SplashLoader() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SPLASH_KEY)) return;
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      return; // no storage → skip rather than replay on every navigation
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const showTimer = setTimeout(() => setVisible(true), 0);
    const hold = reduced ? REDUCED_HOLD_MS : HOLD_MS;
    const exitTimer = setTimeout(() => setExiting(true), hold);
    const doneTimer = setTimeout(() => setVisible(false), hold + FADE_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-night px-6 transition-opacity duration-700 ${
        exiting ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* Faint gold ambience, same motif as the page heroes */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_38%,rgba(201,167,106,0.10),transparent_65%)]" />

      <svg
        viewBox="0 0 640 220"
        fill="none"
        className="relative w-[min(80vw,520px)]"
      >
        <defs>
          <linearGradient id="splash-silver" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fafafa" />
            <stop offset="1" stopColor="#77777c" />
          </linearGradient>
        </defs>
        <g
          stroke="url(#splash-silver)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Stretch-limousine silhouette */}
          <path
            className="splash-draw"
            pathLength={1}
            d="M28 170 H96 A30 30 0 0 1 156 170 H468 A30 30 0 0 1 528 170 H600
               C610 170 616 164 614 156 L610 148 C606 138 596 132 580 128
               L490 118 C478 104 462 96 440 94 L220 94 C200 94 186 98 172 106
               L128 132 C96 136 64 140 48 144 C34 148 28 156 28 164 Z"
          />
          <circle className="splash-draw delay-300" pathLength={1} cx="126" cy="170" r="19" />
          <circle className="splash-draw delay-400" pathLength={1} cx="498" cy="170" r="19" />
          {/* Beltline + door seams */}
          <g strokeWidth="2" opacity="0.55">
            <path className="splash-draw delay-500" pathLength={1} d="M186 112 H462" />
            <path className="splash-draw delay-500" pathLength={1} d="M262 94 V112 M338 94 V112 M414 94 V112" />
          </g>
        </g>
      </svg>

      <div className="relative mt-2 text-center">
        <div className="animate-rise delay-400 font-display text-4xl tracking-wide text-white md:text-5xl">
          Soph<span className="text-gold-soft">Ria</span>
        </div>
        <div className="animate-rise delay-600 mt-4 flex items-center justify-center gap-4">
          <span className="h-px w-10 bg-gold/60 md:w-16" />
          <span className="text-[0.65rem] uppercase tracking-[0.45em] text-white/75 md:text-xs">
            Limousine Services
          </span>
          <span className="h-px w-10 bg-gold/60 md:w-16" />
        </div>
      </div>
    </div>
  );
}
