"use client";

import {
  Check,
  ChevronDown,
  Share2,
  UsersRound,
  UserRoundPlus,
} from "lucide-react";

type WorkspaceToolbarProps = {
  billingStatusError: string;
  isPro: boolean;
  workspaceName: string;
  onManage: () => void;
  onInvite: () => void;
};

const buttonClass =
  "flex w-fit items-center gap-2 rounded-full px-2 py-1.5 text-left text-[12px] font-medium tracking-tight text-[#686a64] transition hover:bg-[#f4f5f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]";

export default function WorkspaceToolbar({
  billingStatusError,
  isPro,
  workspaceName,
  onManage,
  onInvite,
}: WorkspaceToolbarProps) {
  return (
    <div className="absolute top-0 z-20 flex w-full items-center justify-between px-2 py-1">
      <button
        aria-label={`Current workspace: ${workspaceName}`}
        className={buttonClass}
        type="button"
      >
        <span className="max-w-[40vw] truncate">{workspaceName}</span>
        <ChevronDown aria-hidden="true" className="size-[13px] shrink-0" />
      </button>

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
          <a
            aria-label="Subscribe to Synthetic Pro"
            className="flex h-7 items-center rounded-full bg-black px-2 text-xs font-semibold tracking-tight text-white transition hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
            href="/api/billing/checkout"
          >
            Go Pro
          </a>
        )}
      </div>
    </div>
  );
}
