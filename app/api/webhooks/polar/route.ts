import { models, webhooks } from "@polar-sh/sdk/2026-10";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function syncSubscription(
  eventId: string,
  eventType: string,
  subscription: models.Subscription,
) {
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

  const { error } = await supabase.rpc("apply_polar_subscription_webhook", {
    p_webhook_event_id: eventId,
    p_event_type: eventType,
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

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json(
      { error: "Polar webhooks are not configured." },
      { status: 503 },
    );
  }

  const eventId = request.headers.get("webhook-id");
  if (!eventId) {
    return Response.json({ error: "Missing webhook event ID." }, { status: 400 });
  }

  let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
  try {
    const body = await request.text();
    event = await webhooks.validateEvent(
      body,
      Object.fromEntries(request.headers.entries()),
      webhookSecret,
    );
  } catch {
    return Response.json({ error: "Invalid Polar webhook signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "order.paid": {
        const creditsProductId = process.env.POLAR_WORKSPACE_CREDITS_PRODUCT_ID;
        if (
          creditsProductId &&
          event.data.product_id === creditsProductId &&
          event.data.paid
        ) {
          const metadata = z
            .object({ workspace_credit_purchase_id: z.uuid() })
            .safeParse(event.data.metadata);
          if (!metadata.success) {
            throw new Error("Workspace credit order is missing purchase metadata.");
          }

          const supabase = createSupabaseAdminClient();
          const { error } = await supabase.rpc(
            "apply_workspace_credit_purchase",
            {
              p_webhook_event_id: eventId,
              p_event_type: event.type,
              p_purchase_id: metadata.data.workspace_credit_purchase_id,
              p_order_id: event.data.id,
              p_product_id: creditsProductId,
            },
          );
          if (error) {
            throw new Error("Unable to apply the workspace credit purchase.");
          }
        }
        break;
      }
      case "subscription.created":
      case "subscription.updated":
      case "subscription.active":
      case "subscription.canceled":
      case "subscription.cycled":
      case "subscription.past_due":
      case "subscription.paused":
      case "subscription.resumed":
      case "subscription.revoked":
      case "subscription.uncanceled":
        await syncSubscription(eventId, event.type, event.data);
        break;
      default:
        break;
    }
  } catch {
    return Response.json(
      { error: "Unable to process the Polar webhook. Please retry." },
      { status: 500 },
    );
  }

  return Response.json({ received: true });
}
