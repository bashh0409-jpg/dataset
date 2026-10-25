import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <WorkspaceContent />
    </Suspense>
  );
}

async function WorkspaceContent() {
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

  return (
    <main className="min-h-svh bg-white px-6 pb-16 pt-28 text-[#171717] md:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#202ded]">
          Synthetic®
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
          Your workspace
        </h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace) => (
            <article
              key={workspace.id}
              className="rounded-xl border border-black/10 p-6"
            >
              <h2 className="text-xl font-semibold">{workspace.name}</h2>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function WorkspaceLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-white text-[#171717]">
      Loading workspace...
    </main>
  );
}
