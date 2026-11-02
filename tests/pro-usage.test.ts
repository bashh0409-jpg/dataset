import { describe, expect, it } from "vitest";
import {
  parseWorkspaceProAiUsage,
  PRO_AI_REQUEST_LIMIT,
} from "../lib/ai/pro-usage";

describe("workspace Pro AI usage reporting", () => {
  it("reports one request remaining just under the allowance", () => {
    const usage = parseWorkspaceProAiUsage([
      {
        used: 49,
        next_available_at: null,
        credit_balance: 0,
      },
    ]);

    expect(usage).toEqual({
      data: {
        used: 49,
        requestLimit: PRO_AI_REQUEST_LIMIT,
        remaining: 1,
        nextAvailableAt: null,
        creditBalance: 0,
      },
    });
  });

  it("reports no requests remaining and the cooldown reset at the limit", () => {
    const resetAt = "2026-03-20T14:00:00.000Z";
    const usage = parseWorkspaceProAiUsage([
      {
        used: 50,
        next_available_at: resetAt,
        credit_balance: 0,
      },
    ]);

    expect(usage).toEqual({
      data: {
        used: PRO_AI_REQUEST_LIMIT,
        requestLimit: PRO_AI_REQUEST_LIMIT,
        remaining: 0,
        nextAvailableAt: resetAt,
        creditBalance: 0,
      },
    });
  });

  it("reports the full allowance after the cooldown has expired", () => {
    const usage = parseWorkspaceProAiUsage([
      {
        used: 0,
        next_available_at: null,
        credit_balance: 0,
      },
    ]);

    expect(usage).toEqual({
      data: {
        used: 0,
        requestLimit: PRO_AI_REQUEST_LIMIT,
        remaining: PRO_AI_REQUEST_LIMIT,
        nextAvailableAt: null,
        creditBalance: 0,
      },
    });
  });
});
