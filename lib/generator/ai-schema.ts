import { z } from "zod";
import {
  fieldTypes,
  generatorRequestSchema,
  type GeneratorRequest,
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

const aiResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("clarification"),
    question: z.string().trim().min(1).max(300),
  }),
  z.object({
    status: z.literal("ready"),
    name: z.string().trim().min(1).max(80),
    count: z.number().int().min(1).max(500).optional(),
    fields: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          type: z.enum(fieldTypes),
          options: z
            .array(z.string().trim().min(1).max(80))
            .max(50)
            .optional(),
        }),
      )
      .min(1)
      .max(25),
  }),
]);

export type AiSchemaResult =
  | { status: "clarification"; question: string }
  | { status: "ready"; request: GeneratorRequest };

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

export function parseAiSchema(content: string, seed: number): AiSchemaResult {
  const json = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const result = aiResponseSchema.parse(JSON.parse(json));

  if (result.status === "clarification") {
    return result;
  }

  if (result.count === undefined) {
    return {
      status: "clarification",
      question: "How many records should I generate? Choose between 1 and 500.",
    };
  }

  return {
    status: "ready",
    request: generatorRequestSchema.parse({
      ...result,
      seed,
    }),
  };
}
