import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiKeySummary } from "./DeveloperPanel";
import WorkspaceShell from "./WorkspaceShell";

export const maxDuration = 60;

export default function WorkspacePage() {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <WorkspaceContent />
    </Suspense>
  );
}

async function WorkspaceContent() {
  await connection();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: memberships, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  if (error) {
    throw new Error("Unable to load your workspaces.");
  }

  if (!memberships?.length) redirect("/onboarding");

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .in(
      "id",
      memberships.map((membership) => membership.workspace_id),
    );

  if (workspaceError) {
    throw new Error("Unable to load your workspaces.");
  }

  const { data: apiKeys, error: apiKeysError } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (apiKeysError) {
    throw new Error("Unable to load your API keys.");
  }

  const { data: subscriptionIsPro, error: subscriptionError } =
    await supabase.rpc("has_active_pro_subscription");
  const billingStatusError = subscriptionError
    ? "Pro status is unavailable. Apply the Pro billing migration to your Supabase database, then refresh."
    : "";
  const isPro = subscriptionIsPro === true;

  const displayName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : "";
  const avatarCandidate =
    typeof user.user_metadata.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : typeof user.user_metadata.picture === "string"
        ? user.user_metadata.picture
        : "";
  let avatarUrl: string | null = null;
  try {
    const parsedAvatarUrl = new URL(avatarCandidate);
    if (
      parsedAvatarUrl.protocol === "https:" &&
      (parsedAvatarUrl.hostname === "avatars.githubusercontent.com" ||
        parsedAvatarUrl.hostname.endsWith(".googleusercontent.com"))
    ) {
      avatarUrl = parsedAvatarUrl.toString();
    }
  } catch {
    avatarUrl = null;
  }

  return (
    <WorkspaceShell
      displayName={displayName}
      avatarUrl={avatarUrl}
      email={user.email ?? ""}
      billingStatusError={billingStatusError}
      isPro={isPro}
      apiKeys={apiKeys.map((key): ApiKeySummary => ({
        id: key.id,
        name: key.name,
        prefix: key.key_prefix,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        revokedAt: key.revoked_at,
      }))}
      workspaces={workspaces ?? []}
    />
  );
}

function WorkspaceLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#fbfcf9] text-sm text-[#777]">
      <p className="geist text-center text-sm font-medium leading-4 tracking-tight text-[#999]">
        Loading workspace...
      </p>
    </main>
  );
}
