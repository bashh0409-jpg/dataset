"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { relationalGeneratorFieldSchema } from "@/lib/generator/engine";
import {
  savedSchemaDefinitionSchema,
  savedSchemaNameSchema,
  groupWorkspaceGeneratedSchemas,
  type WorkspaceGeneratedSchema,
  type WorkspaceSavedSchema,
} from "@/lib/workspace-schemas";

const schemaIdSchema = z.uuid();
const workspaceIdSchema = z.uuid();
const schemaInputSchema = z.object({
  id: schemaIdSchema.optional(),
  workspaceId: workspaceIdSchema,
  name: savedSchemaNameSchema,
  definition: savedSchemaDefinitionSchema,
});
const rowSchema = z.object({
  id: schemaIdSchema,
  workspace_id: workspaceIdSchema,
  created_by: z.uuid(),
  name: savedSchemaNameSchema,
  definition: z.unknown(),
  updated_at: z.iso.datetime({ offset: true }),
});
const conversationRowSchema = z.object({
  id: schemaIdSchema,
  title: z.string().min(1).max(120),
  messages: z.unknown(),
});
const generatedArtifactRowSchema = z.object({
  id: schemaIdSchema,
  conversation_id: schemaIdSchema,
  name: savedSchemaNameSchema,
  fields: z.array(relationalGeneratorFieldSchema).min(1).max(25),
  created_at: z.iso.datetime({ offset: true }),
});

type ActionResult<T> = { data: T } | { error: string };
type WorkspaceAuthorization = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  role: "owner" | "member";
};

async function authorizeWorkspace(
  workspaceId: string,
): Promise<ActionResult<WorkspaceAuthorization>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again to manage saved schemas." };
  }

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: "Unable to verify workspace access. Please try again." };
  }
  if (!membership) {
    return { error: "You don't have access to this workspace." };
  }

  return {
    data: {
      supabase,
      userId: user.id,
      role: membership.role,
    },
  };
}

function toWorkspaceSavedSchema(
  value: unknown,
  userId: string,
  role: "owner" | "member",
): WorkspaceSavedSchema | null {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success) return null;

  const definition = savedSchemaDefinitionSchema.safeParse(
    parsed.data.definition,
  );
  if (!definition.success) return null;

  return {
    id: parsed.data.id,
    name: parsed.data.name,
    definition: definition.data,
    createdBy: parsed.data.created_by,
    updatedAt: parsed.data.updated_at,
    canManage:
      parsed.data.created_by === userId || role === "owner",
  };
}

const schemaColumns =
  "id, workspace_id, created_by, name, definition, updated_at";

export async function listWorkspaceSchemas(
  workspaceId: unknown,
): Promise<
  ActionResult<{
    saved: WorkspaceSavedSchema[];
    generated: WorkspaceGeneratedSchema[];
  }>
> {
  const parsedWorkspaceId = workspaceIdSchema.safeParse(workspaceId);
  if (!parsedWorkspaceId.success) {
    return { error: "Workspace not found." };
  }

  const authorization = await authorizeWorkspace(parsedWorkspaceId.data);
  if ("error" in authorization) return authorization;
  const { supabase, userId, role } = authorization.data;
  const { data, error } = await supabase
    .from("workspace_saved_schemas")
    .select(schemaColumns)
    .eq("workspace_id", parsedWorkspaceId.data)
    .order("updated_at", { ascending: false });

  if (error) {
    return { error: "Unable to load saved schemas. Please try again." };
  }

  const schemas = (data ?? []).map((row) =>
    toWorkspaceSavedSchema(row, userId, role),
  );
  if (schemas.some((schema) => schema === null)) {
    return { error: "Saved schemas contain invalid data. Please contact support." };
  }

  const conversations: z.infer<typeof conversationRowSchema>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: conversationRows, error: conversationsError } =
      await supabase
        .from("ai_conversations")
        .select("id, title, messages")
        .eq("workspace_id", parsedWorkspaceId.data)
        .order("updated_at", { ascending: false })
        .range(offset, offset + 499);

    if (conversationsError) {
      return {
        error:
          "Unable to load previous generated schemas. Apply the AI conversations migration and try again.",
      };
    }

    const parsedConversations =
      z.array(conversationRowSchema).safeParse(conversationRows);
    if (!parsedConversations.success) {
      return { error: "Chat history returned an unexpected response." };
    }
    conversations.push(...parsedConversations.data);
    if (parsedConversations.data.length < 500) break;
  }

  const artifacts: {
    id: string;
    conversationId: string;
    name: string;
    fields: z.infer<typeof relationalGeneratorFieldSchema>[];
    createdAt: string;
  }[] = [];
  for (let index = 0; index < conversations.length; index += 100) {
    const conversationIds = conversations
      .slice(index, index + 100)
      .map((conversation) => conversation.id);
    for (let offset = 0; ; offset += 500) {
      const { data: artifactRows, error: artifactsError } = await supabase
        .from("ai_generated_artifacts")
        .select("id, conversation_id, name, fields, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .range(offset, offset + 499);

      if (artifactsError) {
        return {
          error:
            "Unable to load previous generated schemas. Apply the generated artifacts migration and try again.",
        };
      }

      const parsedArtifacts = z
        .array(generatedArtifactRowSchema)
        .safeParse(artifactRows);
      if (!parsedArtifacts.success) {
        return {
          error: "Previously generated schemas contain invalid data.",
        };
      }

      for (const artifact of parsedArtifacts.data) {
        artifacts.push({
          id: artifact.id,
          conversationId: artifact.conversation_id,
          name: artifact.name,
          fields: artifact.fields,
          createdAt: artifact.created_at,
        });
      }

      if (parsedArtifacts.data.length < 500) break;
    }
  }

  const generated = groupWorkspaceGeneratedSchemas(
    conversations,
    artifacts,
  );

  return {
    data: {
      saved: schemas.filter((schema) => schema !== null),
      generated,
    },
  };
}

export async function saveWorkspaceSchema(
  input: unknown,
): Promise<ActionResult<WorkspaceSavedSchema>> {
  const parsedInput = schemaInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      error:
        parsedInput.error.issues[0]?.message ??
        "Check the saved schema details.",
    };
  }

  const authorization = await authorizeWorkspace(
    parsedInput.data.workspaceId,
  );
  if ("error" in authorization) return authorization;
  const { supabase, userId, role } = authorization.data;
  const { id, workspaceId, name, definition } = parsedInput.data;

  if (id) {
    const { data, error } = await supabase
      .from("workspace_saved_schemas")
      .update({
        name,
        definition,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select(schemaColumns)
      .maybeSingle();
    if (error) {
      return {
        error:
          error.code === "23505"
            ? "A saved schema with that name already exists."
            : "Unable to update the saved schema. Please try again.",
      };
    }

    const schema = toWorkspaceSavedSchema(data, userId, role);
    return schema
      ? { data: schema }
      : { error: "Schema not found or you don't have permission to edit it." };
  }

  const { data, error } = await supabase
    .from("workspace_saved_schemas")
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      name,
      definition,
    })
    .select(schemaColumns)
    .single();
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A saved schema with that name already exists."
          : "Unable to save the schema. Please try again.",
    };
  }

  const schema = toWorkspaceSavedSchema(data, userId, role);
  return schema
    ? { data: schema }
    : { error: "The saved schema returned an unexpected response." };
}

export async function duplicateWorkspaceSchema(
  input: unknown,
): Promise<ActionResult<WorkspaceSavedSchema>> {
  const parsedInput = z
    .object({ id: schemaIdSchema, workspaceId: workspaceIdSchema })
    .safeParse(input);
  if (!parsedInput.success) return { error: "Saved schema not found." };

  const authorization = await authorizeWorkspace(
    parsedInput.data.workspaceId,
  );
  if ("error" in authorization) return authorization;
  const { supabase, userId, role } = authorization.data;
  const { data: source, error: sourceError } = await supabase
    .from("workspace_saved_schemas")
    .select(schemaColumns)
    .eq("id", parsedInput.data.id)
    .eq("workspace_id", parsedInput.data.workspaceId)
    .maybeSingle();

  if (sourceError) {
    return { error: "Unable to load the schema to duplicate." };
  }
  const schema = toWorkspaceSavedSchema(source, userId, role);
  if (!schema) return { error: "Saved schema not found or invalid." };

  const { data: existingNames, error: namesError } = await supabase
    .from("workspace_saved_schemas")
    .select("name")
    .eq("workspace_id", parsedInput.data.workspaceId);
  if (namesError) {
    return { error: "Unable to check for duplicate schema names." };
  }

  const names = new Set(
    (existingNames ?? []).map((entry) => entry.name.toLowerCase()),
  );
  let suffixText = " copy";
  let duplicateName = `${schema.name.slice(0, 80 - suffixText.length).trimEnd()}${suffixText}`;
  let suffix = 2;
  while (names.has(duplicateName.toLowerCase()) && suffix <= 100) {
    suffixText = ` copy ${suffix}`;
    duplicateName = `${schema.name.slice(0, 80 - suffixText.length).trimEnd()}${suffixText}`;
    suffix += 1;
  }
  if (names.has(duplicateName.toLowerCase())) {
    return {
      error: "Unable to choose a unique duplicate name. Rename an existing copy first.",
    };
  }

  const { data, error } = await supabase
    .from("workspace_saved_schemas")
    .insert({
      workspace_id: parsedInput.data.workspaceId,
      created_by: userId,
      name: duplicateName,
      definition: schema.definition,
    })
    .select(schemaColumns)
    .single();
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A schema with that duplicate name already exists. Please try again."
          : "Unable to duplicate the schema. Please try again.",
    };
  }

  const duplicate = toWorkspaceSavedSchema(data, userId, role);
  return duplicate
    ? { data: duplicate }
    : { error: "The duplicated schema returned an unexpected response." };
}

export async function deleteWorkspaceSchema(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsedInput = z
    .object({ id: schemaIdSchema, workspaceId: workspaceIdSchema })
    .safeParse(input);
  if (!parsedInput.success) return { error: "Saved schema not found." };

  const authorization = await authorizeWorkspace(
    parsedInput.data.workspaceId,
  );
  if ("error" in authorization) return authorization;
  const { supabase } = authorization.data;
  const { data, error } = await supabase
    .from("workspace_saved_schemas")
    .delete()
    .eq("id", parsedInput.data.id)
    .eq("workspace_id", parsedInput.data.workspaceId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "Unable to delete the saved schema. Please try again." };
  }
  if (!data) {
    return { error: "Schema not found or you don't have permission to delete it." };
  }
  return { data };
}
