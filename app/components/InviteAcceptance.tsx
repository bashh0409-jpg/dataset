"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptWorkspaceInvite } from "@/app/actions/onboarding";

export default function InviteAcceptance({
  token,
  workspaceName,
}: {
  token: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);

  const acceptInvite = async () => {
    setError("");
    setAccepting(true);

    try {
      const result = await acceptWorkspaceInvite(token);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.replace("/workspace");
      router.refresh();
    } catch {
      setError("Unable to accept this invitation. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7f7f5] px-5 text-[#171717]">
      <section
        aria-labelledby="invite-accept-title"
        className="w-full max-w-md rounded-2xl p-8"
      >
        <h1
          className="geist mb-2 text-left text-xl font-semibold tracking-tighter text-black"
          id="invite-accept-title"
        >
          Join {workspaceName}
        </h1>

        <p className="geist max-w-xs text-left text-sm font-medium leading-4 tracking-tight text-[#999]">
          You were invited to join this workspace. Accept the invitation to
          continue.
        </p>

        {error && (
          <p
            className="geist mt-4 max-w-xs text-sm font-medium text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          className="geist mt-6 rounded bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={accepting}
          onClick={() => void acceptInvite()}
          type="button"
        >
          {accepting ? "Accepting..." : "Accept invitation"}
        </button>
      </section>
    </main>
  );
}
