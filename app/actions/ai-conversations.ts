"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const conversationIdSchema = z.uuid();
const messagesSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(4_000),
    }),
  )
  .min(1)
  .max(100)
  .refine(
    (messages) =>
      messages.reduce((total, message) => total + message.content.length, 0) <=
      20_000,
  );

const saveInputSchema = z.object({
  id: conversationIdSchema.optional(),
  messages: messagesSchema,
});

const updatePinnedInputSchema = z.object({
  id: conversationIdSchema,
  pinned: z.boolean(),
});

const updateArchivedInputSchema = z.object({
  id: conversationIdSchema,
  archived: z.boolean(),
});

const renameInputSchema = z.object({
  id: conversationIdSchema,
  title: z.string().trim().min(1).max(120),
});

const storedConversationSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  messages: messagesSchema,
  pinned: z.boolean(),
  archived: z.boolean(),
  updated_at: z.iso.datetime({ offset: true }),
});

export type AiConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
};

export type AiConversation = AiConversationSummary & {
  messages: z.infer<typeof messagesSchema>;
};

type ConversationResult<T> = { data: T } | { error: string };

async function getAuthenticatedSupabase() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return { supabase, user };
}

function toConversation(
  row: z.infer<typeof storedConversationSchema>,
): AiConversation {
  return {
    id: row.id,
    title: row.title,
    messages: row.messages,
    updatedAt: row.updated_at,
    pinned: row.pinned,
    archived: row.archived,
  };
}

export async function listAiConversations(): Promise<
  ConversationResult<AiConversationSummary[]>
> {
  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to view saved chats." };

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .select("id, title, updated_at, pinned, archived")
    .eq("user_id", auth.user.id)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return { error: "Unable to load saved chats. Please try again." };
  }

  return {
    data: data.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      pinned: row.pinned,
      archived: row.archived,
    })),
  };
}

export async function getAiConversation(
  input: unknown,
): Promise<ConversationResult<AiConversation>> {
  const parsedId = conversationIdSchema.safeParse(input);
  if (!parsedId.success) return { error: "Saved chat not found." };

  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to open saved chats." };

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .select("id, title, messages, pinned, archived, updated_at")
    .eq("id", parsedId.data)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to open this saved chat." };
  }

  const parsedConversation = storedConversationSchema.safeParse(data);
  if (!parsedConversation.success) {
    return { error: "This saved chat has an invalid format." };
  }

  return { data: toConversation(parsedConversation.data) };
}

export async function saveAiConversation(
  input: unknown,
): Promise<ConversationResult<AiConversationSummary>> {
  const parsedInput = saveInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      error:
        "This chat is too long to save. Start a new chat to continue saving history.",
    };
  }

  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to save this chat." };

  const firstUserMessage = parsedInput.data.messages.find(
    (message) => message.role === "user",
  );
  if (!firstUserMessage) {
    return { error: "A chat needs a user message before it can be saved." };
  }

  const title =
    firstUserMessage.content.replace(/\s+/g, " ").trim().slice(0, 120) ||
    "New conversation";
  const values = {
    messages: parsedInput.data.messages,
    updated_at: new Date().toISOString(),
  };

  const query = parsedInput.data.id
    ? auth.supabase
        .from("ai_conversations")
        .update(values)
        .eq("id", parsedInput.data.id)
        .eq("user_id", auth.user.id)
    : auth.supabase.from("ai_conversations").insert({
        ...values,
        title,
        user_id: auth.user.id,
      });
  const { data, error } = await query
    .select("id, title, updated_at, pinned, archived")
    .single();

  if (error || !data) {
    return { error: "Unable to save this chat. Please try again." };
  }

  return {
    data: {
      id: data.id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
    },
  };
}

export async function setAiConversationPinned(
  input: unknown,
): Promise<ConversationResult<AiConversationSummary>> {
  const parsedInput = updatePinnedInputSchema.safeParse(input);
  if (!parsedInput.success) return { error: "Saved chat not found." };

  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to pin saved chats." };

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .update({ pinned: parsedInput.data.pinned })
    .eq("id", parsedInput.data.id)
    .eq("user_id", auth.user.id)
    .select("id, title, updated_at, pinned, archived")
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to update this chat. Please try again." };
  }

  return {
    data: {
      id: data.id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
    },
  };
}

export async function setAiConversationArchived(
  input: unknown,
): Promise<ConversationResult<AiConversationSummary>> {
  const parsedInput = updateArchivedInputSchema.safeParse(input);
  if (!parsedInput.success) return { error: "Saved chat not found." };

  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to archive saved chats." };

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .update({
      archived: parsedInput.data.archived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsedInput.data.id)
    .eq("user_id", auth.user.id)
    .select("id, title, updated_at, pinned, archived")
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to update this chat. Please try again." };
  }

  return {
    data: {
      id: data.id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
    },
  };
}

export async function renameAiConversation(
  input: unknown,
): Promise<ConversationResult<AiConversationSummary>> {
  const parsedInput = renameInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { error: "Chat names must be between 1 and 120 characters." };
  }

  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to rename saved chats." };

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .update({
      title: parsedInput.data.title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsedInput.data.id)
    .eq("user_id", auth.user.id)
    .select("id, title, updated_at, pinned, archived")
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to rename this chat. Please try again." };
  }

  return {
    data: {
      id: data.id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
    },
  };
}

export async function deleteAiConversation(
  input: unknown,
): Promise<ConversationResult<{ id: string }>> {
  const parsedId = conversationIdSchema.safeParse(input);
  if (!parsedId.success) return { error: "Saved chat not found." };

  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to delete saved chats." };

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to delete this saved chat. Please try again." };
  }

  return { data: { id: data.id } };
}
