import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createHash } from "node:crypto";
import OnboardingFlow from "@/app/components/OnboardingFlow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OnboardingContent({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  await connection();

  const { invite } = await searchParams;
  const invitationToken =
    invite && /^[A-Za-z0-9_-]{40,60}$/.test(invite) ? invite : undefined;

  if (invite && !invitationToken) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  let invitedWorkspaceName: string | undefined;
  if (invitationToken) {
    const tokenHash = createHash("sha256")
      .update(invitationToken)
      .digest("hex");
    const { data: workspaceName, error: inviteError } = await supabase.rpc(
      "get_workspace_invite_workspace_name",
      { p_token_hash: tokenHash },
    );

    if (inviteError) {
      throw new Error("Unable to check this workspace invitation.");
    }

    invitedWorkspaceName =
      typeof workspaceName === "string" ? workspaceName : undefined;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);

  if (membershipError) {
    throw new Error("Unable to check workspace membership.");
  }

  if (memberships?.length) redirect("/workspace");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Unable to load your profile.");
  }

  const metadataName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : "";

  return (
    <OnboardingFlow
      initialName={profile?.display_name ?? metadataName}
      invitationToken={invitationToken}
      invitedWorkspaceName={invitedWorkspaceName}
    />
  );
}

function OnboardingLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7f7f5] text-[#171717]">
      <p className="geist text-center text-sm font-medium leading-4 tracking-tight text-[#999]">
        Loading onboarding...
      </p>
    </main>
  );
}
