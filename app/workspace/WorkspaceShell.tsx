"use client";

import {
  Archive,
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  ChevronDown,
  Command,
  Ellipsis,
  FilePlus2,
  LayoutGrid,
  Pencil,
  Pin,
  Search,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  listAiConversations,
  renameAiConversation,
  setAiConversationArchived,
  setAiConversationPinned,
  type AiConversationSummary,
} from "@/app/actions/ai-conversations";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import DeveloperPanel, { type ApiKeySummary } from "./DeveloperPanel";
import GeneratorPanel from "./GeneratorPanel";
import WorkspaceAccessDialog from "./WorkspaceAccessDialog";
import WorkspaceToolbar from "./WorkspaceToolbar";

const Button =
  "w-full rounded-lg flex font-medium tracking-tight cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-[12px] text-[#686a64] transition hover:bg-[#f4f5f1] disabled:opacity-50";

type Workspace = {
  id: string;
  name: string;
};

type WorkspaceShellProps = {
  displayName: string;
  email: string;
  isPro: boolean;
  billingStatusError: string;
  apiKeys: ApiKeySummary[];
  workspaces: Workspace[];
};

type WorkspaceView =
  | "generate"
  | "activity"
  | "schemas"
  | "apps"
  | "developer"
  | "manage";

const navigation: {
  id: WorkspaceView;
  label: string;
  icon: ReactNode;
}[] = [
  {
    id: "generate",
    label: "Generate",
    icon: (
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 199 195"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M129.608 37.8861C127.627 34.8993 125.692 31.8809 123.804 28.8318L115.918 16.1007C108.224 3.67999 90.1556 3.67997 82.4621 16.1007L74.5764 28.8318C72.6877 31.8809 70.7528 34.8993 68.7722 37.8861M129.608 37.8861C140.836 54.8191 153.528 70.7345 167.538 85.4492M129.608 37.8861C109.368 39.6651 89.0117 39.6651 68.7722 37.8861M129.608 37.8861C133.178 37.5723 136.744 37.2032 140.306 36.7787L155.176 35.0063C169.683 33.2771 180.949 47.4039 176.035 61.1631L170.998 75.2659C169.792 78.6436 168.638 82.0385 167.538 85.4492M167.538 85.4492C170.009 88.0447 172.521 90.6028 175.074 93.1226L185.731 103.644C196.128 113.908 192.108 131.524 178.286 136.261L164.12 141.116C160.727 142.278 157.354 143.493 154.001 144.759M167.538 85.4492C161.3 104.785 156.77 124.632 154.001 144.759M154.001 144.759C153.512 148.31 153.079 151.869 152.7 155.436L151.119 170.327C149.577 184.856 133.297 192.696 120.976 184.843L108.348 176.794C105.323 174.867 102.27 172.987 99.19 171.155M154.001 144.759C134.994 151.938 116.653 160.771 99.19 171.155M99.19 171.155C96.1097 172.987 93.0567 174.867 90.0322 176.794L77.4035 184.843C65.0828 192.696 48.8034 184.856 47.2609 170.327L45.68 155.436C45.3013 151.869 44.8676 148.31 44.3791 144.759M99.19 171.155C81.7267 160.771 63.3861 151.938 44.3791 144.759M44.3791 144.759C41.0265 143.493 37.6532 142.278 34.2603 141.116L20.0937 136.261C6.27243 131.524 2.25171 113.908 12.649 103.644L23.3062 93.1226C25.8585 90.6028 28.3707 88.0447 30.8419 85.4492M44.3791 144.759C41.6098 124.632 37.08 104.785 30.8419 85.4492M30.8419 85.4492C29.7416 82.0385 28.5881 78.6436 27.3817 75.2659L22.3449 61.1631C17.4308 47.4039 28.6965 33.2771 43.2042 35.0063L58.0745 36.7787C61.6359 37.2032 65.2022 37.5723 68.7722 37.8861M30.8419 85.4492C44.8519 70.7345 57.544 54.8191 68.7722 37.8861"
          strokeWidth="13.5703"
          stroke="#999999"
        />
      </svg>
    ),
  },
  {
    id: "activity",
    label: "Activity",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        height="18px"
        viewBox="48 -912 864 864"
        width="18px"
        fill="#999"
      >
        <path d="M288-288h72v-192h-72v192Zm312 0h72v-384h-72v384Zm-156 0h72v-144h-72v144Zm0-192h72v-72h-72v72ZM216-144q-29.7 0-50.85-21.15Q144-186.3 144-216v-528q0-29.7 21.15-50.85Q186.3-816 216-816h528q29.7 0 50.85 21.15Q816-773.7 816-744v528q0 29.7-21.15 50.85Q773.7-144 744-144H216Zm0-72h528v-528H216v528Zm0-528v528-528Z" />
      </svg>
    ),
  },
  {
    id: "schemas",
    label: "Schemas",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        height="18px"
        viewBox="48 -912 864 864"
        width="18px"
        fill="#999"
      >
        <path d="M192-72v-216h96v-84h-96v-216h96v-60h-96v-216h264v216h-96v60h96v72h96v-72h264v216H552v-72h-96v72h-96v84h96v216H192Zm72-72h120v-72H264v72Zm0-300h120v-72H264v72Zm360 0h120v-72H624v72ZM264-720h120v-72H264v72Zm60-36Zm0 276Zm360 0ZM324-180Z" />
      </svg>
    ),
  },
  {
    id: "apps",
    label: "Apps",
    icon: <LayoutGrid aria-hidden="true" className="size-[14px]" />,
  },
  {
    id: "developer",
    label: "Console key",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        height="18px"
        viewBox="48 -912 864 864"
        width="18px"
        fill="#999"
      >
        <path d="M436-740q28-28 68-28t68 28q28 28 28 68t-28 68q-28 28-68 28t-68-28q-28-28-28-68t28-68ZM504 0 336-180l60-84-60-72 72-96v-20q-68-32-106-89.5T264-672q0-100 70-170t170-70q100 0 170 70t70 170q0 65-32.5 120T624-464v344L504 0ZM336-672q0 63 40.5 110.5T480-506v98l-52 70 59 71-58 81 76 82 47-46v-361q53-16 86.5-61T672-672q0-70-49-119t-119-49q-70 0-119 49t-49 119Z" />
      </svg>
    ),
  },
];

const viewLabels: Record<WorkspaceView, string> = {
  generate: "Generate",
  activity: "Activity",
  schemas: "Schemas",
  apps: "Apps",
  developer: "Console key",
  manage: "Workspace members",
};

export default function WorkspaceShell({
  displayName,
  email,
  isPro,
  billingStatusError,
  apiKeys,
  workspaces,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<WorkspaceView>("generate");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [accessDialog, setAccessDialog] = useState<"invite" | "manage" | null>(
    null,
  );
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    workspaces[0]?.id ?? "",
  );
  const [savedConversations, setSavedConversations] = useState<
    AiConversationSummary[]
  >([]);
  const [requestedConversationId, setRequestedConversationId] = useState<
    string | null
  >(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [newConversationToken, setNewConversationToken] = useState(0);
  const [conversationError, setConversationError] = useState("");
  const [openChatMenuId, setOpenChatMenuId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [archivedChatsOpen, setArchivedChatsOpen] = useState(false);
  const [updatingChatId, setUpdatingChatId] = useState<string | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      new URLSearchParams(window.location.search).get("billing") !== "success"
    ) {
      return;
    }

    if (isPro) {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    let refreshCount = 0;
    const refreshInterval = window.setInterval(() => {
      refreshCount += 1;
      router.refresh();
      if (refreshCount >= 30) {
        window.clearInterval(refreshInterval);
      }
    }, 2_000);

    return () => window.clearInterval(refreshInterval);
  }, [isPro, router]);

  const activeChats = savedConversations.filter((chat) => !chat.archived);
  const archivedChats = savedConversations.filter((chat) => chat.archived);

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0];
  const filteredNavigation = useMemo(
    () =>
      navigation.filter((item) =>
        item.label.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [search],
  );

  useEffect(() => {
    let active = true;
    void listAiConversations()
      .then((result) => {
        if (!active) return;
        if ("error" in result) {
          setConversationError(result.error);
        } else {
          setSavedConversations(result.data);
        }
      })
      .catch(() => {
        if (active) {
          setConversationError("Couldn't load saved chats. Please retry.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleChatSaved = useCallback((conversation: AiConversationSummary) => {
    setSavedConversations((current) =>
      [conversation, ...current.filter((item) => item.id !== conversation.id)]
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 50),
    );
    setActiveConversationId(conversation.id);
    setConversationError("");
  }, []);

  const updateSavedChat = (updatedChat: AiConversationSummary) => {
    setSavedConversations((current) =>
      current
        .map((chat) => (chat.id === updatedChat.id ? updatedChat : chat))
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    );
  };

  const toggleChatPinned = async (chat: AiConversationSummary) => {
    setUpdatingChatId(chat.id);
    setConversationError("");
    try {
      const result = await setAiConversationPinned({
        id: chat.id,
        pinned: !chat.pinned,
      });
      if ("error" in result) {
        setConversationError(result.error);
        return;
      }
      updateSavedChat(result.data);
      setOpenChatMenuId(null);
    } catch {
      setConversationError("A network error occurred while updating the chat.");
    } finally {
      setUpdatingChatId(null);
    }
  };

  const startNewChat = () => {
    setRequestedConversationId(null);
    setActiveConversationId(null);
    setNewConversationToken((token) => token + 1);
    setActiveView("generate");
    setConversationError("");
  };

  const openSavedChat = (id: string) => {
    setRequestedConversationId(id);
    setActiveConversationId(id);
    setActiveView("generate");
    setConversationError("");
  };

  const toggleChatArchived = async (chat: AiConversationSummary) => {
    setUpdatingChatId(chat.id);
    setConversationError("");
    try {
      const result = await setAiConversationArchived({
        id: chat.id,
        archived: !chat.archived,
      });
      if ("error" in result) {
        setConversationError(result.error);
        return;
      }
      updateSavedChat(result.data);
      setOpenChatMenuId(null);
    } catch {
      setConversationError("A network error occurred while updating the chat.");
    } finally {
      setUpdatingChatId(null);
    }
  };

  const beginRenameChat = (chat: AiConversationSummary) => {
    setRenameValue(chat.title);
    setRenamingChatId(chat.id);
    setOpenChatMenuId(null);
  };

  const saveChatName = async (chat: AiConversationSummary) => {
    const title = renameValue.trim();
    if (!title) {
      setConversationError("Chat names cannot be empty.");
      return;
    }
    if (title === chat.title) {
      setRenamingChatId(null);
      return;
    }
    setUpdatingChatId(chat.id);
    setConversationError("");
    try {
      const result = await renameAiConversation({ id: chat.id, title });
      if ("error" in result) {
        setConversationError(result.error);
        return;
      }
      updateSavedChat(result.data);
      setRenamingChatId(null);
    } catch {
      setConversationError("A network error occurred while renaming the chat.");
    } finally {
      setUpdatingChatId(null);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSignOutError("Couldn't sign out. Please try again.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setSignOutError("A network error occurred. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const renderChat = (chat: AiConversationSummary) => (
    <div
      className={`group relative flex min-w-0 items-center rounded-md ${
        activeConversationId === chat.id ? "bg-[#f0f2ed]" : "hover:bg-[#f4f5f1]"
      }`}
      key={chat.id}
    >
      {renamingChatId === chat.id ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            void saveChatName(chat);
          }}
        >
          <input
            aria-label="Chat name"
            autoFocus
            className="h-7 min-w-0 flex-1 rounded border border-[#dfe2da] bg-white px-1.5 text-[11px] text-[#41443d] outline-none focus:border-[#aeb3a9]"
            maxLength={120}
            onChange={(event) => setRenameValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setRenamingChatId(null);
            }}
            value={renameValue}
          />
          <button
            aria-label="Save chat name"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#686a64] hover:bg-white disabled:opacity-50"
            disabled={updatingChatId === chat.id}
            type="submit"
          >
            <Check aria-hidden="true" className="size-3.5" />
          </button>
          <button
            aria-label="Cancel renaming"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#969891] hover:bg-white"
            onClick={() => setRenamingChatId(null)}
            type="button"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </form>
      ) : (
        <>
          <button
            aria-current={activeConversationId === chat.id ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[11px] text-[#686a64] max-[640px]:justify-center max-[640px]:px-0"
            onClick={() => openSavedChat(chat.id)}
            title={chat.title}
            type="button"
          >
            <span className="truncate text-[12px] font-medium tracking-[-0.02em] text-[#777a72] max-[640px]:sr-only">
              {chat.title}
            </span>
          </button>
          <button
            aria-expanded={openChatMenuId === chat.id}
            aria-label={`Chat options: ${chat.title}`}
            className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-[#858880] opacity-0 transition hover:bg-white hover:text-[#41443d] focus-visible:opacity-100 group-hover:opacity-100 max-[640px]:opacity-100"
            onClick={() =>
              setOpenChatMenuId((openId) =>
                openId === chat.id ? null : chat.id,
              )
            }
            title="Chat options"
            type="button"
          >
            <Ellipsis aria-hidden="true" className="size-4" />
          </button>
          {chat.pinned && (
            <Pin
              aria-label="Pinned"
              className="size-3 shrink-0 fill-current text-[#8b8d86] max-[640px]:hidden"
            />
          )}
          {openChatMenuId === chat.id && (
            <div
              aria-label={`Options for ${chat.title}`}
              className="absolute right-1 top-[calc(100%-2px)] z-30 w-40 rounded-lg border border-[#e7e8e4] bg-white p-1 shadow-[0_4px_16px_rgba(20,24,18,0.12)]"
              role="menu"
            >
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-[#555752] hover:bg-[#f4f5f1]"
                onClick={() => beginRenameChat(chat)}
                role="menuitem"
                type="button"
              >
                <Pencil aria-hidden="true" className="size-3.5" />
                Rename
              </button>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-[#555752] hover:bg-[#f4f5f1] disabled:opacity-50"
                disabled={updatingChatId === chat.id}
                onClick={() => void toggleChatPinned(chat)}
                role="menuitem"
                type="button"
              >
                <Pin
                  aria-hidden="true"
                  className={`size-3.5 ${chat.pinned ? "fill-current" : ""}`}
                />
                {chat.pinned ? "Unpin" : "Pin"}
              </button>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-[#555752] hover:bg-[#f4f5f1] disabled:opacity-50"
                disabled={updatingChatId === chat.id}
                onClick={() => void toggleChatArchived(chat)}
                role="menuitem"
                type="button"
              >
                <Archive aria-hidden="true" className="size-3.5" />
                {chat.archived ? "Unarchive" : "Archive"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <main className="workspace-shell fixed inset-0 z-[60] flex min-h-svh overflow-hidden bg-[#fbfcf9] text-[#555752]">
      <aside
        aria-label="Workspace sidebar"
        className="flex w-[260px] shrink-0 flex-col border-r border-[#e9ebe6] bg-[#fbfcf9] max-[640px]:w-[68px]"
      >
        <header className="flex h-[31px] shrink-0 items-center gap-[14px] border-b border-[#eef0eb] px-[10px]">
          <div className=" p-2 flex items-center gap-[10px]">
            <button
              aria-label="Go back"
              className="workspace-toolbar-button cursor-pointer"
              onClick={() => window.history.back()}
              title="Go back"
              type="button"
            >
              <ArrowLeft />
            </button>
            <button
              aria-label="Go forward"
              className="workspace-toolbar-button cursor-pointer"
              onClick={() => window.history.forward()}
              title="Go forward"
              type="button"
            >
              <ArrowRight />
            </button>
            <button
              aria-label="Activity"
              className="workspace-toolbar-button cursor-pointer max-[640px]:hidden"
              onClick={() => setActiveView("activity")}
              title="Activity"
              type="button"
            >
              <AtSign />
            </button>
            <button
              aria-label={searchOpen ? "Close search" : "Search workspace"}
              className="workspace-toolbar-button cursor-pointer"
              onClick={() => {
                setSearchOpen((open) => !open);
                setSearch("");
              }}
              title="Search workspace"
              type="button"
            >
              {searchOpen ? <X /> : <Search />}
            </button>
            <button
              aria-label="Start a new chat"
              className="workspace-compose-button cursor-pointer"
              onClick={startNewChat}
              title="New chat"
              type="button"
            >
              <FilePlus2 />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-[9px] py-[8px] max-[640px]:px-[6px]">
          <div className="flex  items-center justify-between gap-2 px-[1px]">
            <p className="truncate mb-4 text-[12px] font-medium my-2 tracking-[-0.02em] text-[#646660] max-[640px]:sr-only">
              {activeWorkspace?.name ?? "Workspace"}
            </p>
            {workspaces.length > 1 && (
              <label className="relative">
                <span className="sr-only">Select workspace</span>
                <select
                  aria-label="Select workspace"
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  onChange={(event) => setActiveWorkspaceId(event.target.value)}
                  value={activeWorkspaceId}
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="size-[13px] text-[#858780]"
                />
              </label>
            )}
          </div>

          {searchOpen && (
            <label className="mb-2 flex h-8 items-center gap-2 rounded border border-[#e8e9e5] bg-white px-2">
              <Search
                aria-hidden="true"
                className="size-[13px] text-[#888a84]"
              />
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#a0a19c]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a section"
                value={search}
              />
            </label>
          )}

          <nav aria-label="Workspace sections" className="space-y-[2px]">
            {filteredNavigation.map(({ id, label, icon }) => (
              <button
                aria-current={activeView === id ? "page" : undefined}
                className={`workspace-section-link  ${
                  activeView === id ? "workspace-section-link-active" : ""
                }`}
                key={id}
                onClick={() => setActiveView(id)}
                type="button"
              >
                <span className="ml-2 flex size-[18px] shrink-0 items-center justify-center">
                  {icon}
                </span>

                <span className="truncate font-medium tracking-tight max-[640px]:sr-only">
                  {label}
                </span>
              </button>
            ))}
            {searchOpen && filteredNavigation.length === 0 && (
              <p className="px-1 py-2 text-[11px] text-[#90918b]">
                No matching sections
              </p>
            )}
          </nav>

          <section aria-label="Saved chats" className="mt-5">
            <p className="truncate mb-2 text-xs font-medium tracking-[-0.02em] text-[#646660] max-[640px]:sr-only">
              Saved Chats
            </p>
            {activeChats.length === 0 ? (
              <p className="truncate mb-1 text-[12px] font-medium tracking-[-0.02em] text-[#999] max-[640px]:sr-only">
                No saved chats yet
              </p>
            ) : (
              <div className="space-y-[2px]">{activeChats.map(renderChat)}</div>
            )}
            {archivedChats.length > 0 && (
              <div className="mt-3">
                <button
                  aria-expanded={archivedChatsOpen}
                  className="mb-1 flex w-full items-center gap-1 px-1 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#969891] hover:text-[#646660] max-[640px]:justify-center"
                  onClick={() => setArchivedChatsOpen((open) => !open)}
                  type="button"
                >
                  <Archive aria-hidden="true" className="size-3" />
                  <span className="max-[640px]:sr-only">Archived</span>
                  <span className="max-[640px]:sr-only">
                    {archivedChats.length}
                  </span>
                </button>
                {archivedChatsOpen && (
                  <div className="space-y-[2px]">
                    {archivedChats.map(renderChat)}
                  </div>
                )}
              </div>
            )}
            {conversationError && (
              <p
                className="px-1 py-1 text-[10px] leading-4 text-[#a64239]"
                role="alert"
              >
                {conversationError}
              </p>
            )}
          </section>
        </div>

        <footer className="shrink-0 border-t border-[#e9ebe6]">
          <div className="relative border-t border-[#eef0eb] px-[8px] py-2">
            {accountOpen && (
              <div className="absolute p-1 bottom-[calc(100%+6px)] left-2 right-2 z-10 rounded-xl border border-[#e7e8e4] bg-white shadow-[0_4px_16px_rgba(20,24,18,0.08)]">
                {signOutError && (
                  <p className=" text-[11px] text-[#b44238]" role="alert">
                    {signOutError}
                  </p>
                )}

                <button
                  className=" w-full hidden px-2 py-1.5 flex items-center text-left text-[12px] text-[#686a64] transition hover:bg-[#f4f5f1] disabled:opacity-50"
                  type="button"
                >
                  <span className="rounded-full flex justify-center text-xs text-white items-center bg-black h-6  aspect-square">
                    B
                  </span>
                  <span className="flex flex-col">
                    <span className="ml-2 text-xs tracking-tight">
                      {displayName || email || "Account"}
                    </span>
                    <span className="ml-2 text-xs tracking-tight">
                      {email || "Account"}
                    </span>
                  </span>
                </button>

                <button className={Button} type="button">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="18px"
                    viewBox="48 -912 864 864"
                    width="18px"
                    fill="currentColor"
                  >
                    <path d="M378-474q-42-42-42-102v-138q0-22.5 15.75-38.25T390-768q13.8 0 26.22 7 12.42 7 19.78 20 8-11 19-18t25-7q14 0 25.5 7t19.5 19q8-12 19.5-19t25.38-7q23.12 0 38.62 15.75Q624-734.5 624-712v136q0 60-42 102t-102 42q-60 0-102-42Zm153-51.15q21-21.15 21-50.85v-96H408v96q0 29.7 21.21 50.85 21.21 21.15 51 21.15T531-525.15ZM192-144v-96q0-24 13-45t34-33q55-32 116-49t125-17q64 0 125 17t116 49q21 12 34 33t13 45v96H192Zm72-72h432v-24q0-4.93-3-8.97-3-4.03-8-7.03-47-29-99-42.5T480-312q-54 0-106 13.5T275-256q-5 3-8 7.03-3 4.04-3 8.97v24Zm216 0Zm0-456Z" />
                  </svg>
                  Account settings
                </button>
                <button className={Button} type="button">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="18px"
                    viewBox="48 -912 864 864"
                    width="18px"
                    fill="currentColor"
                  >
                    <path d="M360-240q-29.7 0-50.85-21.15Q288-282.3 288-312v-480q0-29.7 21.15-50.85Q330.3-864 360-864h384q29.7 0 50.85 21.15Q816-821.7 816-792v480q0 29.7-21.15 50.85Q773.7-240 744-240H360Zm0-72h384v-480H360v480ZM216-96q-29.7 0-50.85-21.15Q144-138.3 144-168v-552h72v552h456v72H216Zm144-216v-480 480Z" />
                  </svg>{" "}
                  Documentation
                </button>
                <div className="p-1 border-y hidden border-[#686a64]"></div>
                <button
                  className={Button}
                  disabled={signingOut}
                  onClick={signOut}
                  type="button"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="18px"
                    viewBox="48 -912 864 864"
                    width="18px"
                    fill="currentColor"
                  >
                    <path d="M216-144q-29.7 0-50.85-21.15Q144-186.3 144-216v-528q0-29.7 21.15-50.85Q186.3-816 216-816h264v72H216v528h264v72H216Zm432-168-51-51 81-81H384v-72h294l-81-81 51-51 168 168-168 168Z" />
                  </svg>
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            )}
            <button
              aria-expanded={accountOpen}
              aria-label="Account menu"
              className="flex h-[26px] w-full min-w-0 items-center gap-[7px] rounded px-[2px] text-left transition hover:bg-[#f1f2ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#858780]"
              onClick={() => setAccountOpen((open) => !open)}
              type="button"
            >
              <span className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[#f0f1ed]">
                <Command aria-hidden="true" className="size-[10px]" />
              </span>
              <span className="truncate text-[11px] font-medium text-[#656761] max-[640px]:sr-only">
                {displayName || email || "Account"}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="ml-auto size-[12px] shrink-0 text-[#858780] max-[640px]:hidden"
              />
            </button>
          </div>
        </footer>
      </aside>

      <section
        aria-label={`${viewLabels[activeView]} workspace`}
        className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden"
      >
        <WorkspaceToolbar
          billingStatusError={billingStatusError}
          isPro={isPro}
          onManage={() => setAccessDialog("manage")}
          onInvite={() => setAccessDialog("invite")}
          workspaceName={activeWorkspace?.name ?? "Your workspace"}
        />
        {accessDialog && activeWorkspace && (
          <WorkspaceAccessDialog
            mode={accessDialog}
            onClose={() => setAccessDialog(null)}
            workspaceId={activeWorkspace.id}
            workspaceName={activeWorkspace.name}
          />
        )}
        <h1 className="sr-only">{viewLabels[activeView]}</h1>
        {activeView === "developer" ? (
          <div className="absolute inset-0 overflow-y-auto">
            <DeveloperPanel initialKeys={apiKeys} />
          </div>
        ) : activeView === "generate" ? (
          <div className="absolute inset-0 overflow-y-auto">
            <GeneratorPanel
              key={newConversationToken}
              onChatSaved={handleChatSaved}
              onConversationOpened={setActiveConversationId}
              requestedConversationId={requestedConversationId}
            />
          </div>
        ) : (
          <div aria-hidden="true" className="workspace-watermark">
            Synthetic Data
          </div>
        )}
      </section>
    </main>
  );
}
