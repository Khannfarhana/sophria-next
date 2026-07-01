import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0e] px-6">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-red-500/[0.04] blur-3xl" />

      <div className="relative text-center max-w-md">
        <p className="text-sm font-medium uppercase tracking-widest text-red-400/70 mb-3">
          403
        </p>
        <h1 className="font-display text-3xl font-light text-white mb-3">
          Access Denied
        </h1>
        <p className="text-sm text-white/40 mb-8 leading-relaxed">
          You don&apos;t have permission to view this page. If you believe this
          is an error, please contact your administrator.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-xl border border-white/10 bg-white/[0.06] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
