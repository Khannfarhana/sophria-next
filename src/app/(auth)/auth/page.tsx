"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { getProviders, signIn } from "next-auth/react";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(1, "Password is required").max(72),
});

export default function AuthPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    if (!loading && user) router.push("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    let mounted = true;
    getProviders()
      .then((p) => { if (mounted) setGoogleEnabled(Boolean(p?.google)); })
      .catch(() => { if (mounted) setGoogleEnabled(false); });
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const v = signUpSchema.parse(form);
        const { error } = await supabase.auth.signUp({
          email: v.email,
          password: v.password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: v.fullName } },
        });
        if (error) throw error;
        const result = await signIn("credentials", { email: v.email, password: v.password, redirect: false });
        if (result?.error) throw new Error(result.error);
        toast.success("Account created — you're signed in.");
        router.push("/dashboard");
      } else {
        const v = signInSchema.parse(form);
        const result = await signIn("credentials", { email: v.email, password: v.password, redirect: false });
        if (result?.error) throw new Error(result.error || "Authentication failed");
        toast.success("Welcome back.");
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      const { ZodError } = await import("zod");
      if (err instanceof ZodError) {
        toast.error(err.issues[0]?.message ?? "Authentication failed");
      } else if (err instanceof Error) {
        toast.error(err.message || "Authentication failed");
      } else {
        toast.error("Authentication failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (!googleEnabled) { toast.error("Google sign-in is not configured."); return; }
    setBusy(true);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message || "Google auth failed.");
      } else {
        toast.error("Google auth failed.");
      }
      setBusy(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 transition focus:border-white/30 focus:outline-none";

  return (
    <div className="relative min-h-screen bg-[#0d0d0e] px-6 py-10 flex flex-col">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-white/[0.03] blur-3xl" />

      {/* Top bar */}
      <div className="relative flex items-center justify-between">
        <Link href="/" className="font-display text-2xl tracking-wide text-white">
          SophRia
        </Link>
        <Link href="/" className="flex items-center gap-1.5 text-xs text-white/40 transition hover:text-white/70">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </Link>
      </div>

      {/* Centered card */}
      <div className="relative mx-auto mt-16 w-full max-w-md flex-1">
        {/* Mode tabs */}
        <div className="mb-8 flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors cursor-pointer ${
                mode === m ? "bg-white text-black" : "text-white/50 hover:text-white/80"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
          <h1 className="mb-1 text-2xl font-light text-white">
            {mode === "signin" ? "Welcome back." : "Join SophRia."}
          </h1>
          <p className="mb-8 text-sm text-white/45">
            {mode === "signin" ? "Sign in to manage your bookings." : "Create your account to get started."}
          </p>

          {googleEnabled && (
            <>
              <button
                onClick={handleGoogle}
                disabled={busy}
                className="mb-4 w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.06] py-3 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-50"
              >
                Continue with Google
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-white/20">
                <div className="h-px flex-1 bg-white/10" /> or <div className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <input
                className={inputCls}
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            )}
            <input
              type="email"
              className={inputCls}
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              type="password"
              className={inputCls}
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <button
              disabled={busy}
              className="mt-2 w-full cursor-pointer rounded-sm bg-white py-3 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/25">
          By continuing you agree to our{" "}
          <Link href="/privacy" className="underline hover:text-white/50">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
