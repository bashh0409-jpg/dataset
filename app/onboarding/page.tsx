import { Suspense } from "react";
import { redirect } from "next/navigation";
import OnboardingFlow from "@/app/components/OnboardingFlow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingContent />
    </Suspense>
  );
}

async function OnboardingContent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

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
    />
  );
}

function OnboardingLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7f7f5] text-[#171717]">
      Loading onboarding...
    </main>
  );
}
