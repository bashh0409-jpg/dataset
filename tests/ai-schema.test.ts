import { describe, expect, it } from "vitest";
import { parseAiSchema } from "../lib/generator/ai-schema";

describe("AI-generated schema parsing", () => {
  it("parses a valid JSON schema and applies the requested count and seed", () => {
    const result = parseAiSchema(
      JSON.stringify({
        name: "users",
        fields: [
          { name: "id", type: "uuid" },
          { name: "email", type: "email" },
          { name: "role", type: "enum", options: ["admin", "member"] },
        ],
      }),
      30,
      123,
    );

    expect(result.name).toBe("users");
    expect(result.fields).toHaveLength(3);
    expect(result.count).toBe(30);
    expect(result.seed).toBe(123);
  });

  it("accepts a fenced JSON response", () => {
    const result = parseAiSchema(
      '```json\n{"name":"products","fields":[{"name":"price","type":"price"}]}\n```',
      2,
      0,
    );

    expect(result.name).toBe("products");
  });

  it("rejects unsupported field types and duplicate field names", () => {
    expect(() =>
      parseAiSchema(
        '{"name":"users","fields":[{"name":"password","type":"secret"}]}',
        1,
        0,
      ),
    ).toThrow();

    expect(() =>
      parseAiSchema(
        '{"name":"users","fields":[{"name":"email","type":"email"},{"name":"email","type":"uuid"}]}',
        1,
        0,
      ),
    ).toThrow();
  });
});
