import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import LandingSignIn from "./components/LandingSignIn";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function Page() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  await connection();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/workspace");
  }

  return (
    <div className="min-h-screen flex flex-col w-full items-center justify-center">
      <h1 className="mb-3 text-3xl font-semibold capitalize tracking-tighter">
        Synthetic
      </h1>
      <LandingSignIn />
    </div>
  );
}

function HomeLoading() {
  return (
    <main className="min-h-svh bg-white" aria-label="Loading home page">
      <div className="h-svh animate-pulse bg-[#f8f8f8]" />
    </main>
  );
}
