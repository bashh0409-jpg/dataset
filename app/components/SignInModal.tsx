"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SignInModalProps = {
  onClose: () => void;
  initialError?: string;
};

type Provider = "google" | "github";

export default function SignInModal({
  onClose,
  initialError,
}: SignInModalProps) {
  const [error, setError] = useState(initialError ?? "");
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="signin-title"
        aria-modal="true"
        className="relative flex w-full max-w-sm flex-col rounded-2xl bg-white p-6 text-[#171717] shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="flex w-full items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">Sign In</h2>

          <button
            ref={closeButtonRef}
            aria-label="Close sign-in dialog"
            className="flex h-9 w-9 items-center justify-center rounded-full text-2xl text-gray-500 transition hover:bg-gray-100 hover:text-black"
            onClick={onClose}
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="24px"
              viewBox="0 -960 960 960"
              width="24px"
              fill="#202ded"
            >
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
            </svg>
          </button>
        </div>
        <p className="geist mt-2 text-sm tracking-tight font-medium leading-tight text-[#999]">
          Sign in to access your workspace and manage your synthetic data
          projects.
        </p>

        <div className="grid mt-4 gap-4">
          <button className="text-center flex justify-center w-full items-center gap-3 rounded bg-black/30 px-4 py-4 font-medium text-[#202ded]">
            <GoogleIcon />
            {loadingProvider === "google"
              ? "Connecting..."
              : "Continue with Google"}
          </button>
          <button className="text-center flex justify-center w-full items-center gap-3 rounded bg-black/30 px-4 py-4 font-medium text-[#202ded]">
            <GitHubIcon />
            {loadingProvider === "github"
              ? "Connecting..."
              : "Continue with GitHub"}
          </button>
        </div>

        {error && (
          <p
            aria-live="polite"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <p className=" pt-6 geist text-sm tracking-tight font-medium leading-tight text-[#999]">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </section>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 48 48">
      <path
        fill="currentColor"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"
      />
      <path
        fill="currentColor"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"
      />
      <path
        fill="currentColor"
        d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 17.9l6.8-5.2Z"
      />
      <path
        fill="currentColor"
        d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.5 19.5 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.3C14.2 15.6 18.7 12 24 12Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 .8a11.2 11.2 0 0 0-3.54 21.82c.56.1.76-.24.76-.54v-2.1c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.64-1.24-1.64-1.02-.7.08-.69.08-.69 1.12.08 1.71 1.15 1.71 1.15 1 1.7 2.62 1.21 3.26.92.1-.72.39-1.21.71-1.49-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.29-2.62 5.23-5.11 5.51.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" />
    </svg>
  );
}
