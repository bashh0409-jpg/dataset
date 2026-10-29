"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  relationalGeneratorFieldSchema,
  type RelationalGeneratorField,
  type GeneratedRecord,
  generatorRequestSchema,
} from "@/lib/generator/engine";

const conversationIdSchema = z.uuid();
const workspaceIdSchema = z.uuid();
const schemaPositionSchema = z.object({
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});
const messagesSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(4_000),
      attachmentName: z.string().trim().min(1).max(120).optional(),
      attachmentSizeBytes: z.number().int().min(0).max(64_000).optional(),
      attachmentContents: z.string().max(64_000).optional(),
      generatedArtifactId: z.uuid().optional(),
      generatedArtifactIds: z.array(z.uuid()).max(10).optional(),
      modelUsed: z.string().trim().min(1).max(120).optional(),
    }),
  )
  .min(1)
  .max(100)
  .superRefine((messages, context) => {
    if (
      messages.reduce((total, message) => total + message.content.length, 0) >
      20_000
    ) {
      context.addIssue({
        code: "custom",
        message: "Conversation text exceeds the save limit.",
      });
    }
    if (
      messages.reduce(
        (total, message) =>
          total + (message.attachmentContents?.length ?? 0),
        0,
      ) > 64_000
    ) {
      context.addIssue({
        code: "custom",
        message: "Conversation attachments exceed the save limit.",
      });
    }
  });

const saveInputSchema = z.object({
  id: conversationIdSchema.optional(),
  workspaceId: workspaceIdSchema,
  messages: messagesSchema,
});

const updatePinnedInputSchema = z.object({
  id: conversationIdSchema,
  workspaceId: workspaceIdSchema,
  pinned: z.boolean(),
});

const updateArchivedInputSchema = z.object({
  id: conversationIdSchema,
  workspaceId: workspaceIdSchema,
  archived: z.boolean(),
});

const renameInputSchema = z.object({
  id: conversationIdSchema,
  workspaceId: workspaceIdSchema,
  title: z.string().trim().min(1).max(120),
});
const artifactFieldsSchema = z.array(relationalGeneratorFieldSchema).min(1).max(25);
const storedArtifactFieldsSchema = artifactFieldsSchema;
const generatedValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
const conversationMetadataInputSchema = z
  .object({
    id: conversationIdSchema,
    workspaceId: workspaceIdSchema,
    label: z.string().trim().min(1).max(40).nullable().optional(),
    color: z
      .enum(["gray", "red", "orange", "yellow", "green", "blue", "purple"])
      .nullable()
      .optional(),
  })
  .refine((input) => input.label !== undefined || input.color !== undefined);

const storedConversationSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid().nullable(),
  title: z.string().min(1).max(120),
  messages: messagesSchema,
  pinned: z.boolean(),
  archived: z.boolean(),
  label: z.string().min(1).max(40).nullable(),
  color: z
    .enum(["gray", "red", "orange", "yellow", "green", "blue", "purple"])
    .nullable(),
  updated_at: z.iso.datetime({ offset: true }),
});

const artifactInputSchema = z
  .object({
    conversationId: conversationIdSchema,
    name: z.string().trim().min(1).max(80),
    fields: artifactFieldsSchema,
    records: z
      .array(
        z.record(
          z.string(),
          generatedValueSchema,
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

const artifactPositionsInputSchema = z.object({
  conversationId: conversationIdSchema,
  workspaceId: workspaceIdSchema,
  positions: z
    .array(
      z.object({
        artifactId: z.uuid(),
        position: schemaPositionSchema,
      }),
    )
    .min(1)
    .max(25)
    .refine(
      (positions) =>
        new Set(positions.map((entry) => entry.artifactId)).size ===
        positions.length,
      "Each generated table can only have one position.",
    ),
});

const storedArtifactSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  fields: storedArtifactFieldsSchema,
  records: z.array(
    z.record(z.string(), generatedValueSchema),
  ).max(500),
  count: z.number().int().min(1).max(500),
  seed: z.number().int().min(0).max(2_147_483_647),
  canvas_position: schemaPositionSchema.nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export type AiGeneratedArtifact = {
  id: string;
  name: string;
  fields: RelationalGeneratorField[];
  records: GeneratedRecord[];
  count: number;
  seed: number;
  canvasPosition: { x: number; y: number } | null;
  createdAt: string;
};

export type AiConversationSummary = {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  label: string | null;
  color: "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | null;
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

type AuthenticatedSupabase = NonNullable<
  Awaited<ReturnType<typeof getAuthenticatedSupabase>>
>;
type WorkspaceAccess =
  | {
      supabase: AuthenticatedSupabase["supabase"];
      user: AuthenticatedSupabase["user"];
      role: string;
    }
  | { error: string };

async function getWorkspaceAccess(
  workspaceId: string,
): Promise<WorkspaceAccess> {
  const auth = await getAuthenticatedSupabase();
  if (!auth) return { error: "Please sign in again to access this workspace." } as const;

  const { data: membership, error } = await auth.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return { error: "Unable to verify workspace access. Please try again." };
  }
  if (!membership) {
    return { error: "You don't have access to this workspace." } as const;
  }

  return {
    supabase: auth.supabase,
    user: auth.user,
    role: membership.role,
  } as const;
}

function toConversation(
  row: z.infer<typeof storedConversationSchema>,
  artifacts: AiGeneratedArtifact[],
): AiConversation {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? "",
    title: row.title,
    messages: row.messages,
    updatedAt: row.updated_at,
    pinned: row.pinned,
    archived: row.archived,
    label: row.label,
    color: row.color,
    artifacts,
  };
}

export async function listAiConversations(input: unknown): Promise<
  ConversationResult<AiConversationSummary[]>
> {
  const parsedWorkspaceId = workspaceIdSchema.safeParse(input);
  if (!parsedWorkspaceId.success) {
    return { error: "Select a valid workspace to view saved chats." };
  }
  const auth = await getWorkspaceAccess(parsedWorkspaceId.data);
  if ("error" in auth) return auth;

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .select("id, workspace_id, title, updated_at, pinned, archived, label, color")
    .eq("workspace_id", parsedWorkspaceId.data)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return { error: "Unable to load saved chats. Please try again." };
  }

  return {
    data: data.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      updatedAt: row.updated_at,
      pinned: row.pinned,
      archived: row.archived,
      label: row.label,
      color: row.color,
    })),
  };
}

export async function getAiConversation(
  input: unknown,
): Promise<ConversationResult<AiConversation>> {
  const parsedInput = z
    .object({ id: conversationIdSchema, workspaceId: workspaceIdSchema })
    .safeParse(input);
  if (!parsedInput.success) return { error: "Saved chat not found." };

  const auth = await getWorkspaceAccess(parsedInput.data.workspaceId);
  if ("error" in auth) return auth;

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .select("id, workspace_id, title, messages, pinned, archived, label, color, updated_at")
    .eq("id", parsedInput.data.id)
    .eq("workspace_id", parsedInput.data.workspaceId)
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
    .select("id, name, fields, records, count, seed, canvas_position, created_at")
    .eq("conversation_id", parsedInput.data.id)
    .order("created_at", { ascending: true });

  if (artifactsError) {
    return {
      error:
        "Unable to load generated data. Apply the generated artifacts and canvas positions migrations, then try again.",
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
      fields: artifact.fields,
      records: artifact.records,
      count: artifact.count,
      seed: artifact.seed,
      canvasPosition: artifact.canvas_position,
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
      fields: parsedInput.data.fields,
      records: parsedInput.data.records,
      count: parsedInput.data.count,
      seed: parsedInput.data.seed,
    })
    .select("id, name, fields, records, count, seed, canvas_position, created_at")
    .single();

  if (error || !data) {
    return {
      error:
        "Unable to save generated data. Confirm the generated artifacts and canvas positions migrations are applied, then try again.",
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
      fields: parsedInput.data.fields,
      records: parsedArtifact.data.records,
      count: parsedArtifact.data.count,
      seed: parsedArtifact.data.seed,
      canvasPosition: parsedArtifact.data.canvas_position,
      createdAt: parsedArtifact.data.created_at,
    },
  };
}

export async function saveAiGeneratedArtifactPositions(
  input: unknown,
): Promise<ConversationResult<null>> {
  const parsedInput = artifactPositionsInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { error: "The schema layout is invalid and could not be saved." };
  }

  const auth = await getWorkspaceAccess(parsedInput.data.workspaceId);
  if ("error" in auth) return auth;

  const { data: conversation, error: conversationError } = await auth.supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", parsedInput.data.conversationId)
    .eq("workspace_id", parsedInput.data.workspaceId)
    .maybeSingle();
  if (conversationError || !conversation) {
    return { error: "Unable to save the schema layout for this chat." };
  }

  const artifactIds = parsedInput.data.positions.map(
    (entry) => entry.artifactId,
  );
  const { data: artifacts, error: artifactsError } = await auth.supabase
    .from("ai_generated_artifacts")
    .select("id")
    .eq("conversation_id", parsedInput.data.conversationId)
    .in("id", artifactIds);
  if (artifactsError || artifacts?.length !== artifactIds.length) {
    return { error: "Unable to verify generated tables for this schema." };
  }

  for (const { artifactId, position } of parsedInput.data.positions) {
    const { data: updatedArtifact, error } = await auth.supabase
      .from("ai_generated_artifacts")
      .update({ canvas_position: position })
      .eq("id", artifactId)
      .eq("conversation_id", parsedInput.data.conversationId)
      .select("id")
      .single();
    if (error || !updatedArtifact) {
      return { error: "Unable to save the schema layout. Please try again." };
    }
  }

  return { data: null };
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

  const auth = await getWorkspaceAccess(parsedInput.data.workspaceId);
  if ("error" in auth) return auth;

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
        .eq("workspace_id", parsedInput.data.workspaceId)
    : auth.supabase.from("ai_conversations").insert({
        ...values,
        title,
        user_id: auth.user.id,
        workspace_id: parsedInput.data.workspaceId,
      });
  const { data, error } = await query
    .select("id, workspace_id, title, updated_at, pinned, archived, label, color")
    .single();

  if (error || !data) {
    return { error: "Unable to save this chat. Please try again." };
  }

  return {
    data: {
      id: data.id,
      workspaceId: data.workspace_id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
      label: data.label,
      color: data.color,
    },
  };
}

export async function setAiConversationPinned(
  input: unknown,
): Promise<ConversationResult<AiConversationSummary>> {
  const parsedInput = updatePinnedInputSchema.safeParse(input);
  if (!parsedInput.success) return { error: "Saved chat not found." };

  const auth = await getWorkspaceAccess(parsedInput.data.workspaceId);
  if ("error" in auth) return auth;

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .update({ pinned: parsedInput.data.pinned })
    .eq("id", parsedInput.data.id)
    .eq("workspace_id", parsedInput.data.workspaceId)
    .select("id, workspace_id, title, updated_at, pinned, archived, label, color")
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to update this chat. Please try again." };
  }

  return {
    data: {
      id: data.id,
      workspaceId: data.workspace_id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
      label: data.label,
      color: data.color,
    },
  };
}

export async function setAiConversationArchived(
  input: unknown,
): Promise<ConversationResult<AiConversationSummary>> {
  const parsedInput = updateArchivedInputSchema.safeParse(input);
  if (!parsedInput.success) return { error: "Saved chat not found." };

  const auth = await getWorkspaceAccess(parsedInput.data.workspaceId);
  if ("error" in auth) return auth;

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .update({
      archived: parsedInput.data.archived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsedInput.data.id)
    .eq("workspace_id", parsedInput.data.workspaceId)
    .select("id, workspace_id, title, updated_at, pinned, archived, label, color")
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to update this chat. Please try again." };
  }

  return {
    data: {
      id: data.id,
      workspaceId: data.workspace_id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
      label: data.label,
      color: data.color,
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

  const auth = await getWorkspaceAccess(parsedInput.data.workspaceId);
  if ("error" in auth) return auth;

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .update({
      title: parsedInput.data.title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsedInput.data.id)
    .eq("workspace_id", parsedInput.data.workspaceId)
    .select("id, workspace_id, title, updated_at, pinned, archived, label, color")
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to rename this chat. Please try again." };
  }

  return {
    data: {
      id: data.id,
      workspaceId: data.workspace_id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
      label: data.label,
      color: data.color,
    },
  };
}

export async function updateAiConversationMetadata(
  input: unknown,
): Promise<ConversationResult<AiConversationSummary>> {
  const parsedInput = conversationMetadataInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { error: "Enter a valid label or conversation color." };
  }

  const auth = await getWorkspaceAccess(parsedInput.data.workspaceId);
  if ("error" in auth) return auth;

  const { id, workspaceId, ...metadata } = parsedInput.data;
  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .update(metadata)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id, workspace_id, title, updated_at, pinned, archived, label, color")
    .maybeSingle();

  if (error || !data) {
    return {
      error:
        "Unable to update conversation details. Apply the conversation labels migration, then try again.",
    };
  }

  return {
    data: {
      id: data.id,
      workspaceId: data.workspace_id,
      title: data.title,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
      label: data.label,
      color: data.color,
    },
  };
}

export async function deleteAiConversation(
  input: unknown,
): Promise<ConversationResult<{ id: string }>> {
  const parsedInput = z
    .object({ id: conversationIdSchema, workspaceId: workspaceIdSchema })
    .safeParse(input);
  if (!parsedInput.success) return { error: "Saved chat not found." };

  const auth = await getWorkspaceAccess(parsedInput.data.workspaceId);
  if ("error" in auth) return auth;
  if (auth.role !== "owner") {
    return { error: "Only the workspace owner can delete conversations." };
  }

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .delete()
    .eq("id", parsedInput.data.id)
    .eq("workspace_id", parsedInput.data.workspaceId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to delete this saved chat. Please try again." };
  }

  return { data: { id: data.id } };
}
