import { extractOpenRouterContent } from "../generator/ai-schema";

const maxTitleLength = 120;

export function normalizeConversationTitle(value: string) {
  const firstLine = value
    .replace(/```(?:text)?/gi, "")
    .trim()
    .split(/\r?\n/, 1)[0]
    .replace(/^title\s*:\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!firstLine) return null;
  if (firstLine.length <= maxTitleLength) return firstLine;

  const shortened = firstLine.slice(0, maxTitleLength - 3);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 0 ? lastSpace : shortened.length).trimEnd()}...`;
}

export function getConversationTitleFromCompletion(payload: unknown) {
  const completion = extractOpenRouterContent(payload);
  return completion.status === "content"
    ? normalizeConversationTitle(completion.content)
    : null;
}

export function createFallbackConversationTitle(message: string) {
  return (
    normalizeConversationTitle(message.replace(/\s+/g, " ").trim()) ||
    "New conversation"
  );
}
