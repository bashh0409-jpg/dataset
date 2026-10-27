import { createPolar } from "@polar-sh/sdk/2026-10";
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { getPolarEnvironment, getPolarReturnUrl } from "@/lib/billing/polar";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const checkoutClaimSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("claimed"),
    attempt_id: z.uuid(),
  }),
  z.object({
    status: z.literal("existing"),
    attempt_id: z.uuid(),
    checkout_url: z.url(),
  }),
  z.object({
    status: z.literal("in_progress"),
    attempt_id: z.uuid(),
  }),
  z.object({
    status: z.literal("stale"),
    attempt_id: z.uuid(),
  }),
  z.object({ status: z.literal("subscribed") }),
]);

export async function POST(request: NextRequest) {
  let siteUrl: string;
  try {
    siteUrl = getPolarReturnUrl();
    const requestOrigin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    if (
      !requestOrigin ||
      new URL(requestOrigin).origin !== siteUrl ||
      fetchSite === "cross-site"
    ) {
      return Response.json(
        { error: "Invalid checkout request origin." },
        { status: 403 },
      );
    }
  } catch {
    return Response.json(
      { error: "Unable to verify checkout request origin." },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Please sign in to upgrade." }, { status: 401 });
  }

  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const productId = process.env.POLAR_PRO_PRODUCT_ID;
  if (!accessToken || !productId) {
    return Response.json(
      { error: "Polar billing is not configured yet." },
      { status: 503 },
    );
  }

  let polar: ReturnType<typeof createPolar>;
  try {
    polar = createPolar({
      accessToken,
      environment: getPolarEnvironment(),
    });
  } catch {
    return Response.json(
      { error: "Unable to start Polar checkout. Please try again." },
      { status: 503 },
    );
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return Response.json(
      { error: "Billing storage is not configured. Please try again later." },
      { status: 503 },
    );
  }
  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_polar_checkout",
    { p_user_id: user.id, p_product_id: productId },
  );
  const claim = checkoutClaimSchema.safeParse(claimData);

  if (claimError || !claim.success) {
    return Response.json(
      { error: "Unable to reserve a checkout session. Please try again." },
      { status: 503 },
    );
  }

  if (claim.data.status === "subscribed") {
    return NextResponse.redirect(new URL("/workspace", siteUrl), { status: 303 });
  }
  if (claim.data.status === "existing") {
    return NextResponse.redirect(claim.data.checkout_url, { status: 303 });
  }

  const attemptId = claim.data.attempt_id;
  if (claim.data.status !== "claimed") {
    let checkoutList;
    try {
      checkoutList = await polar.checkouts.list(
        {
          external_customer_id: user.id,
          product_id: productId,
          status: "open",
          limit: 100,
        },
        { timeout: 15 },
      );
    } catch {
      return Response.json(
        { error: "Unable to verify your existing checkout. Please retry." },
        { status: 503 },
      );
    }

    const now = Date.now();
    const existingCheckout =
      checkoutList.items.find(
        (checkout) =>
          checkout.status === "open" &&
          Date.parse(checkout.expires_at) > now &&
          checkout.metadata?.synthetic_checkout_attempt_id === attemptId,
      ) ??
      checkoutList.items.find(
        (checkout) =>
          checkout.status === "open" && Date.parse(checkout.expires_at) > now,
      );

    if (existingCheckout) {
      const { data: saved, error: saveError } = await admin.rpc(
        "save_polar_checkout",
        {
          p_user_id: user.id,
          p_attempt_id: attemptId,
          p_checkout_id: existingCheckout.id,
          p_checkout_url: existingCheckout.url,
          p_expires_at: existingCheckout.expires_at,
        },
      );
      if (saveError || saved !== true) {
        return Response.json(
          { error: "Unable to restore your checkout session. Please retry." },
          { status: 503 },
        );
      }
      return NextResponse.redirect(existingCheckout.url, { status: 303 });
    }

    if (claim.data.status === "in_progress") {
      return Response.json(
        { error: "Your checkout is being prepared. Please retry shortly." },
        { status: 409 },
      );
    }

    const { data: reclaimed, error: reclaimError } = await admin.rpc(
      "reclaim_polar_checkout",
      { p_user_id: user.id, p_attempt_id: attemptId },
    );
    if (reclaimError || reclaimed !== true) {
      return Response.json(
        { error: "Your checkout is being prepared. Please retry shortly." },
        { status: 409 },
      );
    }
  }

  try {
    const successUrl = new URL("/workspace?billing=success", siteUrl);
    successUrl.searchParams.set("checkout_id", "{CHECKOUT_ID}");
    const checkout = await polar.checkouts.create(
      {
        products: [productId],
        external_customer_id: user.id,
        customer_email: user.email ?? undefined,
        success_url: successUrl
          .toString()
          .replaceAll("%7BCHECKOUT_ID%7D", "{CHECKOUT_ID}"),
        return_url: new URL("/workspace", siteUrl).toString(),
        metadata: { synthetic_checkout_attempt_id: attemptId },
      },
      { timeout: 15 },
    );

    const { data: saved, error: saveError } = await admin.rpc(
      "save_polar_checkout",
      {
        p_user_id: user.id,
        p_attempt_id: attemptId,
        p_checkout_id: checkout.id,
        p_checkout_url: checkout.url,
        p_expires_at: checkout.expires_at,
      },
    );
    if (saveError || saved !== true) {
      return Response.json(
        {
          error:
            "Checkout was created but could not be saved. Retry shortly to resume it.",
        },
        { status: 503 },
      );
    }

    return NextResponse.redirect(checkout.url, { status: 303 });
  } catch {
    return Response.json(
      { error: "Unable to start Polar checkout. Please retry shortly." },
      { status: 503 },
    );
  }
}
