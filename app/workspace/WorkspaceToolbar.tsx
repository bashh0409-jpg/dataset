"use client";

import {
  ChevronDown,
  Share2,
  UsersRound,
  UserRoundPlus,
} from "lucide-react";

type WorkspaceToolbarProps = {
  billingStatusError: string;
  isPro: boolean;
  model: "qwen" | "auto" | "claude" | "openai";
  workspaceName: string;
  onModelChange: (model: "qwen" | "auto" | "claude" | "openai") => void;
  onManage: () => void;
  onInvite: () => void;
};

const buttonClass =
  "flex w-fit items-center gap-2 rounded-full px-2 py-1.5 text-left text-[12px] font-medium tracking-tight text-[#686a64] transition hover:bg-[#f4f5f1] focus-visible:outline-0 focus-visible:outline-offset-2 focus-visible:outline-[#858780]";

export default function WorkspaceToolbar({
  billingStatusError,
  isPro,
  model,
  workspaceName,
  onModelChange,
  onManage,
  onInvite,
}: WorkspaceToolbarProps) {
  return (
    <div className="absolute top-0 z-20 flex w-full items-center justify-between px-2 py-1">
      <div className="flex items-center gap-2">
        {" "}
        <button
          aria-label={`Current workspace: ${workspaceName}`}
          className={buttonClass}
          type="button"
        >
          <span className="max-w-[40vw] truncate">{workspaceName}</span>
          <ChevronDown aria-hidden="true" className="size-[13px] shrink-0" />
        </button>
        <label className="relative flex items-center">
          <span className="sr-only">AI model</span>
          <select
            aria-label="AI model"
            className={`${buttonClass} cursor-pointer appearance-none pr-6`}
            onChange={(event) => {
              if (event.currentTarget.value === "qwen") {
                onModelChange("qwen");
              }
              if (
                event.currentTarget.value === "auto" ||
                event.currentTarget.value === "claude" ||
                event.currentTarget.value === "openai"
              ) {
                onModelChange(event.currentTarget.value);
              }
            }}
            title="Choose an AI model"
            value={isPro ? model : "qwen"}
          >
            {isPro ? (
              <>
                <option value="qwen">Free model</option>
                <option value="auto">Auto</option>
                <option value="claude">Claude</option>
                <option value="openai">OpenAI</option>
              </>
            ) : (
              <option value="qwen">Free model</option>
            )}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-1 size-[13px] shrink-0"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          aria-label="Manage workspace"
          className={buttonClass}
          onClick={onManage}
          type="button"
        >
          <UsersRound aria-hidden="true" className="size-[18px]" />
          Manage
        </button>
        <button
          aria-label="Invite a teammate"
          className={buttonClass}
          onClick={onInvite}
          type="button"
        >
          <UserRoundPlus aria-hidden="true" className="size-[18px]" />
          Invite
        </button>
        <button
          aria-label="Share workspace"
          className={buttonClass}
          type="button"
        >
          <Share2 aria-hidden="true" className="size-[18px]" />
          Share
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
        ) : isPro ? (
          <a
            aria-label="Pro subscription active. Manage your plan"
            className="flex h-7 items-center gap-1 rounded-full border border-[#d8e5d2] bg-[#f2f8ef] px-2 text-xs font-semibold tracking-tight text-[#47623f] transition hover:bg-[#e8f2e4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
            href="/api/billing/portal"
            title="Pro plan active — manage subscription"
          >
            Pro
          </a>
        ) : (
          <form action="/api/billing/checkout" method="post">
            <button
              aria-label="Subscribe to Synthetic Pro"
              className="flex h-7 items-center rounded-full bg-black px-2 text-xs font-semibold tracking-tight text-white transition hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
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
