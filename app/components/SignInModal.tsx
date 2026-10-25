"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { FaGithub, FaGoogle } from "react-icons/fa6";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SignInModalProps = {
  onClose: () => void;
  initialError?: string;
  redirectPath?: string;
};

type Provider = "google" | "github";

const pillButton =
  "w-full flex items-center cursor-pointer duration-400 justify-center gap-2 geist capitaliz max-h-7 rounded border border-black/10 bg-black/[0.03] px-2 py-2 text-sm font-medium leading-4 tracking-tight text-[#333] [overflow-wrap:anywhere] transition hover:bg-black/20 transition-color focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export default function SignInModal({
  onClose,
  initialError,
  redirectPath = "/onboarding",
}: SignInModalProps) {
  const [error, setError] = useState(initialError ?? "");
  const [loadingAction, setLoadingAction] = useState<
    Provider | "email" | null
  >(null);
  const [emailStep, setEmailStep] = useState<"closed" | "email" | "sent">(
    "closed",
  );
  const [email, setEmail] = useState("");
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
    setLoadingAction(provider);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
        },
      });

      if (authError) throw authError;
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to start sign-in. Please try again.",
      );
      setLoadingAction(null);
    }
  };

  const sendEmailLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoadingAction("email");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
        },
      });

      if (authError) throw authError;
      setEmailStep("sent");
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to send a sign-in link. Please try again.",
      );
    } finally {
      setLoadingAction(null);
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
          Sign in or Create your profile
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

        {emailStep === "closed" && (
          <div className="mt-6 flex w-full geist flex-col items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void signInWithProvider("google")}
              disabled={loadingAction !== null}
              aria-busy={loadingAction === "google"}
              className={pillButton}
            >
              <FaGoogle aria-hidden="true" className="text-base" />
              {loadingAction === "google" ? "Signing in..." : "Google"}
            </button>
            <button
              type="button"
              onClick={() => void signInWithProvider("github")}
              disabled={loadingAction !== null}
              aria-busy={loadingAction === "github"}
              className={pillButton}
            >
              <FaGithub aria-hidden="true" className="text-base" />
              {loadingAction === "github" ? "Signing in..." : "GitHub"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setEmailStep("email");
              }}
              disabled={loadingAction !== null}
              className={pillButton}
            >
              Use Email
            </button>
          </div>
        )}

        {emailStep === "email" && (
          <form className="mt-4 flex flex-col gap-2" onSubmit={sendEmailLink}>
            <label className="sr-only" htmlFor="signin-email">
              Email address
            </label>
            <input
              autoComplete="email"
              className="geist w-full rounded font-semibold border border-black/10 bg-white px-3 py-1 text-sm text-[#333] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              id="signin-email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            <button
              aria-busy={loadingAction === "email"}
              className={pillButton}
              disabled={loadingAction !== null}
              type="submit"
            >
              {loadingAction === "email"
                ? "Sending link..."
                : "Send sign-in link"}
            </button>
          </form>
        )}

        {emailStep === "sent" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="geist hidde mx-auto text-left max-w-xs text-sm font-medium leading-4 tracking-tight text-[#999]">
              Check your inbox for a sign-in link sent to <strong>{email}</strong>.
              Open the link to finish signing in.
            </p>
            <button
              className={pillButton}
              disabled={loadingAction !== null}
              onClick={() => {
                setError("");
                setEmailStep("email");
              }}
              type="button"
            >
              Use a different email
            </button>
          </div>
        )}

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
          className="geist mt-4 text-lef justify-center item-center w-full bg-black p-2 rounded  text-[13px] font-semibold leading-3 tracking-tight text-white transition duration-400 hover:bg-black/60 cursor-pointer"
        >
          Cancel
        </button>
      </section>
    </div>
  );
}
