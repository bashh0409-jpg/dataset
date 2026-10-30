"use client";

import { Mail, UsersRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createWorkspaceInvite } from "@/app/actions/onboarding";
import {
  getWorkspaceCreditBalance,
  getWorkspaceDoublePremiumCreditCost,
  setWorkspaceDoublePremiumCreditCost,
} from "@/app/actions/workspace-credits";
import {
  getWorkspaceMembers,
  type WorkspaceMember,
} from "@/app/actions/workspaces";

type WorkspaceAccessDialogProps = {
  mode: "invite" | "manage";
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  creditPurchaseStatus: "success" | "return" | "processing" | null;
  onClose: () => void;
};

type WorkspaceCreditResult = Awaited<
  ReturnType<typeof getWorkspaceCreditBalance>
>;
type WorkspaceMembersResult = Awaited<ReturnType<typeof getWorkspaceMembers>>;

export default function WorkspaceAccessDialog({
  mode,
  workspaceId,
  workspaceName,
  isOwner,
  creditPurchaseStatus,
  onClose,
}: WorkspaceAccessDialogProps) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(mode === "manage");
  const [submitting, setSubmitting] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditError, setCreditError] = useState("");
  const [creditLoading, setCreditLoading] = useState(mode === "manage");
  const [doubleCreditCostState, setDoubleCreditCostState] = useState<{
    workspaceId: string;
    enabled: boolean | null;
    loading: boolean;
    error: string;
  }>({
    workspaceId,
    enabled: null,
    loading: mode === "manage" && isOwner,
    error: "",
  });
  const [doubleCreditCostSaving, setDoubleCreditCostSaving] = useState(false);
  const initialLoadsRef = useRef(
    new Map<
      string,
      Promise<[WorkspaceCreditResult, WorkspaceMembersResult]>
    >(),
  );

  const refreshCredits = async () => {
    setCreditLoading(true);
    setCreditError("");
    try {
      const result = await getWorkspaceCreditBalance(workspaceId);
      if ("error" in result) {
        setCreditError(result.error);
        return;
      }
      setCreditBalance(result.data.balance);
    } catch {
      setCreditError("Unable to load workspace credits. Please try again.");
    } finally {
      setCreditLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== "manage") return;

    let cancelled = false;
    let request = initialLoadsRef.current.get(workspaceId);
    if (!request) {
      request = Promise.all([
        getWorkspaceCreditBalance(workspaceId),
        getWorkspaceMembers(workspaceId),
      ]);
      initialLoadsRef.current.set(workspaceId, request);
      const requestToClear = request;
      void request.then(
        () => {
          if (initialLoadsRef.current.get(workspaceId) === requestToClear) {
            initialLoadsRef.current.delete(workspaceId);
          }
        },
        () => {
          if (initialLoadsRef.current.get(workspaceId) === requestToClear) {
            initialLoadsRef.current.delete(workspaceId);
          }
        },
      );
    }

    void request
      .then(([creditResult, membersResult]) => {
        if (cancelled) return;
        if ("error" in creditResult) {
          setCreditError(creditResult.error);
        } else {
          setCreditBalance(creditResult.data.balance);
        }
        if ("error" in membersResult) {
          setError(membersResult.error);
        } else {
          setMembers(membersResult.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCreditError("Unable to load workspace details. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCreditLoading(false);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, workspaceId]);

  useEffect(() => {
    if (mode !== "manage" || !isOwner) return;

    let cancelled = false;
    void getWorkspaceDoublePremiumCreditCost(workspaceId)
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setDoubleCreditCostState({
            workspaceId,
            enabled: null,
            loading: false,
            error: result.error,
          });
          return;
        }
        setDoubleCreditCostState({
          workspaceId,
          enabled: result.data.enabled,
          loading: false,
          error: "",
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDoubleCreditCostState({
            workspaceId,
            enabled: null,
            loading: false,
            error: "Unable to load the premium credit setting. Please try again.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOwner, mode, workspaceId]);

  const settingForWorkspace =
    doubleCreditCostState.workspaceId === workspaceId
      ? doubleCreditCostState
      : null;
  const doubleCreditCost = settingForWorkspace?.enabled ?? null;
  const doubleCreditCostLoading = settingForWorkspace?.loading ?? true;
  const doubleCreditCostError = settingForWorkspace?.error ?? "";

  const toggleDoubleCreditCost = async () => {
    if (doubleCreditCost === null || doubleCreditCostSaving) return;
    setDoubleCreditCostSaving(true);
    try {
      const result = await setWorkspaceDoublePremiumCreditCost(
        workspaceId,
        !doubleCreditCost,
      );
      if ("error" in result) {
        setDoubleCreditCostState((current) =>
          current.workspaceId === workspaceId
            ? { ...current, error: result.error }
            : current,
        );
        return;
      }
      setDoubleCreditCostState((current) =>
        current.workspaceId === workspaceId
          ? { ...current, enabled: result.data.enabled, error: "" }
          : current,
      );
    } catch {
      setDoubleCreditCostState((current) =>
        current.workspaceId === workspaceId
          ? {
              ...current,
              error:
                "Unable to update the premium credit setting. Please try again.",
            }
          : current,
      );
    } finally {
      setDoubleCreditCostSaving(false);
    }
  };

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
        className="w-full max-w-sm rounded-3xl bg-white px-4 pt-4 text-[#111827] shadow-xl"
        role="dialog"
      >
        <header className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {mode === "invite" ? (
                <Mail
                  aria-hidden="true"
                  className="size-4 hidden text-[#667085]"
                />
              ) : (
                <UsersRound
                  aria-hidden="true"
                  className="size-4 hidden text-[#667085]"
                />
              )}
              <h2
                className="text-[16px] hidden font-semibold tracking-tight"
                id="workspace-access-title"
              >
                {title}
              </h2>
            </div>
            <p className="geist text-sm font-medium leading-4 tracking-tight text-[#999]">
              {workspaceName}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {mode === "manage" && isOwner && (
              <form
                action="/api/billing/workspace-credits/checkout"
                method="post"
              >
                <input name="workspace_id" type="hidden" value={workspaceId} />
                <button
                  className="rounded-md bg-black px-3 py-1 text-[12px] font-semibold text-white transition hover:bg-black/70"
                  type="submit"
                >
                  Refill
                </button>
              </form>
            )}
          </div>
        </header>

        {mode === "invite" ? (
          <form className="mt-2" onSubmit={submitInvite}>
            <label className="block text-[13px] font-medium text-[#344054]">
              <input
                autoFocus
                autoComplete="email"
                className="mt-4 block h-8 w-full rounded border border-[#d0d5dd] px-3 text-sm outline-none placeholder:text-[#98a2b3] focus:border-[#3282ff] focus:ring-2 focus:ring-[#3282ff]/20"
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
                className="mt-4 flex items-start gap-2 rounded-lg border border-[#d1fadf] bg-[#f6fef9] p-1 px-2"
                role="status"
              >
                <div>
                  <p className="text-[13px] tracking-tight font-semibold text-[#027a48]">
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
            <div className="mt-2 mb-2 flex justify-end gap-2">
              <button
                onClick={onClose}
                type="button"
                className="geist mt-4 text-lef justify-center item-center w-fit bg-transparent p-2 rounded  text-[13px] font-semibold leading-3 tracking-tight text-[#999] transition duration-400 hover:bg-black/6 cursor-pointer"
              >
                Cancel
              </button>

              <button
                disabled={submitting || !email.trim()}
                type="submit"
                className="geist disabled:cursor-not-allowed  disabled:opacity-50  mt-4 text-lef justify-center item-center w-fit bg-black p-2 rounded  text-[13px] font-semibold leading-3 tracking-tight text-white transition duration-400 hover:bg-black/60 cursor-pointer"
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
            {creditPurchaseStatus && (
              <p
                className="mb-3 rounded-md font-medium bg-[#f2f4f7] px-2.5 py-1 tracking-tight text-[12px] text-[#475467]"
                role="status"
              >
                {creditPurchaseStatus === "success"
                  ? "Payment returned successfully. Credits appear after Polar confirms it; refresh the balance if needed."
                  : creditPurchaseStatus === "processing"
                    ? "Your checkout is still being prepared. Wait a moment, then try buying credits again."
                    : "Checkout was closed or returned. Credits are added only after Polar confirms payment."}
              </p>
            )}
            <section
              aria-label="Workspace AI credits and premium model usage"
              className="mb-4 rounded bg-black/5 p-2 px-3"
            >
              <button
                disabled={creditLoading}
                onClick={() => void refreshCredits()}
                className="flex w-full items-center justify-between gap-3"
              >
                <div>
                  <p className="geist text-left text-sm font-medium leading-4 tracking-tight text-[#999]">
                    Workspace credits
                  </p>
                </div>

                <p className="geist flex items-center gap-1 text-sm font-medium leading-4 tracking-tight text-[#999]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="16px"
                    viewBox="0 -960 960 960"
                    width="16px"
                    fill="currentColor"
                  >
                    <path d="M240-160q-66 0-113-47T80-320v-320q0-66 47-113t113-47h480q66 0 113 47t47 113v320q0 66-47 113t-113 47H240Zm0-480h480q22 0 42 5t38 16v-21q0-33-23.5-56.5T720-720H240q-33 0-56.5 23.5T160-640v21q18-11 38-16t42-5Zm-74 130 445 108q9 2 18 0t17-8l139-116q-11-15-28-24.5t-37-9.5H240q-26 0-45.5 13.5T166-510Z" />
                  </svg>{" "}
                  {creditLoading
                    ? "Loading…"
                    : creditBalance === null
                      ? "Unavailable"
                      : `${creditBalance}`}
                </p>
              </button>
              {creditError && (
                <p className="mt-2 text-[12px] text-[#b42318]" role="alert">
                  {creditError}
                </p>
              )}
              <button
                className="mt-2 hidden text-[11px] font-medium text-[#667085] underline-offset-2 hover:underline disabled:opacity-50"
                disabled={creditLoading}
                onClick={() => void refreshCredits()}
                type="button"
              >
                Refresh balance
              </button>
              {isOwner && (
                <div className="mt-4 flex items-center justify-between gap-3 pt-2">
                  <div className="min-w-0">
                    <p className="geist text-left text-sm font-medium leading-4 tracking-tight text-">
                      Extra Usage
                    </p>
                    <p className="geist text-left text-[10px] font-medium leading-4 tracking-tight text-[#999]">
                      After the included limit, charge 2 credits per premium
                      request
                    </p>
                    {doubleCreditCostError && (
                      <p
                        className="mt-1 text-[11px] font-medium tracking-tight text-[#b42318]"
                        role="alert"
                      >
                        {doubleCreditCostError}
                      </p>
                    )}
                  </div>
                  <button
                    aria-checked={doubleCreditCost ?? false}
                    aria-label="Double workspace credit usage for premium models"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0 transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#536346] disabled:cursor-not-allowed disabled:opacity-50 ${
                      doubleCreditCost
                        ? "bg-[#536346] hover:bg-[#475839]"
                        : "bg-[#c6c9c2] hover:bg-[#b8bbb4]"
                    }`}
                    disabled={
                      doubleCreditCostLoading ||
                      doubleCreditCostSaving ||
                      doubleCreditCost === null
                    }
                    onClick={() => void toggleDoubleCreditCost()}
                    role="switch"
                    type="button"
                  >
                    <span
                      className={`pointer-events-none absolute left-0 top-1/2 size-5 -translate-y-1/2 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                        doubleCreditCost
                          ? "translate-x-[22px]"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              )}
            </section>
            {loading ? (
              <p className="py-8 text-center tracking-tight font-medium text-sm text-[#999]">
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
                      <p className="geist text-left text-sm font-semibold leading-4 tracking-tight text-[#999]">
                        {(member.name || member.email || "?").slice(0, 1)}
                      </p>
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
          </div>
        )}
      </section>
    </div>
  );
}
