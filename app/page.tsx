import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Hero from "./components/Hero";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Navbar from "./components/Navbar";

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
    <div>
      <Navbar />
      <Hero />
      <section
        data-nav-theme="white"
        className="h-full min-h-screen w-full bg-white"
      ></section>
      <section
        data-nav-theme="black"
        className="h-full min-h-screen w-full bg-black"
      ></section>
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