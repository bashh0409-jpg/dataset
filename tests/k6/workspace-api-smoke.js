import http from "k6/http";
import { check } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const authCookie = __ENV.AUTH_COOKIE;

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate==1"],
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
  },
};

http.setResponseCallback(http.expectedStatuses(200, 400, 401, 403, 503));

function isStatus(response, allowedStatuses) {
  return allowedStatuses.includes(response.status);
}

export default function workspaceApiSmoke() {
  const workspaceResponse = http.get(`${baseUrl}/workspace`, {
    redirects: 0,
    headers: authCookie ? { Cookie: authCookie } : {},
    tags: { route: "/workspace" },
  });

  if (authCookie) {
    check(workspaceResponse, {
      "authenticated /workspace responds with HTTP 200": (response) =>
        response.status === 200,
      "authenticated /workspace renders workspace content": (response) =>
        typeof response.body === "string" &&
        response.body.toLowerCase().includes("workspace"),
    });
  } else {
    check(workspaceResponse, {
      "unauthenticated /workspace redirects to sign-in": (response) =>
        (response.status >= 300 &&
          response.status < 400 &&
          response.headers.Location === "/") ||
        (response.status === 200 &&
          typeof response.body === "string" &&
          response.body.includes('__next-page-redirect') &&
          response.body.includes("url=/")),
    });
  }

  const billingPortalResponse = http.get(`${baseUrl}/api/billing/portal`, {
    tags: { route: "/api/billing/portal" },
  });
  check(billingPortalResponse, {
    "billing portal rejects unauthenticated request": (response) =>
      isStatus(response, [401, 503]),
  });

  const originHeaders = {
    Origin: baseUrl,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const checkoutResponse = http.post(
    `${baseUrl}/api/billing/checkout`,
    "",
    { headers: originHeaders, tags: { route: "/api/billing/checkout" } },
  );
  check(checkoutResponse, {
    "subscription checkout rejects unauthenticated request": (response) =>
      isStatus(response, [401, 403]),
  });

  const creditsCheckoutResponse = http.post(
    `${baseUrl}/api/billing/workspace-credits/checkout`,
    "workspace_id=invalid",
    {
      headers: originHeaders,
      tags: { route: "/api/billing/workspace-credits/checkout" },
    },
  );
  check(creditsCheckoutResponse, {
    "workspace credits checkout rejects invalid workspace input": (
      response,
    ) => isStatus(response, [400, 403]),
  });

  const webhookResponse = http.post(
    `${baseUrl}/api/webhooks/polar`,
    "{}",
    {
      headers: { "Content-Type": "application/json" },
      tags: { route: "/api/webhooks/polar" },
    },
  );
  check(webhookResponse, {
    "Polar webhook rejects request without signature metadata": (response) =>
      isStatus(response, [400, 503]),
  });
}
