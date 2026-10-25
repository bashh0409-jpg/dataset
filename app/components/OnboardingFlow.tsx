"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createOnboardingWorkspace,
  createWorkspaceInvite,
} from "@/app/actions/onboarding";

type OnboardingFlowProps = {
  initialName: string;
};

type Step = "name" | "workspace" | "invite" | "complete";

const inputClass =
  "mt-2 w-full rounded-lg border border-black/15 bg-white px-4 py-3 text-base outline-none transition focus:border-[#202ded] focus:ring-2 focus:ring-[#202ded]/15";

export default function OnboardingFlow({ initialName }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [displayName, setDisplayName] = useState(initialName);
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submitName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!displayName.trim()) {
      setError("Enter your name to continue.");
      return;
    }
    setError("");
    setStep("workspace");
  };

  const submitWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const result = await createOnboardingWorkspace({
        displayName,
        workspaceName,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setWorkspaceId(result.data.workspaceId);
      setStep("invite");
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const result = await createWorkspaceInvite({ workspaceId, email });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setInviteUrl(`${window.location.origin}/invite/${result.data.token}`);
      setStep("complete");
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setError("Couldn't copy the link. Select and copy it manually.");
    }
  };

  return (
    <main className="min-h-svh bg-[#f7f7f5] px-5 pb-16 pt-28 text-[#171717] md:px-12">
      <section className="mx-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#202ded]">
          Majority®
        </p>
        <div className="mt-8 flex gap-2" aria-label="Onboarding progress">
          {(["name", "workspace", "invite"] as const).map((item, index) => (
            <span
              key={item}
              aria-label={`Step ${index + 1}${step === item ? ", current" : ""}`}
              className={`h-1.5 flex-1 rounded-full ${
                ["name", "workspace", "invite", "complete"].indexOf(step) >= index
                  ? "bg-[#202ded]"
                  : "bg-black/10"
              }`}
            />
          ))}
        </div>

        {step === "name" && (
          <form className="mt-8" onSubmit={submitName}>
            <p className="text-sm font-medium text-gray-500">Step 1 of 3</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              What should we call you?
            </h1>
            <p className="mt-2 text-gray-600">
              This name will appear on your profile.
            </p>
            <label className="mt-6 block text-sm font-medium" htmlFor="display-name">
              Your name
            </label>
            <input
              autoComplete="name"
              className={inputClass}
              id="display-name"
              maxLength={80}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              value={displayName}
            />
            <ContinueButton />
          </form>
        )}

        {step === "workspace" && (
          <form className="mt-8" onSubmit={submitWorkspace}>
            <p className="text-sm font-medium text-gray-500">Step 2 of 3</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Create your workspace
            </h1>
            <p className="mt-2 text-gray-600">
              A shared home for your schemas and generated datasets.
            </p>
            <label className="mt-6 block text-sm font-medium" htmlFor="workspace-name">
              Workspace name
            </label>
            <input
              autoComplete="organization"
              className={inputClass}
              id="workspace-name"
              maxLength={80}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder={`${displayName.trim() || "My"} workspace`}
              required
              value={workspaceName}
            />
            <ContinueButton busy={busy} label="Create workspace" />
          </form>
        )}

        {step === "invite" && (
          <form className="mt-8" onSubmit={submitInvite}>
            <p className="text-sm font-medium text-gray-500">Step 3 of 3</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Invite someone to join
            </h1>
            <p className="mt-2 text-gray-600">
              Create a private invite link for a teammate. You can share it with
              them directly.
            </p>
            <label className="mt-6 block text-sm font-medium" htmlFor="invite-email">
              Teammate&apos;s email
            </label>
            <input
              autoComplete="email"
              className={inputClass}
              id="invite-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@example.com"
              required
              type="email"
              value={email}
            />
            <ContinueButton busy={busy} label="Create invite link" />
            <button
              className="mt-3 w-full rounded-lg px-4 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              onClick={() => setStep("complete")}
              type="button"
            >
              I&apos;ll do this later
            </button>
          </form>
        )}

        {step === "complete" && (
          <div className="mt-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              {inviteUrl ? "Your workspace is ready" : "Workspace created"}
            </h1>
            <p className="mt-2 text-gray-600">
              {inviteUrl
                ? "Share this one-time link with your teammate. It expires in 7 days and can only be used by the invited email address."
                : "You can invite teammates from your workspace later."}
            </p>
            {inviteUrl && (
              <div className="mt-6">
                <label className="block text-sm font-medium" htmlFor="invite-link">
                  Invite link
                </label>
                <input
                  className={`${inputClass} text-sm`}
                  id="invite-link"
                  readOnly
                  value={inviteUrl}
                />
                <button
                  className="mt-3 w-full rounded-lg border border-black/15 px-4 py-3 font-medium transition hover:bg-gray-50"
                  onClick={() => void copyInvite()}
                  type="button"
                >
                  {copied ? "Copied" : "Copy invite link"}
                </button>
              </div>
            )}
            <button
              className="mt-6 w-full rounded-lg bg-[#202ded] px-4 py-3 font-medium text-white transition hover:bg-[#1924c8]"
              onClick={() => router.replace("/workspace")}
              type="button"
            >
              Go to workspace
            </button>
          </div>
        )}

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

function ContinueButton({
  busy = false,
  label = "Continue",
}: {
  busy?: boolean;
  label?: string;
}) {
  return (
    <button
      className="mt-6 w-full rounded-lg bg-[#202ded] px-4 py-3 font-medium text-white transition hover:bg-[#1924c8] disabled:cursor-wait disabled:opacity-60"
      disabled={busy}
      type="submit"
    >
      {busy ? "Please wait..." : label}
    </button>
  );
}
