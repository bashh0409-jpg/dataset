import type { Environment } from "@polar-sh/sdk/2026-10";

export function getPolarEnvironment(): Environment {
  const environment = process.env.POLAR_ENVIRONMENT ?? "production";
  if (environment !== "production" && environment !== "sandbox") {
    throw new Error("POLAR_ENVIRONMENT must be production or sandbox.");
  }
  return environment;
}

export function getPolarReturnUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required for Polar billing.");
  }

  const url = new URL(siteUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS.");
  }
  return url.origin;
}
