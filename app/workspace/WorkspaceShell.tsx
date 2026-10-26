"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  AtSign,
  ChevronDown,
  Command,
  FilePlus2,
  Folder,
  KeyRound,
  LayoutGrid,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import DeveloperPanel, { type ApiKeySummary } from "./DeveloperPanel";
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
  icon: typeof Sparkles;
}[] = [
  { id: "generate", label: "Generate", icon: Sparkles },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "schemas", label: "Schemas", icon: Folder },
  { id: "apps", label: "Apps", icon: LayoutGrid },
  { id: "developer", label: "Developer", icon: KeyRound },
];

const viewLabels: Record<WorkspaceView, string> = {
  generate: "Generate",
  activity: "Activity",
  schemas: "Schemas",
  apps: "Apps",
  developer: "Developer",
  manage: "Workspace members",
};

export default function WorkspaceShell({
  displayName,
  email,
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
              aria-label="Start generating"
              className="workspace-compose-button cursor-pointer"
              onClick={() => setActiveView("generate")}
              title="Start generating"
              type="button"
            >
              <FilePlus2 />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-[9px] py-[8px] max-[640px]:px-[6px]">
          <div className="mb-[9px] flex h-[25px] items-center justify-between gap-2 px-[1px]">
            <p className="truncate text-[12px] font-medium tracking-[-0.02em] text-[#646660] max-[640px]:sr-only">
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
            {filteredNavigation.map(({ id, label, icon: Icon }) => (
              <button
                aria-current={activeView === id ? "page" : undefined}
                className={`workspace-section-link ${
                  activeView === id ? "workspace-section-link-active" : ""
                }`}
                key={id}
                onClick={() => setActiveView(id)}
                type="button"
              >
                <Icon aria-hidden="true" className="size-[14px] shrink-0" />
                <span className="truncate max-[640px]:sr-only">{label}</span>
              </button>
            ))}
            {searchOpen && filteredNavigation.length === 0 && (
              <p className="px-1 py-2 text-[11px] text-[#90918b]">
                No matching sections
              </p>
            )}
          </nav>
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
                <button
                  className={Button}
                  
                  type="button"
                >
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
        ) : (
          <div aria-hidden="true" className="workspace-watermark">
            Synthetic Data
          </div>
        )}
      </section>
    </main>
  );
}
