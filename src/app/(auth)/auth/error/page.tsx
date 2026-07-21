"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";

function ErrorCard() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  let title = "Authentication Error";
  let errorMessage = "An unexpected authentication error occurred. Please try again.";

  if (error === "Configuration") {
    title = "System Configuration Error";
    errorMessage = "There is a setup issue on the server (e.g. missing credentials or database connection). Please contact support.";
  } else if (error === "AccessDenied") {
    title = "Access Denied";
    errorMessage = "You do not have the required permissions or roles to log into this portal.";
  } else if (error === "Verification") {
    title = "Link Expired";
    errorMessage = "The login verification link has expired or has already been used. Please request a new one.";
  } else if (error === "OAuthSignin" || error === "OAuthCallbackError" || error === "OAuthCreateAccountError") {
    title = "OAuth Connection Failed";
    errorMessage = "Failed to connect with your Google account. This can happen if your email is registered under a different login method.";
  } else if (error === "EmailSignin") {
    title = "Verification Failed";
    errorMessage = "The e-mail sign-in link could not be sent. Please check the email address and try again.";
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm text-center">
      <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-red-950/30 border border-red-500/20 text-red-400">
        <AlertTriangle className="h-6 w-6" />
      </div>

      <h1 className="mb-2 text-2xl font-light text-white font-display">
        {title}
      </h1>
      
      <p className="mb-8 text-sm text-white/50 leading-relaxed max-w-sm mx-auto">
        {errorMessage}
      </p>

      <Link
        href="/auth"
        className="inline-flex w-full items-center justify-center rounded-lg bg-white py-3 text-sm font-medium text-black transition hover:bg-white/90 cursor-pointer"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="relative min-h-screen bg-night px-6 py-10 flex flex-col justify-center">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-white/[0.03] blur-3xl" />

      {/* Top bar */}
      <div className="absolute top-10 left-6 right-6 flex items-center justify-between">
        <Link href="/" className="font-display text-2xl tracking-wide text-white">
          SophRia
        </Link>
      </div>

      {/* Centered card */}
      <div className="relative mx-auto w-full max-w-md">
        <Suspense fallback={
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm text-center text-white/40">
            Loading error details…
          </div>
        }>
          <ErrorCard />
        </Suspense>
      </div>
    </div>
  );
}
