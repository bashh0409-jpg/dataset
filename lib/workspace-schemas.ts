import { z } from "zod";
import { generatorFieldSchema, relationalGeneratorFieldSchema } from "./generator/engine";

export const savedSchemaDefinitionSchema = z
  .object({
    datasetName: z.string().trim().min(1).max(80),
    fields: z.array(generatorFieldSchema).min(1).max(25),
  })
  .superRefine((definition, context) => {
    const names = definition.fields.map((field) => field.name);
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        message: "Field names must be unique.",
        path: ["fields"],
      });
    }
  });

export const savedSchemaNameSchema = z.string().trim().min(1).max(80);

export type SavedSchemaDefinition = z.infer<
  typeof savedSchemaDefinitionSchema
>;
export type WorkspaceSavedSchema = {
  id: string;
  name: string;
  definition: SavedSchemaDefinition;
  createdBy: string;
  updatedAt: string;
  canManage: boolean;
};
export type WorkspaceGeneratedSchemaTable = {
  artifactId: string;
  name: string;
  fields: z.infer<typeof relationalGeneratorFieldSchema>[];
};
export type WorkspaceGeneratedSchema = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  tables: WorkspaceGeneratedSchemaTable[];
  createdAt: string;
};

const generatedSchemaMessagesSchema = z.array(
  z.object({
    role: z.enum(["user", "assistant"]),
    generatedArtifactId: z.uuid().optional(),
    generatedArtifactIds: z.array(z.uuid()).max(80).optional(),
  }),
);

export function groupWorkspaceGeneratedSchemas(
  conversations: {
    id: string;
    title: string;
    messages: unknown;
  }[],
  artifacts: {
    id: string;
    conversationId: string;
    name: string;
    fields: z.infer<typeof relationalGeneratorFieldSchema>[];
    createdAt: string;
  }[],
): WorkspaceGeneratedSchema[] {
  const artifactsById = new Map(
    artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const conversationsById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  const groupedIds = new Set<string>();
  const schemas: WorkspaceGeneratedSchema[] = [];

  const addSchema = (
    conversation: (typeof conversations)[number],
    schemaId: string,
    artifactIds: string[],
  ) => {
    const tables = artifactIds.flatMap((artifactId) => {
      const artifact = artifactsById.get(artifactId);
      if (!artifact || artifact.conversationId !== conversation.id) return [];
      groupedIds.add(artifactId);
      return [
        {
          artifactId,
          name: artifact.name,
          fields: artifact.fields,
        },
      ];
    });
    if (tables.length === 0) return;

    schemas.push({
      id: schemaId,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      tables,
      createdAt: tables.reduce((latest, table) => {
        const artifact = artifactsById.get(table.artifactId);
        return artifact && artifact.createdAt > latest
          ? artifact.createdAt
          : latest;
      }, ""),
    });
  };

  for (const conversation of conversations) {
    const parsedMessages = generatedSchemaMessagesSchema.safeParse(
      conversation.messages,
    );
    if (!parsedMessages.success) continue;

    parsedMessages.data.forEach((message, index) => {
      if (message.role !== "assistant") return;
      const artifactIds = [
        ...new Set(
          message.generatedArtifactIds ??
            (message.generatedArtifactId ? [message.generatedArtifactId] : []),
        ),
      ];
      if (artifactIds.length === 0) return;
      addSchema(conversation, `${conversation.id}:${index}`, artifactIds);
    });
  }

  for (const artifact of artifacts) {
    if (groupedIds.has(artifact.id)) continue;
    const conversation = conversationsById.get(artifact.conversationId);
    if (conversation) {
      addSchema(conversation, artifact.id, [artifact.id]);
    }
  }

  return schemas.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
