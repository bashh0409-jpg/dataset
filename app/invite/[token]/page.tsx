import { createHash } from "node:crypto";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import InviteSignIn from "@/app/components/InviteSignIn";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={<InviteLoading />}>
      <InviteContent params={params} />
    </Suspense>
  );
}

async function InviteContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return <InviteError />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <InviteSignIn token={token} />;

  const { data, error } = await supabase.rpc("accept_workspace_invite", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
  });

  if (error || typeof data !== "string") {
    return <InviteError />;
  }

  redirect("/workspace");
}

function InviteLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7f7f5] text-[#171717]">
      Loading invitation...
    </main>
  );
}

function InviteError() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7f7f5] px-5 text-[#171717]">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Invite link unavailable</h1>
        <p className="mt-2 text-gray-600">
          This invite may have expired, already been used, or was created for a
          different email address.
        </p>
        <Link
          className="mt-6 inline-block font-medium text-[#202ded] underline"
          href="/"
        >
          Return to Synthetic
        </Link>
      </section>
    </main>
  );
}
