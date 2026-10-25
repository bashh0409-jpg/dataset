"use client";

import { useState } from "react";
import { FaGithub, FaGoogle } from "react-icons/fa6";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function InviteSignIn({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"google" | "github" | null>(null);

  const signIn = async (provider: "google" | "github") => {
    setError("");
    setLoading(provider);

    try {
      const supabase = createSupabaseBrowserClient();
      const next = `/invite/${token}`;
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (authError) throw authError;
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Unable to start sign-in. Please try again.",
      );
      setLoading(null);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7f7f5] px-5 py-16 text-[#171717]">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#202ded]">
          Majority®
        </p>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          You&apos;re invited
        </h1>
        <p className="mt-2 text-gray-600">
          Sign in with the email address this invitation was sent to in order to
          join the workspace.
        </p>
        <div className="mt-6 grid gap-3">
          <button
            className="flex min-h-12 items-center justify-center gap-3 rounded-lg border border-black/15 px-4 font-medium transition hover:bg-gray-50 disabled:opacity-60"
            disabled={loading !== null}
            onClick={() => void signIn("google")}
            type="button"
          >
            <FaGoogle aria-hidden="true" />
            {loading === "google" ? "Connecting..." : "Continue with Google"}
          </button>
          <button
            className="flex min-h-12 items-center justify-center gap-3 rounded-lg border border-black/15 px-4 font-medium transition hover:bg-gray-50 disabled:opacity-60"
            disabled={loading !== null}
            onClick={() => void signIn("github")}
            type="button"
          >
            <FaGithub aria-hidden="true" />
            {loading === "github" ? "Connecting..." : "Continue with GitHub"}
          </button>
        </div>
        {error && (
          <p
            aria-live="polite"
            className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
