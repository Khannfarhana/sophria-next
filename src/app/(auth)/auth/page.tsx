"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const v = signUpSchema.parse(form);
        
        // 1. Register user in Supabase
        const { error: signUpError } = await supabase.auth.signUp({
          email: v.email,
          password: v.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: v.fullName },
          },
        });
        if (signUpError) throw signUpError;

        // 2. Automatically log in using NextAuth
        const result = await signIn("credentials", {
          email: v.email,
          password: v.password,
          redirect: false,
        });

        if (result?.error) {
          throw new Error(result.error);
        }

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

  return (
    <SiteLayout>
      <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16 bg-background">
        <div className="w-full max-w-md rounded-sm border border-border bg-card p-10">
          <div className="eyebrow mb-3">{mode === "signin" ? "Sign in" : "Create account"}</div>
          <h1 className="mb-8 text-3xl font-light">{mode === "signin" ? "Welcome back" : "Join SophRia"}</h1>

          <button onClick={handleGoogle} disabled={busy} className="mb-4 w-full rounded-sm border border-border bg-background py-3 text-sm hover:bg-accent disabled:opacity-60 cursor-pointer">
            Continue with Google
          </button>
          <div className="my-4 flex items-center gap-3 text-xs text-ink-soft">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <input
                className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            )}
            <input
              type="email"
              className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              type="password"
              className="w-full rounded-sm border bg-input p-3 text-sm text-foreground focus:border-foreground"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <button disabled={busy} className="w-full rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-[#E5E5E5] disabled:opacity-60 cursor-pointer">
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-ink-muted">
            {mode === "signin" ? (
              <>
                New to SophRia?{" "}
                <button onClick={() => setMode("signup")} className="text-foreground underline cursor-pointer">
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => setMode("signin")} className="text-foreground underline cursor-pointer">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
