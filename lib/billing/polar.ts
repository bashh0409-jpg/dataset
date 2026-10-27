import type { Environment } from "@polar-sh/sdk/2026-10";

export function isSameOriginRequest(request: Request): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader || request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();
    const host = forwardedHost || request.headers.get("host");
    const forwardedProtocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    const protocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);

    if (!host || (protocol !== "http" && protocol !== "https")) return false;

    const requestOrigin = new URL(originHeader);
    if (
      requestOrigin.username ||
      requestOrigin.password ||
      requestOrigin.origin !== originHeader
    ) {
      return false;
    }

    const expectedOrigin = new URL(`${protocol}://${host}`).origin;
    return requestOrigin.origin === expectedOrigin;
  } catch {
    return false;
  }
}

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
