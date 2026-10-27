import { createPolar } from "@polar-sh/sdk/2026-10";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPolarEnvironment,
  getPolarReturnUrl,
  isSameOriginRequest,
} from "@/lib/billing/polar";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const formSchema = z.object({ workspace_id: z.uuid() });
const checkoutClaimSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("claimed"), purchase_id: z.uuid() }),
  z.object({
    status: z.literal("existing"),
    purchase_id: z.uuid(),
    checkout_url: z.url(),
  }),
  z.object({
    status: z.enum(["in_progress", "stale"]),
    purchase_id: z.uuid(),
  }),
]);

export async function POST(request: NextRequest) {
  let siteUrl: string;
  try {
    siteUrl = getPolarReturnUrl();
  } catch {
    return Response.json(
      { error: "Unable to verify checkout request origin." },
      { status: 403 },
    );
  }
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: "Invalid checkout request origin." },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid checkout request." }, { status: 400 });
  }
  const parsedForm = formSchema.safeParse({
    workspace_id: formData.get("workspace_id"),
  });
  if (!parsedForm.success) {
    return Response.json({ error: "Select a valid workspace." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { error: "Please sign in to purchase workspace credits." },
      { status: 401 },
    );
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", parsedForm.data.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    return Response.json(
      { error: "Unable to verify workspace ownership. Please try again." },
      { status: 503 },
    );
  }
  if (membership?.role !== "owner") {
    return Response.json(
      { error: "Only the workspace owner can purchase credits." },
      { status: 403 },
    );
  }

  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const productId = process.env.POLAR_WORKSPACE_CREDITS_PRODUCT_ID;
  if (!accessToken || !productId) {
    return Response.json(
      { error: "Workspace credit billing is not configured yet." },
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
    "claim_workspace_credit_checkout",
    {
      p_workspace_id: parsedForm.data.workspace_id,
      p_purchaser_id: user.id,
      p_product_id: productId,
    },
  );
  const claim = checkoutClaimSchema.safeParse(claimData);
  if (claimError || !claim.success) {
    return Response.json(
      { error: "Unable to prepare workspace credit checkout. Please retry." },
      { status: 503 },
    );
  }
  if (claim.data.status === "existing") {
    return NextResponse.redirect(claim.data.checkout_url, { status: 303 });
  }

  const purchaseId = claim.data.purchase_id;
  if (claim.data.status !== "claimed") {
    const workspaceStatusUrl = () => {
      const url = new URL("/workspace", siteUrl);
      url.searchParams.set("workspace_credits", "processing");
      url.searchParams.set("workspace_id", parsedForm.data.workspace_id);
      return url;
    };

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
        { error: "Unable to verify an existing checkout. Please retry." },
        { status: 503 },
      );
    }

    const now = Date.now();
    const existingCheckout = checkoutList.items.find(
      (checkout) =>
        checkout.status === "open" &&
        Date.parse(checkout.expires_at) > now &&
        checkout.metadata?.workspace_credit_purchase_id === purchaseId,
    );
    if (existingCheckout) {
      const { data: saved, error: saveError } = await admin.rpc(
        "save_workspace_credit_checkout",
        {
          p_purchase_id: purchaseId,
          p_purchaser_id: user.id,
          p_checkout_id: existingCheckout.id,
          p_checkout_url: existingCheckout.url,
          p_expires_at: existingCheckout.expires_at,
        },
      );
      if (saveError || saved !== true) {
        return Response.json(
          { error: "Unable to restore the checkout session. Please retry." },
          { status: 503 },
        );
      }
      return NextResponse.redirect(existingCheckout.url, { status: 303 });
    }

    if (claim.data.status === "in_progress") {
      return NextResponse.redirect(workspaceStatusUrl(), { status: 303 });
    }

    const { data: reclaimed, error: reclaimError } = await admin.rpc(
      "reclaim_workspace_credit_checkout",
      { p_purchase_id: purchaseId, p_purchaser_id: user.id },
    );
    if (reclaimError || reclaimed !== true) {
      return NextResponse.redirect(workspaceStatusUrl(), { status: 303 });
    }
  }

  const successUrl = new URL("/workspace", siteUrl);
  successUrl.searchParams.set("workspace_credits", "success");
  successUrl.searchParams.set("checkout_id", "{CHECKOUT_ID}");

  let checkout: Awaited<ReturnType<typeof polar.checkouts.create>>;
  try {
    checkout = await polar.checkouts.create(
      {
        products: [productId],
        external_customer_id: user.id,
        customer_email: user.email ?? undefined,
        success_url: successUrl
          .toString()
          .replaceAll("%7BCHECKOUT_ID%7D", "{CHECKOUT_ID}"),
        return_url: new URL("/workspace?workspace_credits=return", siteUrl).toString(),
        metadata: { workspace_credit_purchase_id: purchaseId },
      },
      { timeout: 15 },
    );
  } catch (error) {
    console.error("Polar workspace credit checkout creation failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Non-Error exception",
    });
    return Response.json(
      { error: "Unable to start Polar checkout. Please retry shortly." },
      { status: 503 },
    );
  }

  const { data: saved, error: saveError } = await admin.rpc(
    "save_workspace_credit_checkout",
    {
      p_purchase_id: purchaseId,
      p_purchaser_id: user.id,
      p_checkout_id: checkout.id,
      p_checkout_url: checkout.url,
      p_expires_at: checkout.expires_at,
    },
  );
  if (saveError || saved !== true) {
    console.error("Unable to save the Polar workspace credit checkout.", {
      error: saveError,
      purchaseId,
    });
    return Response.json(
      {
        error:
          "Checkout was created but could not be saved. Retry shortly to resume it.",
      },
      { status: 503 },
    );
  }

  return NextResponse.redirect(checkout.url, { status: 303 });
}
