"use client";

import { Check, Mail, UsersRound, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { createWorkspaceInvite } from "@/app/actions/onboarding";
import {
  getWorkspaceMembers,
  type WorkspaceMember,
} from "@/app/actions/workspaces";

type WorkspaceAccessDialogProps = {
  mode: "invite" | "manage";
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
};

export default function WorkspaceAccessDialog({
  mode,
  workspaceId,
  workspaceName,
  onClose,
}: WorkspaceAccessDialogProps) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(mode === "manage");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== "manage") return;

    let cancelled = false;
    void getWorkspaceMembers(workspaceId)
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setMembers(result.data);
      })
      .catch(() => {
        if (!cancelled) {
          setError("A network error occurred. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, workspaceId]);

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSentTo("");
    setSubmitting(true);

    try {
      const result = await createWorkspaceInvite({ workspaceId, email });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSentTo(result.data.email);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "invite" ? "Invite a teammate" : "Workspace members";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 px-4 py-8 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="workspace-access-title"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-[#e5e7eb] bg-white p-5 text-[#111827] shadow-xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {mode === "invite" ? (
                <Mail aria-hidden="true" className="size-4 text-[#667085]" />
              ) : (
                <UsersRound
                  aria-hidden="true"
                  className="size-4 text-[#667085]"
                />
              )}
              <h2
                className="text-[16px] font-semibold tracking-tight"
                id="workspace-access-title"
              >
                {title}
              </h2>
            </div>
            <p className="geist mt-2 text-xs font-medium leading-4 tracking-tight text-[#999]">
              {workspaceName}
            </p>
          </div>
          <button
            aria-label="Close dialog"
            className="rounded p-1 text-[#667085] transition hover:bg-[#f2f4f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3282ff]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        {mode === "invite" ? (
          <form className="mt-5" onSubmit={submitInvite}>
            <label className="block text-[13px] font-medium text-[#344054]">
              Email address
              <input
                autoFocus
                autoComplete="email"
                className="mt-1.5 block h-8 w-full rounded border border-[#d0d5dd] px-3 text-sm outline-none placeholder:text-[#98a2b3] focus:border-[#3282ff] focus:ring-2 focus:ring-[#3282ff]/20"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
                required
                type="email"
                value={email}
              />
            </label>

            <p className="geist mt-2 text-xs font-medium leading-4 tracking-tight text-[#999]">
              We&apos;ll email a single-use invitation that expires in 7 days
              and only works for this address.
            </p>
            {sentTo && (
              <div
                className="mt-4 flex items-start gap-2 rounded-lg border border-[#d1fadf] bg-[#f6fef9] p-3"
                role="status"
              >
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[#039855]"
                />
                <div>
                  <p className="text-[13px] font-medium text-[#027a48]">
                    Invitation email sent
                  </p>
                  <p className="mt-1 text-[12px] text-[#475467]">
                    We sent the invite to {sentTo}.
                  </p>
                </div>
              </div>
            )}
            {error && (
              <p className="mt-3 text-[13px] text-[#b42318]" role="alert">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                type="button"
                className="geist mt-4 text-lef justify-center item-center w-fit bg-transparent p-2 rounded  text-[13px] font-semibold leading-3 tracking-tight text-[#999] transition duration-400 hover:bg-black/6 cursor-pointer"
              >
                Close
              </button>

              <button
                disabled={submitting || !email.trim()}
                type="submit"
                className="geist disabled:cursor-not-allowed disabled:opacity-50  mt-4 text-lef justify-center item-center w-fit bg-black p-2 rounded  text-[13px] font-semibold leading-3 tracking-tight text-white transition duration-400 hover:bg-black/60 cursor-pointer"
              >
                {submitting
                  ? "Sending invitation..."
                  : sentTo
                    ? "Send another invite"
                    : "Send invitation"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5">
            {loading ? (
              <p className="py-8 text-center font-medium text-sm text-[#999]">
                Loading workspace members...
              </p>
            ) : error ? (
              <p
                className="rounded-md bg-[#fef3f2] px-3 py-2 text-[13px] text-[#b42318]"
                role="alert"
              >
                {error}
              </p>
            ) : members.length === 0 ? (
              <p className="py-8 text-center font-medium text-sm text-[#999]">
                No workspace members found.
              </p>
            ) : (
              <ul className="max-h-[min(55vh,420px)] divide-y divide-[#f2f4f7] overflow-y-auto">
                {members.map((member) => (
                  <li className="flex items-center gap-3 py-3" key={member.id}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#eff4ff] text-[12px] font-semibold uppercase text-[#3538cd]">
                      {(member.name || member.email || "?").slice(0, 1)}
                    </span>
                    
                    <div className="min-w-0 flex-1">
                    
                      <p className="geist text-left text-sm font-medium leading-4 tracking-tight ">
                        {member.name || member.email || "Workspace member"}
                      </p>
                      {member.name && (
                        <p className="geist text-left text-sm font-medium leading-4 tracking-tight text-[#999]">
                          {member.email ?? "No email address"}
                        </p>
                      )}
                    </div>

                    <p className="geist capitalize rounded-full px-2 py-1  bg-[#f2f4f7] max-w-xs text-left text-sm font-medium leading-4 tracking-tight text-[#999]">
                      {member.role}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button
                className="h-8 rounded-md border border-[#d0d5dd] px-3 text-[13px] font-medium text-[#344054] hover:bg-[#f9fafb]"
                onClick={onClose}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
