"use client";

import {
  Archive,
  Bug,
  Check,
  ChevronDown,
  Download,
  Ellipsis,
  LoaderCircle,
  Pencil,
  Pin,
  Tag,
  Trash2,
  Zap,
  ChevronRight,
  Share2,
  UsersRound,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getProAiSettings } from "@/app/actions/pro-settings";
import type { AiConversationSummary } from "@/app/actions/ai-conversations";

type WorkspaceToolbarProps = {
  billingStatusError: string;
  isPro: boolean;
  model: "qwen" | "auto" | "claude" | "openai";
  workspaceName: string;
  activeConversation: AiConversationSummary | null;
  onExportConversation: () => Promise<void>;
  onPinConversation: () => Promise<void>;
  onArchiveConversation: () => Promise<void>;
  onRenameConversation: (title: string) => Promise<void>;
  onLabelConversation: (label: string | null) => Promise<void>;
  onColorConversation: (
    color: AiConversationSummary["color"],
  ) => Promise<void>;
  onDeleteConversation: () => Promise<void>;
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
  activeConversation,
  onExportConversation,
  onPinConversation,
  onArchiveConversation,
  onRenameConversation,
  onLabelConversation,
  onColorConversation,
  onDeleteConversation,
  onModelChange,
  onManage,
  onInvite,
}: WorkspaceToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [credits, setCredits] = useState("Loading credits…");
  const [creditsError, setCreditsError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setRenameOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setRenameOpen(false);
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
    let active = true;
    void getProAiSettings()
      .then((result) => {
        if (!active) return;
        if ("error" in result) {
          setCreditsError(result.error);
          setCredits("Usage unavailable");
          return;
        }
        setCreditsError("");
        setCredits(
          result.data.isPro
            ? `${Math.max(0, result.data.monthlyRequestLimit - result.data.includedRequestsUsed)} of ${result.data.monthlyRequestLimit} requests remaining`
            : "Free plan · up to 50 requests per 24 hours",
        );
      })
      .catch(() => {
        if (!active) return;
        setCreditsError("Unable to load current usage.");
        setCredits("Usage unavailable");
      });
    return () => {
      active = false;
    };
  }, [menuOpen]);

  const runAction = async (name: string, action: () => Promise<void>) => {
    setBusyAction(name);
    try {
      await action();
    } finally {
      setBusyAction("");
    }
  };

  const colorOptions: {
    value: AiConversationSummary["color"];
    label: string;
    className: string;
  }[] = [
    { value: "gray", label: "Gray", className: "bg-[#8b8d86]" },
    { value: "red", label: "Red", className: "bg-[#d4615c]" },
    { value: "orange", label: "Orange", className: "bg-[#dc8a45]" },
    { value: "yellow", label: "Yellow", className: "bg-[#d4b643]" },
    { value: "green", label: "Green", className: "bg-[#61a477]" },
    { value: "blue", label: "Blue", className: "bg-[#5a91c6]" },
    { value: "purple", label: "Purple", className: "bg-[#9271b5]" },
  ];
  const selectedModelLabel =
    !isPro || model === "qwen"
      ? "Standard"
      : model === "auto"
        ? "Auto"
        : model === "claude"
          ? "Claude"
          : "OpenAI";

  return (
    <div className="absolute top-0 z-20 flex w-full items-center justify-between px-2 py-1">
      <div
        className="relative flex max-w-[min(20vw,420px)] items-center gap-1"
        ref={menuRef}
      >
        <span
          className="max-w-[40vw] truncate text-xs font-semibold tracking-tight"
          title={activeConversation?.title ?? "New conversation"}
        >
          {activeConversation?.title ?? "New conversation"}
        </span>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Conversation options"
          className="rounded p-1 text-[#686a64] transition hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
          onClick={() =>
            setMenuOpen((open) => {
              if (!open) setLabelValue(activeConversation?.label ?? "");
              return !open;
            })
          }
          title="Conversation options"
          type="button"
        >
          <Ellipsis aria-hidden="true" className="size-[18px]" />
        </button>
        {menuOpen && (
          <div
            aria-label="Conversation options"
            className="absolute left-0 top-[calc(100%+8px)] z-50 max-h-[min(80vh,620px)] w-[min(300px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-[#e7e8e4] bg-white p-2 text-[#41433d] shadow-[0_12px_36px_rgba(20,24,18,0.16)]"
            role="menu"
          >
            <label className="relative flex h-8 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-xs font-medium tracking-tight transition hover:bg-[#f7f8f5]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="16px"
                viewBox="0 -960 960 960"
                width="16px"
                fill="CurrentColor"
              >
                <path d="M390-120q-51 0-88-35.5T260-241q-60-8-100-53t-40-106q0-21 5.5-41.5T142-480q-11-18-16.5-38t-5.5-42q0-61 40-105.5t99-52.5q3-51 41-86.5t90-35.5q26 0 48.5 10t41.5 27q18-17 41-27t49-10q52 0 89.5 35t40.5 86q59 8 99.5 53T840-560q0 22-5.5 42T818-480q11 18 16.5 38.5T840-400q0 62-40.5 106.5T699-241q-5 50-41.5 85.5T570-120q-25 0-48.5-9.5T480-156q-19 17-42 26.5t-48 9.5Zm130-590v460q0 21 14.5 35.5T570-200q20 0 34.5-16t15.5-36q-21-8-38.5-21.5T550-306q-10-14-7.5-30t16.5-26q14-10 30-7.5t26 16.5q11 16 28 24.5t37 8.5q33 0 56.5-23.5T760-400q0-5-.5-10t-2.5-10q-17 10-36.5 15t-40.5 5q-17 0-28.5-11.5T640-440q0-17 11.5-28.5T680-480q33 0 56.5-23.5T760-560q0-33-23.5-56T680-640q-11 18-28.5 31.5T613-587q-16 6-31-1t-20-23q-5-16 1.5-31t22.5-20q15-5 24.5-18t9.5-30q0-21-14.5-35.5T570-760q-21 0-35.5 14.5T520-710Zm-80 460v-460q0-21-14.5-35.5T390-760q-21 0-35.5 14.5T340-710q0 16 9 29.5t24 18.5q16 5 23 20t2 31q-6 16-21 23t-31 1q-21-8-38.5-21.5T279-640q-32 1-55.5 24.5T200-560q0 33 23.5 56.5T280-480q17 0 28.5 11.5T320-440q0 17-11.5 28.5T280-400q-21 0-40.5-5T203-420q-2 5-2.5 10t-.5 10q0 33 23.5 56.5T280-320q20 0 37-8.5t28-24.5q10-14 26-16.5t30 7.5q14 10 16.5 26t-7.5 30q-14 19-32 33t-39 22q1 20 16 35.5t35 15.5q21 0 35.5-14.5T440-250Zm40-230Z" />
              </svg>
              <span className="font-medium text-[#242620]">Model</span>
              <span className="ml-auto flex items-center gap-2 text-[#555850]">
                {selectedModelLabel}
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 text-[#242620]"
                />
              </span>
              <select
                aria-label="Speed model"
                className="absolute inset-0 text-xs font-medium z-10 size-full cursor-pointer opacity-0"
                onChange={(event) => {
                  if (event.currentTarget.value === "qwen") {
                    onModelChange("qwen");
                  } else if (
                    event.currentTarget.value === "auto" ||
                    event.currentTarget.value === "claude" ||
                    event.currentTarget.value === "openai"
                  ) {
                    onModelChange(event.currentTarget.value);
                  }
                }}
                value={isPro ? model : "qwen"}
              >
                {isPro ? (
                  <>
                    <option value="qwen">Standard</option>
                    <option value="auto">Auto</option>
                    <option value="claude">Claude</option>
                    <option value="openai">OpenAI</option>
                  </>
                ) : (
                  <option value="qwen">Standard</option>
                )}
              </select>
            </label>

            <button
              className="flex w-full font-medium  tracking-tight items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[#f4f5f1] disabled:opacity-50"
              type="button"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="16px"
                viewBox="0 -960 960 960"
                width="16px"
                fill="currentColor"
              >
                <path d="M240-160q-66 0-113-47T80-320v-320q0-66 47-113t113-47h480q66 0 113 47t47 113v320q0 66-47 113t-113 47H240Zm0-480h480q22 0 42 5t38 16v-21q0-33-23.5-56.5T720-720H240q-33 0-56.5 23.5T160-640v21q18-11 38-16t42-5Zm-74 130 445 108q9 2 18 0t17-8l139-116q-11-15-28-24.5t-37-9.5H240q-26 0-45.5 13.5T166-510Z" />
              </svg>

              <p className="text-[11px] leading-4 text-[#555850]">{credits}</p>
              {creditsError && (
                <p className="text-[10px] text-[#a64239]" role="status">
                  {creditsError}
                </p>
              )}
            </button>
            <div className="my-1 border-t border-[#eff0ec]" />
            {activeConversation ? (
              <>
                {renameOpen ? (
                  <form
                    className="flex gap-1 p-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runAction("rename", async () => {
                        await onRenameConversation(renameValue);
                        setRenameOpen(false);
                      });
                    }}
                  >
                    <input
                      aria-label="Conversation title"
                      autoFocus
                      className="h-8 min-w-0 flex-1 rounded-md border border-[#e2e5df] px-2 text-xs font-medium tracking-tight outline-none focus:border-[#aeb3a9]"
                      maxLength={120}
                      onChange={(event) =>
                        setRenameValue(event.currentTarget.value)
                      }
                      value={renameValue}
                    />
                    <button
                      aria-label="Save conversation title"
                      className="flex size-8 items-center justify-center rounded-md hover:bg-[#f4f5f1] disabled:opacity-50"
                      disabled={busyAction === "rename"}
                      type="submit"
                    >
                      {busyAction === "rename" ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Check aria-hidden="true" className="size-4" />
                      )}
                    </button>
                  </form>
                ) : (
                  <button
                    className="flex w-full font-medium  tracking-tight items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[#f4f5f1] disabled:opacity-50"
                    disabled={busyAction !== ""}
                    onClick={() => {
                      setRenameValue(activeConversation.title);
                      setRenameOpen(true);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <Pencil aria-hidden="true" className="size-3.5" />
                    Rename
                  </button>
                )}
                <button
                  className="flex w-full font-medium  tracking-tight items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[#f4f5f1] disabled:opacity-50"
                  disabled={busyAction !== ""}
                  onClick={() => void runAction("export", onExportConversation)}
                  role="menuitem"
                  type="button"
                >
                  {busyAction === "export" ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-3.5 animate-spin"
                    />
                  ) : (
                    <Download aria-hidden="true" className="size-3.5" />
                  )}
                  Export conversation
                </button>
                <button
                  className="flex w-full font-medium  tracking-tight items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[#f4f5f1] disabled:opacity-50"
                  disabled={busyAction !== ""}
                  onClick={() => void runAction("pin", onPinConversation)}
                  role="menuitem"
                  type="button"
                >
                  <Pin aria-hidden="true" className="size-3.5" />
                  {activeConversation.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  className="flex w-full font-medium  tracking-tight items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[#f4f5f1] disabled:opacity-50"
                  disabled={busyAction !== ""}
                  onClick={() =>
                    void runAction("archive", onArchiveConversation)
                  }
                  role="menuitem"
                  type="button"
                >
                  <Archive aria-hidden="true" className="size-3.5" />
                  {activeConversation.archived ? "Unarchive" : "Archive"}
                </button>
                <div className="my-1 border-t border-[#eff0ec]" />
                <form
                  className="flex items-center gap-2 px-2.5 py-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runAction("label", async () => {
                      await onLabelConversation(labelValue.trim() || null);
                    });
                  }}
                >
                  <Tag aria-hidden="true" className="size-3.5 shrink-0" />
                  <input
                    aria-label="Conversation label"
                    className="h-7 min-w-0 flex-1 rounded border border-[#e2e5df] px-1.5 text-xs font-medium tracking-tight outline-none focus:border-[#aeb3a9]"
                    maxLength={40}
                    onChange={(event) =>
                      setLabelValue(event.currentTarget.value)
                    }
                    placeholder="Add label"
                    value={labelValue}
                  />
                  <button
                    aria-label="Save conversation label"
                    className="flex size-7 font-medium  tracking-tight items-center justify-center rounded hover:bg-[#f4f5f1] disabled:opacity-50"
                    disabled={busyAction !== ""}
                    type="submit"
                  >
                    {busyAction === "label" ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-3.5 animate-spin"
                      />
                    ) : (
                      <Check aria-hidden="true" className="size-3.5" />
                    )}
                  </button>
                </form>
                <div className="flex  items-center gap-2 px-2.5 py-2">
                  <span className="text-xs font-medium  tracking-tight">
                    Color
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {colorOptions.map((option) => (
                      <button
                        aria-label={`${option.label} conversation color`}
                        aria-checked={activeConversation.color === option.value}
                        className={`size-4 rounded-full ${option.className} ${
                          activeConversation.color === option.value
                            ? "outline outline-2 outline-offset-2 outline-[#555850]"
                            : ""
                        }`}
                        disabled={busyAction !== ""}
                        key={option.value}
                        onClick={() =>
                          void runAction("color", () =>
                            onColorConversation(option.value),
                          )
                        }
                        role="menuitemradio"
                        type="button"
                      />
                    ))}
                  </div>
                </div>
                <div className="my-1 border-t border-[#eff0ec]" />
                <button
                  className="flex w-full items-center font-medium tracking-tight gap-2 rounded-md px-2.5 py-2 text-left text-xs text-[#a64239] hover:bg-[#fff4f2] disabled:opacity-50"
                  disabled={busyAction !== ""}
                  onClick={() => void runAction("delete", onDeleteConversation)}
                  role="menuitem"
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Delete conversation
                </button>{" "}
                <div className="my-1 border-t border-[#eff0ec]" />
                <a
                  className="flex font-medium  tracking-tight items-center gap-2 rounded-md px-2.5 py-2 text-xs text-[#555850] hover:bg-[#f4f5f1]"
                  href={`mailto:bashh0409@gmail.com?subject=${encodeURIComponent(`Synthetic bug report: ${activeConversation.title}`)}`}
                  role="menuitem"
                >
                  <Bug aria-hidden="true" className="size-3.5" />
                  Report a bug
                </a>
              </>
            ) : (
              <p className="px-2 py-3 text-xs text-[#777a72]">
                Save a conversation first to manage its options.
              </p>
            )}
          </div>
        )}
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
