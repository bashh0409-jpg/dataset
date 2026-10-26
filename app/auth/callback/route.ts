import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code || !supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(
      new URL("/?authError=1", request.url),
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/?authError=1", request.url),
    );
  }

  const requestedNext = request.nextUrl.searchParams.get("next");
  const inviteToken = requestedNext?.match(
    /^\/invite\/([A-Za-z0-9_-]{40,60})$/,
  )?.[1];
  const user = data.user;
  const createdAt = Date.parse(user.created_at);
  const lastSignInAt = user.last_sign_in_at
    ? Date.parse(user.last_sign_in_at)
    : Number.NaN;
  const isNewAccount =
    Number.isFinite(createdAt) &&
    Number.isFinite(lastSignInAt) &&
    lastSignInAt >= createdAt &&
    lastSignInAt - createdAt < 5 * 60 * 1000;

  if (inviteToken && isNewAccount) {
    const onboardingUrl = new URL("/onboarding", request.url);
    onboardingUrl.searchParams.set("invite", inviteToken);
    return NextResponse.redirect(onboardingUrl);
  }

  const nextUrl = requestedNext
    ? new URL(requestedNext, request.url)
    : new URL("/onboarding", request.url);
  const destination =
    nextUrl.origin === request.nextUrl.origin && requestedNext?.startsWith("/")
      ? nextUrl
      : new URL("/onboarding", request.url);

  return NextResponse.redirect(destination);
}
