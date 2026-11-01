import { describe, expect, it } from "vitest";
import {
  createFallbackConversationTitle,
  getConversationTitleFromCompletion,
  normalizeConversationTitle,
} from "../lib/ai/conversation-title";

describe("conversation titles", () => {
  it("normalizes model output into a single concise title", () => {
    expect(normalizeConversationTitle('Title: "Generate data for users and orders"'))
      .toBe("Generate data for users and orders");
  });

  it("rejects empty or malformed model completions", () => {
    expect(
      getConversationTitleFromCompletion({
        choices: [{ message: { content: "   " } }],
      }),
    ).toBeNull();
    expect(getConversationTitleFromCompletion({ error: "unavailable" })).toBeNull();
  });

  it("does not cut a fallback title in the middle of a word", () => {
    const title = createFallbackConversationTitle(
      `Generate data for ${"customers ".repeat(20)}`,
    );

    expect(title.length).toBeLessThanOrEqual(120);
    expect(title).toMatch(/customers\.\.\.$/);
  });
});
