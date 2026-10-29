"use client";

import Image from "next/image";
import {
  AtSign,
  Check,
  X,
  LoaderCircle,
  MailOpen,
  MoreVertical,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  createWorkspaceMention,
  getWorkspaceMentions,
  markWorkspaceMentionsRead,
  type WorkspaceMention,
} from "@/app/actions/workspace-mentions";
import {
  getWorkspaceMembers,
  type WorkspaceMember,
} from "@/app/actions/workspaces";

type WorkspaceMentionsProps = {
  workspaceId: string;
};

function formatMentionDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function WorkspaceMentions({
  workspaceId,
}: WorkspaceMentionsProps) {
  const [open, setOpen] = useState(false);
  const [mentions, setMentions] = useState<WorkspaceMention[]>([]);
  const [selectedMention, setSelectedMention] =
    useState<WorkspaceMention | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [failedAvatarIds, setFailedAvatarIds] = useState<string[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const mentionsPanelRef = useRef<HTMLElement>(null);
  const mentionDetailRef = useRef<HTMLElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [mentionDetailPosition, setMentionDetailPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const refreshMentions = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const request = (async () => {
      try {
        const result = await getWorkspaceMentions(workspaceId);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setMentions(result.data.mentions);
        setUnreadCount(result.data.unreadCount);
        setError("");
      } catch {
        setError("Unable to load workspace mentions. Please try again.");
      }
    })();

    refreshPromiseRef.current = request;
    try {
      await request;
    } finally {
      if (refreshPromiseRef.current === request) {
        refreshPromiseRef.current = null;
      }
    }
  }, [workspaceId]);

  const markAllAsRead = async () => {
    const unreadMentionIds = mentions
      .filter((mention) => mention.isMentioned && !mention.readAt)
      .map((mention) => mention.id);
    setActionsOpen(false);
    if (unreadMentionIds.length === 0) return;

    setMarkingRead(true);
    setError("");
    try {
      const result = await markWorkspaceMentionsRead({
        workspaceId,
        mentionIds: unreadMentionIds,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }

      const readAt = new Date().toISOString();
      setMentions((current) =>
        current.map((mention) =>
          unreadMentionIds.includes(mention.id)
            ? { ...mention, readAt }
            : mention,
        ),
      );
      setUnreadCount(0);
    } catch {
      setError("Unable to mark mentions as read. Please try again.");
    } finally {
      setMarkingRead(false);
    }
  };

  const toggleActionsMenu = () => {
    if (actionsOpen) {
      setActionsOpen(false);
      return;
    }

    const panelBounds = mentionsPanelRef.current?.getBoundingClientRect();
    if (panelBounds) {
      setActionsMenuPosition({
        top: panelBounds.top,
        left: panelBounds.right + 6,
      });
    }
    setActionsOpen(true);
  };

  const openMentions = async () => {
    setOpen(true);
    setActionsOpen(false);
    setSelectedMention(null);
    setComposerOpen(false);
    setError("");
    setLoading(true);
    try {
      const [membersResult] = await Promise.all([
        getWorkspaceMembers(workspaceId),
        refreshMentions(),
      ]);
      if ("error" in membersResult) {
        setError(membersResult.error);
        return;
      }
      setMembers(membersResult.data);
    } catch {
      setError("Unable to load mentions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshMentions();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refreshMentions();
    }, 60_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshMentions]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !actionsMenuRef.current?.contains(target) &&
        !mentionDetailRef.current?.contains(target)
      ) {
        setOpen(false);
        setActionsOpen(false);
        setSelectedMention(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedMention) {
          setSelectedMention(null);
        } else {
          setOpen(false);
          setActionsOpen(false);
        }
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, selectedMention]);

  const submitMention = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSending(true);
    try {
      const result = await createWorkspaceMention({
        workspaceId,
        recipientIds: selectedRecipients,
        message,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMessage("");
      setSelectedRecipients([]);
      setComposerOpen(false);
      await refreshMentions();
    } catch {
      setError("Unable to send the mention. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const openComposer = async () => {
    setComposerOpen(true);
    if (members.length > 0) return;

    setLoading(true);
    setError("");
    try {
      const result = await getWorkspaceMembers(workspaceId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMembers(result.data);
    } catch {
      setError("Unable to load workspace members. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleRecipient = (memberId: string) => {
    setSelectedRecipients((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  };

  const memberName = (memberId: string) => {
    const member = members.find((candidate) => candidate.id === memberId);
    return member?.name || member?.email || "Workspace member";
  };
  const memberAvatar = (memberId: string) => {
    const member = members.find((candidate) => candidate.id === memberId);
    if (member?.avatarUrl && !failedAvatarIds.includes(memberId)) {
      return member.avatarUrl;
    }

    const stableHash = [...memberId].reduce(
      (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
      0,
    );
    return ["/pp.png", "/pp2.png", "/pp3.png"][stableHash % 3];
  };
  const mentionSummary = (mention: WorkspaceMention) => {
    const recipientNames = mention.recipientIds.map(memberName).join(", ");
    const authoredByCurrentUser = members.some(
      (member) => member.id === mention.authorId && member.isCurrentUser,
    );

    if (authoredByCurrentUser) return `You mentioned ${recipientNames}`;
    if (mention.isMentioned) {
      return `${memberName(mention.authorId)} mentioned you`;
    }
    return `${memberName(mention.authorId)} mentioned ${recipientNames}`;
  };
  const mentionableMembers = members.filter((member) => !member.isCurrentUser);

  const openMentionDetail = (mention: WorkspaceMention) => {
    const bounds = mentionsPanelRef.current?.getBoundingClientRect();
    if (bounds) {
      setMentionDetailPosition({
        left: Math.max(8, Math.min(bounds.right + 8, window.innerWidth - 268)),
        top: Math.max(8, Math.min(bounds.top, window.innerHeight - 300)),
      });
    }
    setSelectedMention(mention);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unreadCount > 0
            ? `Mentions, ${unreadCount} unread`
            : "Workspace mentions"
        }
        className="workspace-toolbar-button relative cursor-pointer"
        title="Workspace mentions"
        onClick={() => {
          if (open) {
            setOpen(false);
            setActionsOpen(false);
            setSelectedMention(null);
          } else void openMentions();
        }}
        type="button"
      >
        <AtSign aria-hidden="true" className="size-[18px]" />

        {unreadCount > 0 && (
          <span className="absolute w-1 aspect-square -right-1 bottom-0 flex  items-center justify-center rounded-full bg-[#242620] px-1 text-[10px] leading-4 text-white"></span>
        )}
      </button>

      {open && (
        <section
          ref={mentionsPanelRef}
          aria-label="Workspace mentions"
          aria-modal="false"
          className="absolute left-0 top-[calc(100%+6px)] z-[70] flex max-h-[min(78vh,620px)] w-[min(300px,calc(100vw-84px))] flex-col overflow-hidden rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_24px_rgba(20,24,18,0.14)]"
          role="dialog"
        >
          <header className="flex py-0.5 shrink-0 items-center justify-between border-b border-[#e7e8e4] px-1">
            <h2 className="text-[13px] font-semibold tracking-tight text-[#60625d]">
              Mentions
            </h2>
            <div className="flex items-center tracking-tight gap-1">
              {" "}
              <span className="text-[12px] font-semibold text-[#686a64]">
                {unreadCount} Unread
              </span>
              <button
                aria-label="Write a mention"
                className="flex size-6 items-center justify-center rounded-md text-[#686a64] transition hover:bg-[#eff0ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
                onClick={() => void openComposer()}
                title="Write a mention"
                type="button"
              >
                <AtSign aria-hidden="true" className="size-4" />
              </button>
              <div className="relative">
                <button
                  aria-expanded={actionsOpen}
                  aria-haspopup="menu"
                  aria-label="Mention actions"
                  className="flex size-6 items-center justify-center rounded-md text-[#686a64] transition hover:bg-[#eff0ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
                  onClick={toggleActionsMenu}
                  title="Mention actions"
                  type="button"
                  ref={actionsButtonRef}
                >
                  <MoreVertical aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 tracking-tight font-semibold overflow-y-auto px-3 py-2">
            {error && (
              <p
                className="mb-2 rounded bg-[#fff4f2] px-2 py-1.5 text-[11px] text-[#b42318]"
                role="alert"
              >
                {error}
              </p>
            )}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#686a64]">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                />
                Loading mentions…
              </div>
            ) : mentions.length === 0 ? (
              <div className="flex gap-2.5 py-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eff0ec] text-[#686a64]">
                  <AtSign aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h3 className="text-[13px] font-semibold">No mentions yet</h3>
                  <p className="mt-0.5 text-[12px] leading-tight text-[#999]">
                    When someone mentions you in a workspace message, it will
                    appear here.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {mentions.map((mention) => (
                  <li
                    className={`rounded-md ${
                      mention.isMentioned && !mention.readAt
                        ? "bg-[#f0f3eb]"
                        : "hover:bg-[#f4f5f1]"
                    }`}
                    key={mention.id}
                  >
                    <button
                      aria-label={`Open message from ${memberName(mention.authorId)}`}
                      className="flex w-full cursor-pointer items-start gap-3 px-2 py-2 text-left"
                      onClick={() => openMentionDetail(mention)}
                      type="button"
                    >
                      <Image
                        alt=""
                        aria-hidden="true"
                        className="size-7 shrink-0 rounded-full object-cover"
                        height={28}
                        onError={() =>
                          setFailedAvatarIds((current) =>
                            current.includes(mention.authorId)
                              ? current
                              : [...current, mention.authorId],
                          )
                        }
                        src={memberAvatar(mention.authorId)}
                        unoptimized
                        width={28}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-xs font-semibold">
                            {memberName(mention.authorId)}
                          </span>
                          <time
                            className="text-[10px] text-[#868880]"
                            dateTime={mention.createdAt}
                          >
                            {formatMentionDate(mention.createdAt)}
                          </time>
                          {mention.isMentioned && !mention.readAt && (
                            <span className="size-2 rounded-full bg-[#4d6846]" />
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-4 text-[#4c4e48]">
                          {mention.message}
                        </p>
                        <p className="mt-1 text-[10px] text-[#868880]">
                          Mentioned:{" "}
                          {mention.recipientIds.map(memberName).join(", ")}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {composerOpen ? (
            <form
              className="shrink-0 border-t border-[#e7e8e4] bg-white p-2.5"
              onSubmit={submitMention}
            >
              <fieldset disabled={sending || loading}>
                <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-[11px] tracking-tight font-semibold text-[#50534b]">
                  <span>Mention workspace members</span>
                  <button
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#4c6545] transition hover:bg-[#f0f5ed] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      mentionableMembers.length === 0 ||
                      selectedRecipients.length === mentionableMembers.length
                    }
                    onClick={() =>
                      setSelectedRecipients(
                        mentionableMembers.map((member) => member.id),
                      )
                    }
                    type="button"
                  >
                    Mention all
                  </button>
                </legend>
                <div className="mb-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                  {mentionableMembers.length === 0 ? (
                    <p className="text-[11px] font-medium tracking-tight text-[#868880]">
                      No other workspace members to mention.
                    </p>
                  ) : (
                    mentionableMembers.map((member) => {
                      const selected = selectedRecipients.includes(member.id);
                      return (
                        <label
                          className={`flex cursor-pointer text-[11px] tracking-tight font-semibold items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] transition ${
                            selected
                              ? "border-[#b8c5b0] bg-[#f0f5ed] text-[#3f5838]"
                              : "border-[#e1e3de] text-[#555850] hover:bg-[#f7f8f5]"
                          }`}
                          key={member.id}
                        >
                          <input
                            checked={selected}
                            className="sr-only"
                            onChange={() => toggleRecipient(member.id)}
                            type="checkbox"
                            value={member.id}
                          />
                          {selected && (
                            <Check
                              aria-hidden="true"
                              className="hidden size-2.5"
                            />
                          )}
                          {member.name || member.email || "Workspace member"}
                        </label>
                      );
                    })
                  )}
                </div>
                <label className="sr-only" htmlFor="workspace-mention-message">
                  Message
                </label>
                <textarea
                  autoFocus
                  className="block font-semibold tracking-tight min-h-14 w-full  resize-none field-sizing-content rounded-md border-2 border-[#dfe2dc] px-2.5 py-1.5 text-xs outline-none placeholder:text-[#999] focus:border-[#9ca795] focus:ring-2 focus:ring-[#9ca795]/20 disabled:opacity-60"
                  id="workspace-mention-message"
                  maxLength={500}
                  onChange={(event) => setMessage(event.currentTarget.value)}
                  placeholder="Write a short message…"
                  required
                  value={message}
                />
              </fieldset>
              {error && (
                <p className="mt-1.5 text-[11px] text-[#b42318]" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-1.5 font-semibold tracking-tight flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#868880]">
                  {selectedRecipients.length} selected · {message.length}/500
                </span>
                <button
                  className="flex items-center gap-0.5 rounded-full bg-[#242620] px-2 py-1 text-xs font-semibold text-white transition hover:bg-[#3b3d36] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    sending ||
                    loading ||
                    selectedRecipients.length === 0 ||
                    !message.trim()
                  }
                  type="submit"
                >
                  {sending ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-3 animate-spin"
                    />
                  ) : (
                    <AtSign aria-hidden="true" className="size-3" />
                  )}
                  Mention
                </button>
              </div>
            </form>
          ) : null}
        </section>
      )}
      {open &&
        selectedMention &&
        mentionDetailPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <section
            aria-label="Mention message details"
            aria-modal="false"
            className="fixed z-[100] flex max-h-[min(78vh,360px)] w-[min(252px,calc(100vw-16px))] flex-col overflow-hidden rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_24px_rgba(20,24,18,0.14)]"
            ref={mentionDetailRef}
            role="dialog"
            style={mentionDetailPosition}
          >
            <header className="flex py-0.5 shrink-0 items-center justify-between border-b border-[#e7e8e4] px-2">
              <h2 className="min-w-0 truncate text-[12px] font-semibold tracking-tight text-[#60625d]">
                {mentionSummary(selectedMention)}
              </h2>
              <div className="flex items-center tracking-tight gap-1">
                <div className="relative">
                  <button
                    aria-label="Close message details"
                    className="flex size-6 items-center justify-center rounded-md text-[#686a64] transition hover:bg-[#eff0ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
                    onClick={() => setSelectedMention(null)}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              </div>
            </header>
            <div className="min-h-0 font-semibold tracking-tight overflow-y-auto px-3 py-1">
              <time
                className=" block text-[10px] text-[#868880]"
                dateTime={selectedMention.createdAt}
              >
                {formatMentionDate(selectedMention.createdAt)}
              </time>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#4c4e48]">
                {selectedMention.message}
              </p>
              <div className="mt-4 border-t hidden border-[#e7e8e4] pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#868880]">
                  Mentioned
                </p>
                <p className="mt-1 break-words text-xs text-[#555850]">
                  {selectedMention.recipientIds.map(memberName).join(", ")}
                </p>
              </div>
            </div>
          </section>,
          document.body,
        )}
      {open &&
        actionsOpen &&
        actionsMenuPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={actionsMenuRef}
            className="z-[100] w-max rounded-md border border-[#dfe2dc] bg-white shadow-[0_6px_18px_rgba(20,24,18,0.14)]"
            role="menu"
            style={{
              position: "fixed",
              top: actionsMenuPosition.top,
              left: Math.min(actionsMenuPosition.left, window.innerWidth - 180),
            }}
          >
            <button
              className="flex w-fit items-center gap-2 rounded px-2 py-1 text-left tracking-tight text-xs font-medium text-[#555850] transition hover:bg-[#f4f5f1] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={markingRead || unreadCount === 0}
              onClick={() => void markAllAsRead()}
              role="menuitem"
              type="button"
            >
              <MailOpen aria-hidden="true" className="size-3.5 shrink-0" />
              {markingRead ? "Marking as read…" : "Mark all as read"}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
