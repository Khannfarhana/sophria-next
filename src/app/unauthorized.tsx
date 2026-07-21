import Link from "next/link";

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-night px-6">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-white/[0.03] blur-3xl" />

      <div className="relative text-center max-w-md">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-400/70 mb-3">
          401
        </p>
        <h1 className="font-display text-3xl font-light text-white mb-3">
          Sign In Required
        </h1>
        <p className="text-sm text-white/40 mb-8 leading-relaxed">
          You need to be signed in to access this page. Please sign in or create
          an account to continue.
        </p>
        <Link
          href="/auth"
          className="inline-block rounded-xl bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/90"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
