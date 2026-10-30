"use client";

import { Ellipsis, Users, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getWorkspaceProAiUsage } from "@/app/actions/pro-settings";
import type { AiConversationSummary } from "@/app/actions/ai-conversations";

type WorkspaceToolbarProps = {
  billingStatusError: string;
  canInvite: boolean;
  isPro: boolean;
  isPersonalPro: boolean;
  workspaceCreditBalance: number;
  workspaceId: string;
  model: "qwen" | "auto" | "claude" | "openai";
  workspaceName: string;
  activeConversation: AiConversationSummary | null;
  onExportConversation: () => Promise<void>;
  onModelChange: (model: "qwen" | "auto" | "claude" | "openai") => void;
  onManage: () => void;
  onInvite: () => void;
};

type WorkspaceUsageSummary = {
  workspaceId: string;
  usedRequests: number;
  remainingRequests: number;
  resetInMinutes: number | null;
  creditBalance: number;
};

const buttonClass =
  "flex w-fit items-center gap-2 rounded-lg px-2 py-1.5  text-left text-xs font-semibold tracking-tight text-[#686a64] transition hover:bg-[#f4f5f1] focus-visible:outline-0 focus-visible:outline-offset-2 focus-visible:outline-[#858780]";

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (remainingMinutes === 0) return `${hours} hr`;
  return `${hours} hr ${remainingMinutes} min`;
};

export default function WorkspaceToolbar({
  billingStatusError,
  canInvite,
  isPro,
  isPersonalPro,
  workspaceCreditBalance,
  workspaceId,
  activeConversation,
  model,
  onModelChange,
  onManage,
  onInvite,
}: WorkspaceToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [usageSummary, setUsageSummary] =
    useState<WorkspaceUsageSummary | null>(null);
  const [usageError, setUsageError] = useState<{
    workspaceId: string;
    message: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasPremiumAccess = isPro || workspaceCreditBalance > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    if (!hasPremiumAccess) return;

    let active = true;
    void getWorkspaceProAiUsage(workspaceId)
      .then((result) => {
        if (!active) return;
        if ("error" in result) {
          setUsageError({ workspaceId, message: result.error });
          return;
        }
        setUsageError(null);
        const resetsAt = result.data.nextAvailableAt;
        setUsageSummary({
          workspaceId,
          usedRequests: result.data.used,
          remainingRequests: Math.max(0, 50 - result.data.used),
          resetInMinutes: resetsAt
            ? Math.max(
                1,
                Math.ceil((Date.parse(resetsAt) - Date.now()) / 60_000),
              )
            : null,
          creditBalance: result.data.creditBalance,
        });
      })
      .catch(() => {
        if (!active) return;
        setUsageError({
          workspaceId,
          message: "Unable to load current usage.",
        });
      });
    return () => {
      active = false;
    }
  }, [hasPremiumAccess, menuOpen, workspaceId]);

  const selectedModelLabel =
    !hasPremiumAccess || model === "qwen"
      ? "Standard"
      : model === "auto"
        ? "Auto"
        : model === "claude"
          ? "Sonnet 5.5"
          : "GPT-4";
  const nextModel = !hasPremiumAccess
    ? "qwen"
    : model === "auto"
      ? "claude"
      : model === "claude"
        ? "openai"
        : "auto";
  const nextModelLabel =
    nextModel === "claude"
      ? "Sonnet 5.5"
      : nextModel === "openai"
        ? "GPT-4"
        : nextModel === "auto"
          ? "Auto"
          : "Standard";
  const currentUsageError =
    usageError?.workspaceId === workspaceId ? usageError.message : "";
  const currentUsage =
    usageSummary?.workspaceId === workspaceId && !currentUsageError
      ? usageSummary
      : null;
  const isLoadingUsage =
    menuOpen && hasPremiumAccess && !currentUsage && !currentUsageError;
  const resetLabel = !hasPremiumAccess
    ? "Requires Pro access"
    : currentUsage
        ? currentUsage.resetInMinutes === null
          ? "No cooldown"
          : `Limit reset: ${formatDuration(currentUsage.resetInMinutes)}`
        : currentUsageError
          ? "Unavailable"
          : "Loading";
  const creditBalance = currentUsage?.creditBalance ?? workspaceCreditBalance;
  const usagePercent = currentUsage
    ? Math.round((currentUsage.usedRequests / 50) * 100)
    : 0;

  return (
    <div className="absolute top-0 z-20 flex w-full items-center justify-between px-2 py-1">
      <div
        className="relative flex max-w-[min(40vw,520px)] min-w-0 items-center gap-1"
        ref={menuRef}
      >
        {activeConversation && (
          <span
            className="min-w-0 max-w-[min(28vw,240px)] truncate px-1 text-xs font-medium tracking-tight text-[#686a64]"
            title={activeConversation.title}
          >
            {activeConversation.title}
          </span>
        )}
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Model Usage"
          className="shrink-0 rounded p-1 text-[#686a64] transition hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
          onClick={() => setMenuOpen((open) => !open)}
          title="Model Usage"
          type="button"
        >
          <Ellipsis aria-hidden="true" className="size-[18px]" />
        </button>
        {menuOpen && (
          <section
            aria-label="Model Usage"
            aria-modal="false"
            className="absolute left-0 top-[calc(100%+6px)] z-[70] flex max-h-[min(78vh,620px)] w-[min(300px,calc(100vw-84px))] flex-col overflow-hidden rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_24px_rgba(20,24,18,0.14)]"
            role="dialog"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[#e7e8e4] px-2 py-1">
              <h2 className="text-[13px] font-semibold tracking-tight text-[#60625d]">
                Model Usage
              </h2>
              <button
                aria-label={`Current model: ${selectedModelLabel}. Click to switch to ${nextModelLabel}`}
                className="flex p-0.5 px-1 font-semibold tracking-tight items-center justify-center text-xs rounded text-[#686a64] transition hover:bg-[#eff0ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
                disabled={!hasPremiumAccess}
                onClick={() => onModelChange(nextModel)}
                title={
                  hasPremiumAccess
                    ? `Switch model to ${nextModelLabel}`
                    : "Standard model"
                }
                type="button"
              >
                {selectedModelLabel}
              </button>
            </header>
            <div className="min-h-0 flex-1 tracking-tight font-semibold overflow-y-auto px-3 py-2">
              <div className="flex items-end justify-between gap-3">
                <p
                  aria-label={
                    currentUsage
                      ? `${usagePercent}% of premium requests used`
                      : "Premium request usage unavailable"
                  }
                  className="text-[52px] font-semibold leading-none tracking-[-0.07em] tabular-nums text-[#171815]"
                >
                  {currentUsage ? `${usagePercent}%` : "—"}
                </p>
              </div>

              {hasPremiumAccess && currentUsage ? (
                <div
                  aria-label="Premium request usage"
                  aria-valuemax={50}
                  aria-valuemin={0}
                  aria-valuenow={currentUsage.usedRequests}
                  className="mt-5 h-8 overflow-hidden"
                  role="progressbar"
                >
                  <div
                    aria-hidden="true"
                    className="h-full w-full"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(to right, #e5e7e4 0 3px, transparent 3px 6px)",
                    }}
                  >
                    <div
                      className="h-full transition-[width] duration-300"
                      style={{
                        width: `${usagePercent}%`,
                        backgroundImage:
                          "repeating-linear-gradient(to right, #df8585 0 3px, transparent 3px 6px)",
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-5 flex h-8 items-center text-xs font-medium text-[#686a64]">
                  {hasPremiumAccess
                    ? currentUsageError
                      ? "Usage is currently unavailable"
                      : "Loading usage"
                    : "Premium models require Pro access or workspace credits."}
                </p>
              )}

              <div className="mt-2 flex items-center justify-between  text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold tracking-tight flex items-center gap-1 tabular-nums text-[#242620]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      height="16px"
                      width="16px"
                      fill="currentColor"
                    >
                      <path d="M6,20q-1.65,0-2.83-1.18T2,16V8Q2,6.35 3.18,5.18T6,4H18q1.65,0 2.83,1.18T22,8v8q0,1.65-1.17,2.82T18,20H6ZM6,8H18q0.55,0 1.05,0.13T20,8.52V8q0-0.82-0.59-1.41T18,6H6Q5.18,6 4.59,6.59Q4,7.18 4,8V8.52q0.45-0.27 0.95-0.4T6,8ZM4.15,11.25l11.13,2.7q0.22,0.05 0.45,0t0.43-0.2l3.47-2.9q-0.27-0.38-0.7-0.61T18,10H6q-0.65,0-1.14,0.34q-0.49,0.34-0.71,0.91Z" />
                    </svg>{" "}
                    {creditBalance}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#242620]">
                    {resetLabel}
                  </span>
                </div>
              </div>

              {currentUsageError && (
                <p
                  className="mt-3 text-[11px] font-medium text-[#9a3e32]"
                  role="status"
                >
                  {currentUsageError}
                </p>
              )}
              {isLoadingUsage && (
                <p className="sr-only" role="status">
                  Loading model usage
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          aria-label="Manage workspace"
          className={`${buttonClass} disabled:cursor-not-allowed`}
          onClick={onManage}
          type="button"
        >
          <Users aria-hidden="true" className="size-[14px] stroke-[3px]" />
          Manage
        </button>
        <button
          aria-label={
            canInvite
              ? "Invite a teammate"
              : "Only workspace owners can invite teammates"
          }
          className={buttonClass}
          disabled={!canInvite}
          onClick={onInvite}
          type="button"
        >
          <UserPlus aria-hidden="true" className="size-[14px] stroke-[3px]" />
          Invite
        </button>
        {billingStatusError ? (
          <span
            aria-label={billingStatusError}
            className="flex h-7 items-center rounded border border-[#f1dfb4] bg-[#fffaf0] px-2 text-[10px] font-medium text-[#805c18]"
            role="status"
            title={billingStatusError}
          >
            Plan status unavailable
          </span>
        ) : isPersonalPro ? (
          <a
            aria-label="Pro subscription active. Manage your plan"
            className="flex h-7 items-center gap-1 rounded-lg border border-[#d8e5d2] bg-[#f2f8ef] px-2 text-xs font-semibold tracking-tight text-[#47623f] transition hover:bg-[#e8f2e4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
            href="/api/billing/portal"
            title="Pro plan active — manage subscription"
          >
            Pro
          </a>
        ) : isPro ? (
          <span
            aria-label="This workspace has Pro access"
            className="flex h-7 items-center rounded-md border border-[#d8e5d2] bg-[#f2f8efwhite] px-2 text-xs font-semibold tracking-tight text-[#47623f]"
            title="Pro models are included through this workspace"
          >
            Workspace Pro
          </span>
        ) : workspaceCreditBalance > 0 ? (
          <button
            aria-label={`${workspaceCreditBalance} workspace credits available. Manage credits`}
            className="flex py-1 items-center rounded-lg gap-0.5 border border-[#d8e5d2] bg-[#f2f8ef] px-2 text-xs font-semibold tracking-tight text-[#47623f] transition hover:bg-[#e8f2e4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
            onClick={onManage}
            title="Premium models use one workspace credit per request"
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="16px"
              viewBox="48 -912 864 864"
              width="16px"
              fill="currentColor"
            >
              <path d="M240-192q-60 0-102-42T96-336v-288q0-60 42-102t102-42h480q60 0 102 42t42 102v288q0 60-42 102t-102 42H240Zm0-432h480q19 0 37 5.5t35 14.5v-20q0-30-21-51t-51-21H240q-30 0-51 21t-21 51v20q17-10 35-15t37-5Zm-63 110 430 105q8 2 16 0t15-7l135-112q-11-11-24.5-17.5T720-552H240q-20 0-38 11t-25 27Z" />
            </svg>
            {workspaceCreditBalance}
          </button>
        ) : (
          <form action="/api/billing/checkout" method="post">
            <button
              aria-label="Subscribe to Synthetic Pro"
              className="flex h-7 items-center rounded-lg bg-black px-2 text-xs font-semibold tracking-tight text-white transition hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
              type="submit"
            >
              Go Pro
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
