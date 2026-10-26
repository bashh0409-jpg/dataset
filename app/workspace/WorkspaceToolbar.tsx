"use client";

import { ChevronDown, Share2, UsersRound, UserRoundPlus } from "lucide-react";

type WorkspaceToolbarProps = {
  workspaceName: string;
  onManage: () => void;
  onInvite: () => void;
};

const buttonClass =
  "flex w-fit items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium tracking-tight text-[#686a64] transition hover:bg-[#f4f5f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]";

export default function WorkspaceToolbar({
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

        <button className="bg-black cursor-pointer text-xs px-2 rounded text-white h-7 tracking-tight font-semibold">Upgrade to Pro</button>
      </div>
    </div>
  );
}
