import { Checkout } from "@polar-sh/nextjs";
import { NextRequest } from "next/server";
import { getPolarEnvironment, getPolarReturnUrl } from "@/lib/billing/polar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
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

  try {
    const siteUrl = getPolarReturnUrl();
    const checkoutRequestUrl = new URL(request.url);
    checkoutRequestUrl.search = "";
    checkoutRequestUrl.searchParams.set("products", productId);
    checkoutRequestUrl.searchParams.set("external_customer_id", user.id);
    if (user.email) {
      checkoutRequestUrl.searchParams.set("customer_email", user.email);
    }

    const checkout = Checkout({
      accessToken,
      environment: getPolarEnvironment(),
      successUrl: new URL("/workspace?billing=success", siteUrl).toString(),
      returnUrl: new URL("/workspace", siteUrl).toString(),
    });

    return await checkout(
      new NextRequest(checkoutRequestUrl, { headers: request.headers }),
    );
  } catch {
    return Response.json(
      { error: "Unable to start Polar checkout. Please try again." },
      { status: 503 },
    );
  }
}
