import { createHash } from "node:crypto";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import InviteAcceptance from "@/app/components/InviteAcceptance";
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
  await connection();

  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return <InviteError />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <InviteSignIn token={token} />;

  const { data, error } = await supabase.rpc(
    "get_workspace_invite_workspace_name",
    {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    },
  );

  if (error || typeof data !== "string") {
    return <InviteError />;
  }

  return <InviteAcceptance token={token} workspaceName={data} />;
}

function InviteLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7f7f5] text-[#171717]">
      <p className="geist text-center text-sm font-medium leading-4 tracking-tight text-[#999]">
        Loading invitation...
      </p>
    </main>
  );
}

function InviteError() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7f7f5] px-5 text-[#171717]">
      <section className="w-full max-w-md rounded-2xl p-8 ">
        <h2
          id="signin-title"
          className="geist mb-2 text-left  text-xl font-semibold tracking-tighter text-black"
        >
          Invite link unavailable
        </h2>

        <p className="geist text-left max-w-xs text-sm font-medium leading-4 tracking-tight text-[#999]">
          This invite may have expired, already been used, or was created for a
          different email address. Make sure you&apos;re signed in with the
          address that received it.
        </p>

        <Link
          className="geist underline mt-8 text-left max-w-xs text-sm font-medium leading-4 tracking-tight text-[#999]"
          href="/"
        >
          Open Synthetic
        </Link>
      </section>
    </main>
  );
}
