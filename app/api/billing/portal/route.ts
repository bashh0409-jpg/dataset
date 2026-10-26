import { CustomerPortal } from "@polar-sh/nextjs";
import { NextRequest } from "next/server";
import { getPolarEnvironment, getPolarReturnUrl } from "@/lib/billing/polar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    return Response.json(
      { error: "Polar billing is not configured yet." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { error: "Please sign in to manage your plan." },
      { status: 401 },
    );
  }

  const { data: isPro, error: subscriptionError } = await supabase.rpc(
    "has_active_pro_subscription",
  );
  if (subscriptionError) {
    return Response.json(
      { error: "Unable to verify your subscription. Please try again later." },
      { status: 503 },
    );
  }

  if (!isPro) {
    return Response.json(
      { error: "An active Pro subscription is required to manage billing." },
      { status: 403 },
    );
  }

  try {
    const portal = CustomerPortal({
      accessToken,
      environment: getPolarEnvironment(),
      returnUrl: new URL("/workspace", getPolarReturnUrl()).toString(),
      getExternalCustomerId: async () => user.id,
    });
    return await portal(request);
  } catch {
    return Response.json(
      { error: "Unable to open the billing portal. Please try again." },
      { status: 503 },
    );
  }
}
