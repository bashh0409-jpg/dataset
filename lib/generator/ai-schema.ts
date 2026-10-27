import { z } from "zod";
import {
  fieldTypes,
  generatorFieldSchema,
  relationalGeneratorRequestSchema,
  type FieldType,
  type RelationalGeneratorRequest,
} from "./engine";

const openRouterCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z
            .union([
              z.string(),
              z.array(
                z.object({
                  type: z.literal("text"),
                  text: z.string(),
                }),
              ),
            ])
            .nullable()
            .optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

const clarificationResponseSchema = z.object({
  status: z.literal("clarification"),
  question: z.string().trim().min(1).max(300),
});
const aiFieldSchema = z.object({
  name: generatorFieldSchema.shape.name,
  type: z.union([
    z.enum(fieldTypes),
    z.literal("string"),
    z.literal("text"),
  ]),
  options: generatorFieldSchema.shape.options,
  primaryKey: z.boolean().optional(),
  references: z
    .object({
      table: z.string().trim().min(1).max(80),
      field: z.string().trim().min(1).max(40),
    })
    .optional(),
});
const singleTableResponseSchema = z.object({
  status: z.literal("ready"),
  name: z.string().trim().min(1).max(80),
  count: z.number().int().min(1).max(500).optional(),
  fields: z.array(aiFieldSchema).min(1).max(25),
});
const multiTableResponseSchema = z.object({
  status: z.literal("ready"),
  count: z.number().int().min(1).max(500).optional(),
  tables: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        fields: z.array(aiFieldSchema).min(1).max(25),
      }),
    )
    .min(1)
    .max(10),
});

const aiResponseSchema = z.union([
  clarificationResponseSchema,
  singleTableResponseSchema,
  multiTableResponseSchema,
]);

export type AiSchemaResult =
  | { status: "clarification"; question: string }
  | {
      status: "ready";
      request: RelationalGeneratorRequest;
    };

export type OpenRouterContentResult =
  | { status: "content"; content: string }
  | { status: "empty" }
  | { status: "truncated" }
  | { status: "refused" }
  | { status: "unexpected" };

export function extractOpenRouterContent(
  payload: unknown,
): OpenRouterContentResult {
  const completion = openRouterCompletionSchema.safeParse(payload);
  if (!completion.success) return { status: "unexpected" };

  const message = completion.data.choices[0].message;
  if (message.refusal) return { status: "refused" };
  const content = message.content;
  if (typeof content === "string" && content.trim()) {
    return { status: "content", content };
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) return { status: "content", content: text };
  }

  if (completion.data.choices[0].finish_reason === "length") {
    return { status: "truncated" };
  }

  return { status: "empty" };
}

function normalizeAiField(
  field: z.infer<typeof aiFieldSchema>,
): {
  name: string;
  type: FieldType;
  options?: string[];
  primaryKey?: boolean;
  references?: { table: string; field: string };
} {
  switch (field.type) {
    case "string":
    case "text": {
      const fieldName = field.name.toLowerCase();
      const inferredType =
        fieldName === "id_number" || fieldName === "idnumber"
          ? "idNumber"
          : fieldName === "name" || fieldName === "full_name"
            ? "fullName"
            : fieldName === "email"
              ? "email"
              : fieldName === "phone" || fieldName === "phone_number"
                ? "phone"
                : null;

      if (!inferredType) {
        throw new Error(
          `The AI used a generic string type for unsupported field "${field.name}".`,
        );
      }

      return {
        ...field,
        type: inferredType,
      };
    }
    default:
      return {
        name: field.name,
        type: field.type,
        ...(field.options ? { options: field.options } : {}),
        ...(field.primaryKey !== undefined
          ? { primaryKey: field.primaryKey }
          : {}),
        ...(field.references ? { references: field.references } : {}),
      };
  }
}

export function parseAiSchema(
  content: string,
  seed: number,
  requestedCount?: number,
): AiSchemaResult {
  const json = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const result = aiResponseSchema.parse(JSON.parse(json));

  if (result.status === "clarification") {
    return result;
  }
  const count = result.count ?? requestedCount;
  if (count === undefined) {
    return {
      status: "clarification",
      question: "How many records should I generate? Choose between 1 and 500.",
    };
  }

  const tables =
    "tables" in result
      ? result.tables
      : [{ name: result.name, fields: result.fields }];

  return {
    status: "ready",
    request: relationalGeneratorRequestSchema.parse({
      tables: tables.map((table) => ({
        ...table,
        fields: table.fields.map(normalizeAiField),
      })),
      count,
      seed,
    }),
  };
}
