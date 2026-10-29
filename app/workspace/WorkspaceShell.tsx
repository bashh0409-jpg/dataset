"use client";

import Image from "next/image";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Ellipsis,
  FilePlus2,
  LayoutGrid,
  Pencil,
  Pin,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  listAiConversations,
  deleteAiConversation,
  getAiConversation,
  renameAiConversation,
  setAiConversationArchived,
  setAiConversationPinned,
  updateAiConversationMetadata,
  type AiConversationSummary,
} from "@/app/actions/ai-conversations";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import DeveloperPanel, { type ApiKeySummary } from "./DeveloperPanel";
import BugReportDialog from "./BugReportDialog";
import GeneratorPanel from "./GeneratorPanel";
import WorkspaceMentions from "./WorkspaceMentions";
import WorkspaceAccessDialog from "./WorkspaceAccessDialog";
import WorkspaceToolbar from "./WorkspaceToolbar";

const conversationColorClasses: Record<
  Exclude<AiConversationSummary["color"], null>,
  string
> = {
  gray: "bg-[#8b8d86]",
  red: "bg-[#d4615c]",
  orange: "bg-[#dc8a45]",
  yellow: "bg-[#d4b643]",
  green: "bg-[#61a477]",
  blue: "bg-[#5a91c6]",
  purple: "bg-[#9271b5]",
};

type Workspace = {
  id: string;
  name: string;
  role: "owner" | "member";
  hasProAccess: boolean;
  creditBalance: number;
};

type AiModel = "qwen" | "auto" | "claude" | "openai";

type WorkspaceShellProps = {
  displayName: string;
  avatarUrl: string | null;
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
  comingSoon?: boolean;
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
    comingSoon: true,
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
    id: "apps",
    label: "Apps",
    comingSoon: true,
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
  avatarUrl,
  email,
  isPro,
  billingStatusError,
  apiKeys,
  workspaces,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<WorkspaceView>("generate");
  const [aiModel, setAiModel] = useState<AiModel>("qwen");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceMenuPosition, setWorkspaceMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [accessDialog, setAccessDialog] = useState<"invite" | "manage" | null>(
    null,
  );
  const [creditPurchaseStatus, setCreditPurchaseStatus] = useState<
    "success" | "return" | "processing" | null
  >(null);
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const closeBugReport = useCallback(() => setBugReportOpen(false), []);
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
  const workspacePickerRef = useRef<HTMLDivElement>(null);
  const workspacePickerButtonRef = useRef<HTMLButtonElement>(null);
  const workspaceFlyoutRef = useRef<HTMLElement>(null);
  const conversationListRequestsRef = useRef(
    new Map<string, ReturnType<typeof listAiConversations>>(),
  );

  useEffect(() => {
    if (!accountOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [accountOpen]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !workspacePickerRef.current?.contains(target) &&
        !workspaceFlyoutRef.current?.contains(target)
      ) {
        setWorkspaceMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [workspaceMenuOpen]);

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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      const purchaseStatus = url.searchParams.get("workspace_credits");
      if (
        purchaseStatus !== "success" &&
        purchaseStatus !== "return" &&
        purchaseStatus !== "processing"
      ) {
        return;
      }
      const workspaceId = url.searchParams.get("workspace_id");
      if (
        workspaceId &&
        workspaces.some((workspace) => workspace.id === workspaceId)
      ) {
        setActiveWorkspaceId(workspaceId);
      }
      setCreditPurchaseStatus(purchaseStatus);
      setAccessDialog("manage");
      url.searchParams.delete("workspace_credits");
      url.searchParams.delete("checkout_id");
      url.searchParams.delete("workspace_id");
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [workspaces]);

  const activeChats = savedConversations.filter((chat) => !chat.archived);
  const archivedChats = savedConversations.filter((chat) => chat.archived);

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0];
  const hasPremiumModelAccess =
    isPro ||
    activeWorkspace?.hasProAccess === true ||
    (activeWorkspace?.creditBalance ?? 0) > 0;
  const effectiveAiModel =
    hasPremiumModelAccess && aiModel === "qwen" ? "auto" : aiModel;
  const selectedWorkspaceId = activeWorkspace?.id;
  const canDeleteConversations = activeWorkspace?.role === "owner";
  const conversationStorageKey = `synthetic.activeConversationId.${activeWorkspace?.id ?? ""}`;
  const activeConversation =
    savedConversations.find((chat) => chat.id === activeConversationId) ?? null;
  const matchingConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return savedConversations;

    return savedConversations.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(query) ||
        conversation.label?.toLowerCase().includes(query),
    );
  }, [savedConversations, search]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    let active = true;
    const restoreFrame = window.requestAnimationFrame(() => {
      if (!active) return;
      const conversationId = window.localStorage.getItem(
        `synthetic.activeConversationId.${selectedWorkspaceId}`,
      );
      if (!conversationId) return;
      setRequestedConversationId(conversationId);
      setActiveConversationId(conversationId);
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(restoreFrame);
    };
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    let active = true;
    let request = conversationListRequestsRef.current.get(selectedWorkspaceId);
    if (!request) {
      request = listAiConversations(selectedWorkspaceId);
      conversationListRequestsRef.current.set(selectedWorkspaceId, request);
      const requestToClear = request;
      void request.then(
        () => {
          if (
            conversationListRequestsRef.current.get(selectedWorkspaceId) ===
            requestToClear
          ) {
            conversationListRequestsRef.current.delete(selectedWorkspaceId);
          }
        },
        () => {
          if (
            conversationListRequestsRef.current.get(selectedWorkspaceId) ===
            requestToClear
          ) {
            conversationListRequestsRef.current.delete(selectedWorkspaceId);
          }
        },
      );
    }

    void request
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
  }, [selectedWorkspaceId]);

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
    window.localStorage.setItem(
      `synthetic.activeConversationId.${conversation.workspaceId}`,
      conversation.id,
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
        workspaceId: chat.workspaceId,
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
    window.localStorage.removeItem(conversationStorageKey);
    setRequestedConversationId(null);
    setActiveConversationId(null);
    setNewConversationToken((token) => token + 1);
    setActiveView("generate");
    setConversationError("");
  };

  const switchWorkspace = (workspaceId: string) => {
    setWorkspaceMenuOpen(false);
    if (workspaceId === activeWorkspaceId) return;
    setActiveWorkspaceId(workspaceId);
    setSavedConversations([]);
    setRequestedConversationId(null);
    setActiveConversationId(null);
    setNewConversationToken((token) => token + 1);
    setOpenChatMenuId(null);
    setRenamingChatId(null);
    setConversationError("");
  };

  const toggleWorkspaceMenu = () => {
    if (workspaceMenuOpen) {
      setWorkspaceMenuOpen(false);
      return;
    }

    const bounds = workspacePickerButtonRef.current?.getBoundingClientRect();
    if (bounds) {
      setWorkspaceMenuPosition({
        left: Math.max(8, Math.min(bounds.right + 8, window.innerWidth - 276)),
        top: Math.max(8, Math.min(bounds.top, window.innerHeight - 300)),
      });
    }
    setWorkspaceMenuOpen(true);
  };

  const openSavedChat = (id: string) => {
    window.localStorage.setItem(conversationStorageKey, id);
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
        workspaceId: chat.workspaceId,
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

  const removeChat = async (chat: AiConversationSummary) => {
    if (!canDeleteConversations) {
      setConversationError(
        "Only the workspace owner can delete conversations.",
      );
      return;
    }
    if (
      !window.confirm(
        `Delete "${chat.title}" and its generated data? This cannot be undone.`,
      )
    ) {
      setOpenChatMenuId(null);
      return;
    }

    setUpdatingChatId(chat.id);
    setConversationError("");
    try {
      const result = await deleteAiConversation({
        id: chat.id,
        workspaceId: chat.workspaceId,
      });
      if ("error" in result) {
        setConversationError(result.error);
        return;
      }

      setSavedConversations((current) =>
        current.filter((savedChat) => savedChat.id !== result.data.id),
      );
      setOpenChatMenuId(null);
      if (activeConversationId === result.data.id) {
        window.localStorage.removeItem(
          `synthetic.activeConversationId.${chat.workspaceId}`,
        );
        setActiveConversationId(null);
        setRequestedConversationId(null);
        setNewConversationToken((token) => token + 1);
        setConversationError("");
      }
    } catch {
      setConversationError("A network error occurred while deleting the chat.");
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
    await renameConversation(chat, title);
  };

  const renameConversation = async (
    chat: AiConversationSummary,
    title: string,
  ) => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setConversationError("Chat names cannot be empty.");
      return;
    }
    if (normalizedTitle === chat.title) {
      setRenamingChatId(null);
      return;
    }
    setUpdatingChatId(chat.id);
    setConversationError("");
    try {
      const result = await renameAiConversation({
        id: chat.id,
        workspaceId: chat.workspaceId,
        title: normalizedTitle,
      });
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

  const updateConversationMetadata = async (
    chat: AiConversationSummary,
    metadata: {
      label?: string | null;
      color?: AiConversationSummary["color"];
    },
  ) => {
    setUpdatingChatId(chat.id);
    setConversationError("");
    try {
      const result = await updateAiConversationMetadata({
        id: chat.id,
        workspaceId: chat.workspaceId,
        ...metadata,
      });
      if ("error" in result) {
        setConversationError(result.error);
        return;
      }
      updateSavedChat(result.data);
    } catch {
      setConversationError(
        "A network error occurred while updating conversation details.",
      );
    } finally {
      setUpdatingChatId(null);
    }
  };

  const exportConversation = async () => {
    if (!activeConversation) return;
    setConversationError("");
    try {
      const result = await getAiConversation({
        id: activeConversation.id,
        workspaceId: activeConversation.workspaceId,
      });
      if ("error" in result) {
        setConversationError(result.error);
        return;
      }

      const contents = JSON.stringify(
        {
          title: result.data.title,
          exportedAt: new Date().toISOString(),
          messages: result.data.messages,
          generatedTables: result.data.artifacts,
        },
        null,
        2,
      );
      const url = URL.createObjectURL(
        new Blob([contents], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${
        result.data.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 80) || "conversation"
      }.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setConversationError("Unable to export this conversation. Please retry.");
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
              <span
                aria-hidden="true"
                className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${
                  chat.color ? conversationColorClasses[chat.color] : ""
                }`}
              />
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
          {chat.label && (
            <span className="max-w-16 fint-medium truncate rounded px-1 text-[9px] text-[#777a72] max-[640px]:hidden">
              <Tag aria-hidden="true" className="size-3.5 shrink-0" />
            </span>
          )}
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
              {canDeleteConversations && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-[#a64239] hover:bg-[#fff4f2] disabled:opacity-50"
                  disabled={updatingChatId === chat.id}
                  onClick={() => void removeChat(chat)}
                  role="menuitem"
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Delete
                </button>
              )}
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
              onClick={() => router.back()}
              title="Go back"
              type="button"
            >
              <ArrowLeft />
            </button>
            <button
              aria-label="Go forward"
              className="workspace-toolbar-button cursor-pointer"
              onClick={() => router.forward()}
              title="Go forward"
              type="button"
            >
              <ArrowRight />
            </button>
            {activeWorkspace && (
              <WorkspaceMentions
                key={activeWorkspace.id}
                workspaceId={activeWorkspace.id}
              />
            )}
            <div className="relative">
              <button
                aria-label={searchOpen ? "Close search" : "Search workspace"}
                aria-expanded={searchOpen}
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
              {searchOpen && (
                <section
                  aria-label="Conversation search results"
                  className="absolute left-0 top-[calc(100%+6px)] z-[70] max-h-[min(78vh,620px)] w-[min(300px,calc(100vw-84px))] overflow-y-auto rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_24px_rgba(20,24,18,0.14)]"
                  role="region"
                >
                  <header className="flex items-center justify-between border-b border-[#e7e8e4] px-2.5 py-1.5">
                    <h2 className="text-[13px] font-semibold tracking-tight text-[#60625d]">
                      Conversations
                    </h2>
                    <span className="text-[11px] capitalize font-semibold tracking-tight text-[#868880]"></span>
                    <h2 className="text-[13px] font-semibold tracking-tight text-[#60625d]">
                      {matchingConversations.length}{" "}
                      {matchingConversations.length === 1
                        ? "result"
                        : "results"}
                    </h2>
                  </header>
                  <label className="flex h-8 items-center gap-2 border-b border-[#e7e8e4] bg-white px-2.5">
                    <Search
                      aria-hidden="true"
                      className="size-[13px] shrink-0 text-[#888a84]"
                    />
                    <input
                      autoFocus
                      aria-label="Search conversations"
                      className="min-w-0 flex-1 font-medium tracking-tight bg-transparent text-[12px] outline-none placeholder:text-[#a0a19c]"
                      onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSearch("");
                          setSearchOpen(false);
                        }
                      }}
                      placeholder="Search conversations"
                      value={search}
                    />
                    <span className="shrink-0 hidden text-[10px] font-medium text-[#868880]">
                      {matchingConversations.length}
                    </span>
                  </label>

                  {matchingConversations.length > 0 ? (
                    <ul className="space-y-0.5 p-1">
                      {matchingConversations.map((conversation) => (
                        <li key={conversation.id}>
                          <button
                            className="flex w-full items-center font-semibold tracking-tight text-[12px] gap-2 rounded-md px-2 py-2 text-left transition hover:bg-[#f0f3eb] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#858780]"
                            onClick={() => {
                              openSavedChat(conversation.id);
                              setSearch("");
                              setSearchOpen(false);
                            }}
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className={`size-2 shrink-0 rounded-full ${
                                conversation.color
                                  ? conversationColorClasses[conversation.color]
                                  : "bg-[#c9cbc5]"
                              }`}
                            />
                            <span className="min-w-0 flex-1 text-[10px] truncate text-[11px] font-semibold text-[#4c4e48]">
                              {conversation.title}
                            </span>
                            {conversation.archived && (
                              <span className="shrink-0 rounded bg-[#eff0ec] px-1.5 py-0.5 text-[9px] text-[#777a72]">
                                Archived
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-5 font-semibold tracking-tight text-center text-[11px] text-[#868880]">
                      {search.trim()
                        ? `No conversations match “${search.trim()}”.`
                        : "No saved conversations yet."}
                    </p>
                  )}
                </section>
              )}
            </div>
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

        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden px-[9px] max-[640px]:px-[6px]">
          <div className="flex shrink-0 items-center justify-between gap-2 px-[1px]">
            {workspaces.length > 1 && (
              <div className="relative" ref={workspacePickerRef}>
                <button
                  aria-expanded={workspaceMenuOpen}
                  aria-haspopup="dialog"
                  aria-label="Select workspace"
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-[#686a64] transition hover:bg-[#eff0ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
                  onClick={toggleWorkspaceMenu}
                  ref={workspacePickerButtonRef}
                  title="Select workspace"
                  type="button"
                >
                  <span className="truncate text-[12px] font-medium tracking-[-0.02em] text-[#646660] max-[640px]:sr-only">
                    {activeWorkspace?.name ?? "Workspace"}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-[14px] shrink-0 transition-transform ${workspaceMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {workspaceMenuOpen &&
                  workspaceMenuPosition &&
                  createPortal(
                    <section
                      aria-label="Workspaces"
                      aria-modal="false"
                      className="fixed z-[100] w-[min(260px,calc(100vw-32px))] overflow-hidden rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_24px_rgba(20,24,18,0.14)]"
                      ref={workspaceFlyoutRef}
                      role="dialog"
                      style={workspaceMenuPosition}
                    >
                      <header className="flex py-0.5 px-2 shrink-0 items-center justify-between border-b border-[#e7e8e4]">
                        <h2 className="text-[13px]  font-semibold tracking-tight text-[#60625d]">
                          Workspaces
                        </h2>
                        <div className="flex items-center capitalize tracking-tight gap-1">
                          {" "}
                          <span className="text-[12px] font-semibold text-[#686a64]">
                            {workspaces.length}{" "}
                            {workspaces.length === 1
                              ? "workspace"
                              : "workspaces"}
                          </span>
                        </div>
                      </header>
                      <div className="max-h-[min(60vh,360px)] font-semibold overflow-y-auto p-1">
                        {workspaces.map((workspace) => {
                          const selected = workspace.id === activeWorkspace?.id;
                          return (
                            <button
                              aria-pressed={selected}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs tracking-tight transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#858780] ${
                                selected
                                  ? "bg-[#f0f3eb] text-[#3f5838]"
                                  : "text-[#555850] hover:bg-[#f4f5f1]"
                              }`}
                              key={workspace.id}
                              onClick={() => switchWorkspace(workspace.id)}
                              type="button"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {workspace.name}
                              </span>
                              {selected && (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  height="16px"
                                  viewBox="0 -960 960 960"
                                  width="16px"
                                  fill="currentColor"
                                >
                                  <path d="M0-160v-80h160v-40q-33 0-56.5-23.5T80-360v-400q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v400q0 33-23.5 56.5T800-280v40h160v80H0Zm160-200h640v-400H160v400Zm0 0v-400 400Z" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>,
                    document.body,
                  )}
              </div>
            )}
            {workspaces.length <= 1 && (
              <p className="truncate text-[12px] font-medium my-2 tracking-[-0.02em] text-[#646660] max-[640px]:sr-only">
                {activeWorkspace?.name ?? "Workspace"}
              </p>
            )}
          </div>

          <nav
            aria-label="Workspace  sections"
            className="mt-4 shrink-0 space-y-[2px]"
          >
            {navigation.map(({ id, label, icon, comingSoon }) => (
              <button
                aria-current={activeView === id ? "page" : undefined}
                aria-disabled={comingSoon || undefined}
                className={`workspace-section-link ${
                  activeView === id ? "workspace-section-link-active" : ""
                } ${comingSoon ? "cursor-not-allowed opacity-60" : ""}`}
                disabled={comingSoon}
                key={id}
                onClick={() => {
                  if (!comingSoon) setActiveView(id);
                }}
                title={comingSoon ? `${label} — coming soon` : label}
                type="button"
              >
                <span className="ml-2 flex size-[18px] shrink-0 items-center justify-center">
                  {icon}
                </span>

                <span className="truncate font-medium tracking-tight max-[640px]:sr-only">
                  {label}
                </span>
                {comingSoon && (
                  <span className="ml-auto rounded  px-1.5 py-0.5 text-xs tracking-tight lowercase font-medium text-[#858780] max-[640px]:hidden">
                    Coming soon
                  </span>
                )}
              </button>
            ))}
          </nav>

          <section
            aria-label="Saved chats"
            className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <p className="mb-2 shrink-0 truncate text-xs font-medium tracking-[-0.02em] text-[#646660] max-[640px]:sr-only">
              Saved Chats
            </p>
            {conversationError && (
              <p
                className="mb-2 shrink-0 rounded bg-[#ffebee] px-1 py-1 text-[10px] font-medium leading-tight tracking-tight text-[#a64239]"
                role="alert"
              >
                {conversationError}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {activeChats.length === 0 ? (
                <p className="mb-1 truncate text-[12px] font-medium tracking-tight text-[#999] max-[640px]:sr-only">
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
            </div>
          </section>
        </div>

        <div className="p-2 leading-tight font-semibold hidden text-xs" >New notification about the application changes will appear here</div>

        <footer className="shrink-0  border-t border-[#e9ebe6]">
          <div className="relative border-t border-[#eef0eb] px-[8px] py-2">
            {accountOpen &&
              createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 px-4 py-8 backdrop-blur-[2px]"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setAccountOpen(false);
                    }
                  }}
                >
                  <section
                    aria-labelledby="account-dialog-title"
                    aria-modal="true"
                    className="w-full max-w-sm rounded-3xl bg-white px-2 pt-4 pb-3 text-[#111827] shadow-xl"
                    id="account-dialog"
                    role="dialog"
                  >
                    <header className="flex items-start px-2 justify-between gap-4 border-b border-[#e7e8e4] pb-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e7e9e3] text-sm font-semibold text-[#686a64]">
                          {avatarUrl && !avatarFailed ? (
                            <Image
                              alt=""
                              className="object-cover"
                              fill
                              onError={() => setAvatarFailed(true)}
                              sizes="40px"
                              src={avatarUrl}
                            />
                          ) : (
                            (displayName || email || "A")
                              .charAt(0)
                              .toUpperCase()
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="geist text-left text-sm font-medium leading-4 tracking-tight ">
                            {displayName || email}
                          </p>
                          <p className="truncate text-sm font-medium leading-4 tracking-tight text-[#999]"></p>
                          {displayName && (
                            <p className="geist text-left text-sm font-medium leading-4 tracking-tight text-[#999]">
                              {email}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        aria-label="Close account menu"
                        autoFocus
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[#686a64] transition hover:bg-[#f1f2ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
                        onClick={() => setAccountOpen(false)}
                        type="button"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </header>
                    <div className="mt-2">
                      {signOutError && (
                        <p
                          role="alert"
                          className="geist mb-1 rounded px-2 py-1  bg-[#fff1f0] text-left text-sm font-medium leading-4 tracking-tight text-[#999]"
                        >
                          {signOutError}
                        </p>
                      )}

                      <button
                        disabled={signingOut}
                        onClick={signOut}
                        type="button"
                        className="flex w-full  jusify-between items-center gap-3 py-2 px-2 rounded hover:bg-black/5"
                      >
                        <div className="min-w-0  flex flex-row items-cente gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="18px"
                            viewBox="0 -960 960 960"
                            width="18px"
                            fill="currentColor"
                            className="rotate-180"
                          >
                            <path d="M200-120q-33 0-56.5-23.5T120-200v-160h80v160h560v-560H200v160h-80v-160q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm220-160-56-58 102-102H120v-80h346L364-622l56-58 200 200-200 200Z" />
                          </svg>

                          <div className="min-w-0 flex-1">
                            <p className="geist text-left text-sm font-medium leading-4 tracking-tight ">
                              {signingOut ? "Signing out..." : "Sign out"}
                            </p>

                            <p className="geist hidden text-left text-sm font-medium leading-4 tracking-tight text-[#999]">
                              You will be signed out
                            </p>
                          </div>
                        </div>
                      </button>
                      <button
                        className="flex w-full items-center gap-3 rounded px-2 py-2 hover:bg-black/5"
                        onClick={() => {
                          setAccountOpen(false);
                          setBugReportOpen(true);
                        }}
                        type="button"
                      >
                        <div className="min-w-0  flex flex-row items-cente gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="18px"
                            viewBox="0 -960 960 960"
                            width="18px"
                            fill="currentColor"
                          >
                            <path d="M480-200q66 0 113-47t47-113v-160q0-66-47-113t-113-47q-66 0-113 47t-47 113v160q0 66 47 113t113 47Zm-80-120h160v-80H400v80Zm0-160h160v-80H400v80Zm80 40Zm0 320q-65 0-120.5-32T272-240H160v-80h84q-3-20-3.5-40t-.5-40h-80v-80h80q0-20 .5-40t3.5-40h-84v-80h112q14-23 31.5-43t40.5-35l-64-66 56-56 86 86q28-9 57-9t57 9l88-86 56 56-66 66q23 15 41.5 34.5T688-640h112v80h-84q3 20 3.5 40t.5 40h80v80h-80q0 20-.5 40t-3.5 40h84v80H688q-32 56-87.5 88T480-120Z" />
                          </svg>

                          <div className="min-w-0 flex-1">
                            <p className="geist text-left text-sm font-medium leading-4 tracking-tight ">
                              Report bug
                            </p>
                          </div>
                        </div>
                      </button>
                      <button className="flex w-full  jusify-between items-center gap-3 py-2 px-2 rounded hover:bg-black/5">
                        <div className="min-w-0  flex flex-row items-cente gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="18px"
                            viewBox="0 -960 960 960"
                            width="18px"
                            fill="currentColor"
                          >
                            <path d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" />
                          </svg>

                          <div className="min-w-0 flex-1">
                            <p className="geist text-left text-sm font-medium leading-4 tracking-tight ">
                              Documentation
                            </p>
                          </div>
                        </div>
                      </button>
                      <button className="flex w-full  jusify-between items-center gap-3 py-2 px-2 rounded hover:bg-black/5">
                        <div className="min-w-0  flex flex-row items-cente gap-2">
                          <span className="relative flex size-[20px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e7e9e3] text-[10px] font-semibold text-[#686a64]">
                            {avatarUrl && !avatarFailed ? (
                              <Image
                                alt=""
                                className="object-cover"
                                fill
                                onError={() => setAvatarFailed(true)}
                                sizes="20px"
                                src={avatarUrl}
                              />
                            ) : (
                              (displayName || email || "A")
                                .charAt(0)
                                .toUpperCase()
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="geist text-left text-sm font-medium leading-4 tracking-tight ">
                              Personal settings
                            </p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </section>
                </div>,
                document.body,
              )}
            {bugReportOpen && (
              <BugReportDialog onClose={closeBugReport} />
            )}
            <button
              aria-expanded={accountOpen}
              aria-controls="account-dialog"
              aria-haspopup="dialog"
              aria-label="Account menu"
              className="flex  w-full min-w-0 items-center gap-[7px] py-0.5 rounded-lg px-1 pr-3 text-left transition hover:bg-[#f1f2ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#858780]"
              onClick={() => setAccountOpen((open) => !open)}
              type="button"
            >
              <span className="relative flex size-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e7e9e3] text-[10px] font-semibold text-[#686a64]">
                {avatarUrl && !avatarFailed ? (
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    onError={() => setAvatarFailed(true)}
                    sizes="26px"
                    src={avatarUrl}
                  />
                ) : (
                  (displayName || email || "A").charAt(0).toUpperCase()
                )}
              </span>
              <span className="truncate text-[11px] font-semibold hidden text-[#656761] max-[640px]:sr-only">
                {displayName || email || "Account"}
              </span>
              <span className="truncate text-[11px] font-semibold text-[#999] max-[640px]:sr-only">
                {email}
              </span>

              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="14px"
                viewBox="0 -960 960 960"
                width="14px"
                className="ml-auto"
                fill="#999"
              >
                <path d="M480-120 300-300l58-58 122 122 122-122 58 58-180 180ZM358-598l-58-58 180-180 180 180-58 58-122-122-122 122Z" />
              </svg>
            </button>
          </div>
        </footer>
      </aside>

      <section
        aria-label={`${viewLabels[activeView]} workspace`}
        className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden"
      >
        <WorkspaceToolbar
          activeConversation={activeConversation}
          billingStatusError={billingStatusError}
          canInvite={activeWorkspace?.role === "owner"}
          isPro={hasPremiumModelAccess}
          isPersonalPro={isPro}
          workspaceCreditBalance={activeWorkspace?.creditBalance ?? 0}
          workspaceId={activeWorkspace?.id ?? ""}
          model={effectiveAiModel}
          onArchiveConversation={() =>
            activeConversation
              ? toggleChatArchived(activeConversation)
              : Promise.resolve()
          }
          onColorConversation={(color) =>
            activeConversation
              ? updateConversationMetadata(activeConversation, { color })
              : Promise.resolve()
          }
          onDeleteConversation={() =>
            activeConversation
              ? removeChat(activeConversation)
              : Promise.resolve()
          }
          canDeleteConversation={canDeleteConversations}
          onExportConversation={exportConversation}
          onLabelConversation={(label) =>
            activeConversation
              ? updateConversationMetadata(activeConversation, { label })
              : Promise.resolve()
          }
          onModelChange={setAiModel}
          onPinConversation={() =>
            activeConversation
              ? toggleChatPinned(activeConversation)
              : Promise.resolve()
          }
          onRenameConversation={(title) =>
            activeConversation
              ? renameConversation(activeConversation, title)
              : Promise.resolve()
          }
          onManage={() => setAccessDialog("manage")}
          onInvite={() => {
            if (activeWorkspace?.role === "owner") {
              setAccessDialog("invite");
            }
          }}
          workspaceName={activeWorkspace?.name ?? "Your workspace"}
        />
        {accessDialog && activeWorkspace && (
          <WorkspaceAccessDialog
            isOwner={activeWorkspace.role === "owner"}
            mode={accessDialog}
            onClose={() => {
              setAccessDialog(null);
              setCreditPurchaseStatus(null);
            }}
            creditPurchaseStatus={creditPurchaseStatus}
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
          <div className="absolute inset-0 min-h-0 overflow-hidden">
            <GeneratorPanel
              key={`${newConversationToken}:${requestedConversationId ?? "new"}`}
              workspaceId={activeWorkspace?.id ?? ""}
              isPro={hasPremiumModelAccess}
              model={effectiveAiModel}
              onWorkspaceCreditsChanged={() => router.refresh()}
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
