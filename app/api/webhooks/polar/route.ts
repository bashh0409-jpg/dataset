import { Webhooks } from "@polar-sh/nextjs";
import type { models } from "@polar-sh/sdk/2026-10";
import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function syncSubscription(subscription: models.Subscription) {
  const proProductId = process.env.POLAR_PRO_PRODUCT_ID;
  if (!proProductId) {
    throw new Error("POLAR_PRO_PRODUCT_ID is not configured.");
  }
  if (subscription.product_id !== proProductId) return;

  let userId = subscription.customer.external_id;
  const supabase = createSupabaseAdminClient();

  if (!userId) {
    const { data, error } = await supabase
      .from("plan_subscriptions")
      .select("user_id")
      .eq("polar_customer_id", subscription.customer_id)
      .maybeSingle();

    if (error) throw new Error("Unable to find the Polar customer.");
    userId = data?.user_id ?? null;
  }

  if (!userId) {
    throw new Error("Polar subscription has no matching Synthetic user.");
  }

  const { error } = await supabase.rpc("sync_polar_subscription", {
    p_user_id: userId,
    p_polar_customer_id: subscription.customer_id,
    p_polar_subscription_id: subscription.id,
    p_product_id: subscription.product_id,
    p_status: subscription.status,
    p_current_period_start: subscription.current_period_start,
    p_current_period_end: subscription.current_period_end,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_polar_modified_at: subscription.modified_at,
  });

  if (error) throw new Error("Unable to save the Polar subscription.");
}

const subscriptionHandler = (subscription: models.Subscription) =>
  syncSubscription(subscription);

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json(
      { error: "Polar webhooks are not configured." },
      { status: 503 },
    );
  }

  return Webhooks({
    webhookSecret,
    onSubscriptionCreated: ({ data }) => subscriptionHandler(data),
    onSubscriptionUpdated: ({ data }) => subscriptionHandler(data),
    onSubscriptionActive: ({ data }) => subscriptionHandler(data),
    onSubscriptionCanceled: ({ data }) => subscriptionHandler(data),
    onSubscriptionCycled: ({ data }) => subscriptionHandler(data),
    onSubscriptionPastDue: ({ data }) => subscriptionHandler(data),
    onSubscriptionPaused: ({ data }) => subscriptionHandler(data),
    onSubscriptionResumed: ({ data }) => subscriptionHandler(data),
    onSubscriptionRevoked: ({ data }) => subscriptionHandler(data),
    onSubscriptionUncanceled: ({ data }) => subscriptionHandler(data),
  })(request);
}
