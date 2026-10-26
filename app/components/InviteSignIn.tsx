"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FaGithub, FaGoogle } from "react-icons/fa6";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Provider = "google" | "github";
type EmailStep = "closed" | "email" | "sent";

const pillButton =
  "flex max-h-7 w-full cursor-pointer items-center justify-center gap-2 rounded border border-black/10 bg-black/[0.03] px-2 py-2 text-sm font-medium leading-4 tracking-tight text-[#333] transition duration-300 hover:bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export default function InviteSignIn({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState<
    Provider | "email" | null
  >(null);
  const [emailStep, setEmailStep] = useState<EmailStep>("closed");
  const [email, setEmail] = useState("");

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`;

  const signInWithProvider = async (provider: Provider) => {
    setError("");
    setLoadingAction(provider);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectTo() },
      });
      if (authError) throw authError;
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
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
        options: { emailRedirectTo: redirectTo() },
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
    <main className="fixed inset-0 z-[100] flex items-center justify-center bg-white px-4 text-black backdrop-blur-md">
      <section
        aria-labelledby="invite-signin-title"
        aria-modal="true"
        className="relative w-full max-w-xs rounded-2xl bg-white/50"
        role="dialog"
      >
        <h1
          className="geist mb-2 text-left text-xl font-semibold tracking-tighter text-black"
          id="invite-signin-title"
        >
          Sign in or Create your profile
        </h1>

        <p className="geist max-w-xs text-left text-sm font-medium leading-4 tracking-tight text-[#999]">
          Sign in with the email address this invitation was sent to, then
          you&apos;ll join the workspace.
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
          <div className="geist mt-6 flex w-full flex-col items-center justify-center gap-2">
            <button
              aria-busy={loadingAction === "google"}
              className={pillButton}
              disabled={loadingAction !== null}
              onClick={() => void signInWithProvider("google")}
              type="button"
            >
              <FaGoogle aria-hidden="true" className="text-base" />
              {loadingAction === "google" ? "Signing in..." : "Google"}
            </button>
            <button
              aria-busy={loadingAction === "github"}
              className={pillButton}
              disabled={loadingAction !== null}
              onClick={() => void signInWithProvider("github")}
              type="button"
            >
              <FaGithub aria-hidden="true" className="text-base" />
              {loadingAction === "github" ? "Signing in..." : "GitHub"}
            </button>
            <button
              className={pillButton}
              disabled={loadingAction !== null}
              onClick={() => {
                setError("");
                setEmailStep("email");
              }}
              type="button"
            >
              Use Email
            </button>
          </div>
        )}

        {emailStep === "email" && (
          <form className="mt-4 flex flex-col gap-2" onSubmit={sendEmailLink}>
            <label className="sr-only" htmlFor="invite-signin-email">
              Email address
            </label>
            <input
              autoComplete="email"
              className="geist w-full rounded border border-black/10 bg-white px-3 py-1 text-[16px] font-medium tracking-tight text-[#333] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              id="invite-signin-email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="example@mail.com"
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
            <button
              className="geist w-full rounded px-2 py-1.5 text-xs font-medium text-[#777] transition hover:bg-black/[0.05] hover:text-black"
              onClick={() => {
                setError("");
                setEmailStep("closed");
              }}
              type="button"
            >
              Back to sign-in options
            </button>
          </form>
        )}

        {emailStep === "sent" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="geist max-w-xs text-left text-sm font-medium leading-4 tracking-tight text-[#999]">
              Check your inbox for a sign-in link sent to <strong>{email}</strong>.
              Use the same address this invitation was sent to.
            </p>
            <button
              className={pillButton}
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

        <p className="geist mx-auto mt-6 max-w-xs text-left text-[13px] font-semibold leading-4 tracking-tight text-[#999]">
          By signing in, you agree to our{" "}
          <Link className="underline underline-offset-2" href="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="underline underline-offset-2" href="/privacy">
            Privacy Policy
          </Link>
        </p>
      </section>
    </main>
  );
}
