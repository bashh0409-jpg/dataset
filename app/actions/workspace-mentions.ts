"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const workspaceIdSchema = z.uuid();
const mentionSchema = z.object({
  id: z.uuid(),
  author_id: z.uuid(),
  message: z.string().min(1).max(500),
  created_at: z.iso.datetime({ offset: true }),
  recipient_ids: z.array(z.uuid()),
  is_mentioned: z.boolean(),
  read_at: z.iso.datetime({ offset: true }).nullable(),
});

export type WorkspaceMention = {
  id: string;
  authorId: string;
  message: string;
  createdAt: string;
  recipientIds: string[];
  isMentioned: boolean;
  readAt: string | null;
};

type MentionsResult =
  | { data: { mentions: WorkspaceMention[]; unreadCount: number } }
  | { error: string };

function logMentionRpcError(
  operation: string,
  error: { code: string; message: string },
) {
  console.error(`Workspace mention RPC failed: ${operation}`, {
    errorCode: error.code,
    errorMessage: error.message,
  });
}

function missingMentionRpcMessage(errorCode: string) {
  return errorCode === "PGRST202" || errorCode === "42883"
    ? "Workspace mentions aren't set up in the database yet. Apply the 20261028007000_add_workspace_mentions.sql migration, then refresh."
    : null;
}

async function getAuthenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return { supabase, user };
}

export async function getWorkspaceMentions(
  workspaceIdInput: unknown,
): Promise<MentionsResult> {
  const workspaceId = workspaceIdSchema.safeParse(workspaceIdInput);
  if (!workspaceId.success) {
    return { error: "Select a valid workspace to view mentions." };
  }

  const auth = await getAuthenticatedClient();
  if (!auth) return { error: "Please sign in again to view mentions." };

  const { data, error } = await auth.supabase.rpc("get_workspace_mentions", {
    p_workspace_id: workspaceId.data,
  });
  if (error) {
    logMentionRpcError("get_workspace_mentions", error);
    const setupMessage = missingMentionRpcMessage(error.code);
    if (setupMessage) return { error: setupMessage };
    return { error: "Unable to load workspace mentions. Please try again." };
  }

  const parsed = z.array(mentionSchema).safeParse(data);
  if (!parsed.success) {
    return { error: "Workspace mentions returned an unexpected response." };
  }

  const mentions = parsed.data.map((mention) => ({
    id: mention.id,
    authorId: mention.author_id,
    message: mention.message,
    createdAt: mention.created_at,
    recipientIds: mention.recipient_ids,
    isMentioned: mention.is_mentioned,
    readAt: mention.read_at,
  }));

  return {
    data: {
      unreadCount: mentions.filter(
        (mention) => mention.isMentioned && !mention.readAt,
      ).length,
      mentions,
    },
  };
}

export async function createWorkspaceMention(input: {
  workspaceId: unknown;
  recipientIds: unknown;
  message: unknown;
}): Promise<{ success: true } | { error: string }> {
  const workspaceId = workspaceIdSchema.safeParse(input.workspaceId);
  const recipientIds = z.array(z.uuid()).min(1).max(50).safeParse(input.recipientIds);
  const message = z.string().trim().min(1).max(500).safeParse(input.message);
  if (!workspaceId.success || !recipientIds.success || !message.success) {
    return { error: "Choose at least one member and enter a message of up to 500 characters." };
  }

  const auth = await getAuthenticatedClient();
  if (!auth) return { error: "Please sign in again to send a mention." };

  const { error } = await auth.supabase.rpc("create_workspace_mention", {
    p_workspace_id: workspaceId.data,
    p_recipient_ids: recipientIds.data,
    p_message: message.data,
  });
  if (error) {
    logMentionRpcError("create_workspace_mention", error);
    const setupMessage = missingMentionRpcMessage(error.code);
    if (setupMessage) return { error: setupMessage };
    return { error: "Unable to send the workspace mention. Please try again." };
  }

  return { success: true };
}

export async function markWorkspaceMentionsRead(input: {
  workspaceId: unknown;
  mentionIds: unknown;
}): Promise<{ success: true } | { error: string }> {
  const workspaceId = workspaceIdSchema.safeParse(input.workspaceId);
  const mentionIds = z.array(z.uuid()).max(50).safeParse(input.mentionIds);
  if (!workspaceId.success || !mentionIds.success) {
    return { error: "Unable to update mention status." };
  }

  const auth = await getAuthenticatedClient();
  if (!auth) return { error: "Please sign in again to update mentions." };

  const { error } = await auth.supabase.rpc("mark_workspace_mentions_read", {
    p_workspace_id: workspaceId.data,
    p_mention_ids: mentionIds.data,
  });
  if (error) {
    logMentionRpcError("mark_workspace_mentions_read", error);
    const setupMessage = missingMentionRpcMessage(error.code);
    if (setupMessage) return { error: setupMessage };
    return { error: "Unable to mark mentions as read. Please try again." };
  }

  return { success: true };
}
