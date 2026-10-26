"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generatorRequestSchema } from "@/lib/generator/engine";

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

const artifactInputSchema = z
  .object({
    conversationId: conversationIdSchema,
    name: z.string().trim().min(1).max(80),
    fields: z.array(z.unknown()).min(1).max(25),
    records: z
      .array(
        z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()]),
        ),
      )
      .min(1)
      .max(500),
    count: z.number().int().min(1).max(500),
    seed: z.number().int().min(0).max(2_147_483_647),
  })
  .superRefine((artifact, context) => {
    if (artifact.records.length !== artifact.count) {
      context.addIssue({
        code: "custom",
        message: "Record count does not match the generated data.",
        path: ["records"],
      });
    }
    if (
      !generatorRequestSchema.safeParse({
        name: artifact.name,
        fields: artifact.fields,
        count: artifact.count,
        seed: artifact.seed,
      }).success
    ) {
      context.addIssue({
        code: "custom",
        message: "Generated data has an invalid schema.",
        path: ["fields"],
      });
    }
    if (new TextEncoder().encode(JSON.stringify(artifact)).byteLength > 1_000_000) {
      context.addIssue({
        code: "custom",
        message: "Generated data is too large to save.",
        path: ["records"],
      });
    }
  });

const storedArtifactSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  fields: z.array(z.unknown()).min(1).max(25),
  records: z.array(
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  ).max(500),
  count: z.number().int().min(1).max(500),
  seed: z.number().int().min(0).max(2_147_483_647),
  created_at: z.iso.datetime({ offset: true }),
});

export type AiGeneratedArtifact = {
  id: string;
  name: string;
  fields: z.infer<typeof generatorRequestSchema>["fields"];
  records: Record<string, string | number | boolean>[];
  count: number;
  seed: number;
  createdAt: string;
};

export type AiConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
};

export type AiConversation = AiConversationSummary & {
  messages: z.infer<typeof messagesSchema>;
  artifacts: AiGeneratedArtifact[];
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
  artifacts: AiGeneratedArtifact[],
): AiConversation {
  return {
    id: row.id,
    title: row.title,
    messages: row.messages,
    updatedAt: row.updated_at,
    pinned: row.pinned,
    archived: row.archived,
    artifacts,
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

  const { data: artifactRows, error: artifactsError } = await auth.supabase
    .from("ai_generated_artifacts")
    .select("id, name, fields, records, count, seed, created_at")
    .eq("conversation_id", parsedId.data)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });

  if (artifactsError) {
    return {
      error:
        "Unable to load generated data. Apply the generated artifacts migration, then try again.",
    };
  }

  const parsedArtifacts = z.array(storedArtifactSchema).safeParse(artifactRows);
  if (!parsedArtifacts.success) {
    return { error: "This chat contains generated data in an invalid format." };
  }

  const artifacts: AiGeneratedArtifact[] = [];
  for (const artifact of parsedArtifacts.data) {
    const parsedDataset = generatorRequestSchema.safeParse({
      name: artifact.name,
      fields: artifact.fields,
      count: artifact.count,
      seed: artifact.seed,
    });
    if (!parsedDataset.success || artifact.records.length !== artifact.count) {
      return { error: "This chat contains generated data in an invalid format." };
    }
    artifacts.push({
      id: artifact.id,
      name: artifact.name,
      fields: parsedDataset.data.fields,
      records: artifact.records,
      count: artifact.count,
      seed: artifact.seed,
      createdAt: artifact.created_at,
    });
  }

  return { data: toConversation(parsedConversation.data, artifacts) };
}

export async function saveAiGeneratedArtifact(
  input: unknown,
): Promise<ConversationResult<AiGeneratedArtifact>> {
  const parsedInput = artifactInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { error: "This generated dataset is invalid or too large to save." };
  }

  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to save generated data." };

  const parsedDataset = generatorRequestSchema.safeParse({
    name: parsedInput.data.name,
    fields: parsedInput.data.fields,
    count: parsedInput.data.count,
    seed: parsedInput.data.seed,
  });
  if (!parsedDataset.success) {
    return { error: "This generated dataset has an invalid schema." };
  }

  const { data, error } = await auth.supabase
    .from("ai_generated_artifacts")
    .insert({
      conversation_id: parsedInput.data.conversationId,
      user_id: auth.user.id,
      name: parsedDataset.data.name,
      fields: parsedDataset.data.fields,
      records: parsedInput.data.records,
      count: parsedInput.data.count,
      seed: parsedInput.data.seed,
    })
    .select("id, name, fields, records, count, seed, created_at")
    .single();

  if (error || !data) {
    return {
      error:
        "Unable to save generated data. Confirm the generated artifacts migration is applied and try again.",
    };
  }

  const parsedArtifact = storedArtifactSchema.safeParse(data);
  if (!parsedArtifact.success) {
    return { error: "Saved generated data has an invalid format." };
  }

  return {
    data: {
      id: parsedArtifact.data.id,
      name: parsedArtifact.data.name,
      fields: parsedDataset.data.fields,
      records: parsedArtifact.data.records,
      count: parsedArtifact.data.count,
      seed: parsedArtifact.data.seed,
      createdAt: parsedArtifact.data.created_at,
    },
  };
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
