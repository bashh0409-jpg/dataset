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
  "geist mt-2 max-h-9 w-full rounded border border-black/10 bg-black/[0.03] px-3 py-2 text-sm font-semibold leading-4 tracking-tight text-[#333] outline-none transition  focus:bg-black/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const actionButtonClass =
  "geist mt-5 w-full cursor-pointer rounded bg-black px-3 py-2 text-sm font-semibold leading-4 tracking-tight text-white transition duration-300 hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

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
  const stepNumber = {
    name: 1,
    workspace: 2,
    invite: 3,
    complete: 3,
  }[step];

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
    <main className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-white px-4 py-10 text-black backdrop-blur-md">
      {" "}
      <p className="geist absolute right-4 top-5 text-sm font-medium leading-4 tracking-tight text-[#999]">
        Step {stepNumber} of 3
      </p>
      <section className="relative w-full max-w-xs rounded-2xl bg-white/50">
        <div
          className="mb-6 flex hidden gap-1.5"
          aria-label="Onboarding progress"
        >
          {(["name", "workspace", "invite"] as const).map((item, index) => (
            <span
              key={item}
              aria-label={`Step ${index + 1}${step === item ? ", current" : ""}`}
              className={`h-1 flex-1  rounded ${
                ["name", "workspace", "invite", "complete"].indexOf(step) >=
                index
                  ? "bg-black"
                  : "bg-black/10"
              }`}
            />
          ))}
        </div>

        {step === "name" && (
          <form onSubmit={submitName}>
            <h1 className="geist mt-1 hidden text-xl font-semibold tracking-tighter">
              What should we call you?
            </h1>
            <p className="geist text-sm mb-2 font-medium leading-4 tracking-tight text-[#999]">
              What should we call you? This name will appear on your profile.
            </p>

            <input
              autoComplete="name"
              className={inputClass}
              id="display-name"
              maxLength={80}
              placeholder="John Smith"
              onChange={(event) => setDisplayName(event.target.value)}
              required
              value={displayName}
            />
            <ContinueButton />
          </form>
        )}

        {step === "workspace" && (
          <form onSubmit={submitWorkspace}>
            <p className="geist mt-1 text-sm font-medium leading-4 tracking-tight text-[#999]">
              Create your workspace. A shared home for your schemas and
              generated datasets.
            </p>

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
          <form onSubmit={submitInvite}>
            <p className="geist mt-1 mb-2 text-sm font-medium leading-4 tracking-tight text-[#999]">
              Invite someone to join. Create a private invite link for a
              teammate. You can share it with them directly.
            </p>
           
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
              className="geist mt-3 w-full cursor-pointer rounded px-3 py-2 text-xs font-semibold leading-4 tracking-tight text-[#777] transition hover:bg-black/[0.05] hover:text-black"
              onClick={() => setStep("complete")}
              type="button"
            >
              I&apos;ll do this later
            </button>
          </form>
        )}

        {step === "complete" && (
          <div>
            
            <p className="geist mt-2 text-sm font-medium leading-4 tracking-tight text-[#999]">
              {inviteUrl
                ? "Share this one-time link with your teammate. It expires in 7 days and can only be used by the invited email address."
                : "You can invite teammates from your workspace later."}
            </p>
            {inviteUrl && (
              <div className="mt-2">
               
                <input
                  className={`${inputClass} text-sm`}
                  id="invite-link"
                  readOnly
                  value={inviteUrl}
                />
                <button
                  className="geist mt-3 w-full cursor-pointer rounded border border-black/10 bg-black/[0.03] px-3 py-2 text-sm font-medium leading-4 tracking-tight text-[#333] transition hover:bg-black/[0.06]"
                  onClick={() => void copyInvite()}
                  type="button"
                >
                  {copied ? "Copied" : "Copy invite link"}
                </button>
              </div>
            )}
            <button
              className={actionButtonClass}
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
            className="geist mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium leading-4 tracking-tight text-red-700"
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
      className={actionButtonClass}
      disabled={busy}
      type="submit"
    >
      {busy ? "Please wait..." : label}
    </button>
  );
}
