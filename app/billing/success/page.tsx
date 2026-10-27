"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ConfirmationState =
  | { state: "missing" | "waiting" | "error" }
  | { state: "paid"; expiresAt: string };

export default function BillingSuccess() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    state: "waiting",
  });

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;
    let setupErrorTimer: number | undefined;

    try {
      const client = createSupabaseBrowserClient();
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        if (isMounted) {
          setUser(session?.user ?? null);
          setAuthLoaded(true);
        }
      });
      unsubscribe = () => subscription.unsubscribe();

      void client.auth.getSession().then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setConfirmation({ state: "error" });
        } else {
          setUser(data.session?.user ?? null);
        }
        setAuthLoaded(true);
      }).catch((error: unknown) => {
        console.error("Unable to load the billing session.", error);
        if (!isMounted) return;
        setConfirmation({ state: "error" });
        setAuthLoaded(true);
      });
    } catch (error) {
      console.error("Unable to initialize billing confirmation.", error);
      setupErrorTimer = window.setTimeout(() => {
        setAuthLoaded(true);
        setConfirmation({ state: "error" });
      }, 0);
    }

    return () => {
      isMounted = false;
      unsubscribe?.();
      if (setupErrorTimer) window.clearTimeout(setupErrorTimer);
    };
  }, []);

  useEffect(() => {
    if (!authLoaded) return;

    const checkoutId = new URLSearchParams(window.location.search).get(
      "checkout_id",
    );
    const userId = user?.id;
    if (!checkoutId || !userId) {
      const state = checkoutId ? "error" : "missing";
      const unavailableTimer = window.setTimeout(() => {
        setConfirmation({ state });
      }, 0);
      return () => window.clearTimeout(unavailableTimer);
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    let setupErrorTimer: number | undefined;
    let client: ReturnType<typeof createSupabaseBrowserClient>;

    try {
      client = createSupabaseBrowserClient();
    } catch (error) {
      console.error("Unable to initialize billing confirmation.", error);
      setupErrorTimer = window.setTimeout(() => {
        setConfirmation({ state: "error" });
      }, 0);
      return () => window.clearTimeout(setupErrorTimer);
    }

    const confirmPayment = async (attempt: number) => {
      const { data, error } = await client
        .from("plan_subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (
        !error &&
        data &&
        (data.status === "active" || data.status === "trialing") &&
        Date.parse(data.current_period_end) > Date.now()
      ) {
        setConfirmation({
          state: "paid",
          expiresAt: data.current_period_end,
        });
        return;
      }

      if (attempt >= 9) {
        setConfirmation({ state: "error" });
        return;
      }

      retryTimer = window.setTimeout(() => {
        void confirmPayment(attempt + 1);
      }, 2_000);
    };

    void confirmPayment(0);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (setupErrorTimer) window.clearTimeout(setupErrorTimer);
    };
  }, [authLoaded, user?.id]);

  const heading =
    confirmation.state === "paid"
      ? "Payment successful!"
      : confirmation.state === "waiting"
        ? "Confirming payment…"
        : confirmation.state === "missing"
          ? "Payment confirmation unavailable"
          : "Could not confirm payment";
  const detail =
    confirmation.state === "paid"
      ? `Your Synthetic Pro subscription is active${
          confirmation.expiresAt
            ? ` until ${new Date(confirmation.expiresAt).toLocaleDateString()}.`
            : "."
        }`
      : confirmation.state === "waiting"
        ? "We received your return from checkout and are waiting for Polar to confirm your payment. This normally takes a few moments."
        : confirmation.state === "missing"
          ? "This page needs the checkout confirmation details. Return to your workspace and try again if you completed payment."
          : "We could not confirm this checkout yet. Return to your workspace and refresh in a moment, or contact support if you were charged.";

  return (
    <div className="min-h-screen bg-white text-black flex items-center justify-center p-4">
      <div className="text-center items-center flex  flex-col gap-2 max-w-md">
        <p className="mon geist  max-w-xs text-center  overflow-hidden text-xl font-semibold tracking-tighter text-black mb-2 ">
          {heading}
        </p>

        <p className="geist  max-w-xs text-center  overflow-hidden text-[13px] font-semibold leading-3 tracking-tight text-[#999]">
          {detail}
        </p>

        <Link
          href="/workspace"
          className="w-fit  geist capitalize max-h-7 rounded-3xl border border-black/10 bg-black/[0.03] px-2 py-1 text-sm font-medium leading-4 tracking-tight text-[#333] [overflow-wrap:anywhere]"
        >
          close
        </Link>
      </div>
    </div>
  );
}
