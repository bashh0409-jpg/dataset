import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const options = {
  vus: 1,
  iterations: 3,
  thresholds: {
    checks: ["rate==1"],
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
  },
};

const publicRoutes = [
  { path: "/", content: "Synthetic data" },
  { path: "/terms", content: "Legal" },
  { path: "/privacy", content: "Legal" },
];

export default function publicRouteSmoke() {
  for (const route of publicRoutes) {
    const response = http.get(`${baseUrl}${route.path}`, {
      tags: { route: route.path },
    });

    check(response, {
      [`${route.path} responds with HTTP 200`]: (result) =>
        result.status === 200,
      [`${route.path} renders expected content`]: (result) =>
        typeof result.body === "string" &&
        result.body.includes(route.content),
    });

    sleep(0.3);
  }
}
