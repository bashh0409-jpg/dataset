"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaGithub, FaGoogle } from "react-icons/fa6";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SignInModalProps = {
  onClose: () => void;
  initialError?: string;
};

type Provider = "google" | "github";

const pillButton =
  "w-full flex items-center cursor-pointer justify-center gap-2 geist capitalize max-h-7 rounded border border-black/10 bg-black/[0.03] px-2 py-2 text-sm font-medium leading-4 tracking-tight text-[#333] [overflow-wrap:anywhere] transition hover:bg-black/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export default function SignInModal({
  onClose,
  initialError,
}: SignInModalProps) {
  const [error, setError] = useState(initialError ?? "");
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const signInWithProvider = async (provider: Provider) => {
    setError("");
    setLoadingProvider(provider);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) throw authError;
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to start sign-in. Please try again.",
      );
      setLoadingProvider(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white px-4 backdrop-blur-md">
      <section
        aria-labelledby="signin-title"
        aria-modal="true"
        className="relative w-full max-w-xs rounded-2xl bg-white/50 text-cente"
        role="dialog"
      >
        <h2
          id="signin-title"
          className="geist mb-2 text-left  text-xl font-semibold tracking-tighter text-black"
        >
          Sign in or create your profile
        </h2>

        <p className="geist hidde mx-auto text-left max-w-xs text-sm font-medium leading-4 tracking-tight text-[#999]">
          Sign in to access your workspace and manage your synthetic data
          projects.
        </p>

        {error && (
          <p
            aria-live="polite"
            className="geist mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium leading-4 tracking-tight text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex w-full geist flex-col items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void signInWithProvider("google")}
            disabled={loadingProvider !== null}
            aria-busy={loadingProvider === "google"}
            className={pillButton}
          >
            <FaGoogle aria-hidden="true" className="text-base" />
            {loadingProvider === "google" ? "Signing in..." : "Google"}
          </button>
          <button
            type="button"
            onClick={() => void signInWithProvider("github")}
            disabled={loadingProvider !== null}
            aria-busy={loadingProvider === "github"}
            className={pillButton}
          >
            <FaGithub aria-hidden="true" className="text-base" />
            {loadingProvider === "github" ? "Signing in..." : "GitHub"}
          </button>
        </div>

        <p className="geist text-left mx-auto mt-6 max-w-xs text-[13px] font-semibold leading-4 tracking-tight text-[#999]">
          By signing in, you agree to our{" "}
          <Link href="/legal" className="underline underline-offset-2">
            Terms and Privacy Policy
          </Link>
        </p>

        <button
          ref={cancelButtonRef}
          type="button"
          onClick={onClose}
          className="geist mt-4 text-left bg-black p-2 rounded  text-[13px] font-semibold leading-3 tracking-tight text-[#999] transition hover:text-white cursor-pointer"
        >
          Cancel
        </button>
      </section>
    </div>
  );
}
