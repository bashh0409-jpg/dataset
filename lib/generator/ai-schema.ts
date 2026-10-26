import { z } from "zod";
import {
  fieldTypes,
  generatorRequestSchema,
  type GeneratorRequest,
} from "./engine";

const aiResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("clarification"),
    question: z.string().trim().min(1).max(300),
  }),
  z.object({
    status: z.literal("ready"),
    name: z.string().trim().min(1).max(80),
    count: z.number().int().min(1).max(500),
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

export function parseAiSchema(content: string, seed: number): AiSchemaResult {
  const json = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const result = aiResponseSchema.parse(JSON.parse(json));

  if (result.status === "clarification") {
    return result;
  }

  return {
    status: "ready",
    request: generatorRequestSchema.parse({
      ...result,
      seed,
    }),
  };
}
