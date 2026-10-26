import { describe, expect, it } from "vitest";
import {
  generateRecords,
  generatorRequestSchema,
  recordsToCsv,
} from "../lib/generator/engine";

const validRequest = {
  name: "users",
  fields: [
    { name: "id", type: "uuid" },
    { name: "name", type: "fullName" },
    { name: "role", type: "enum", options: ["admin", "member"] },
    { name: "active", type: "boolean" },
  ],
  count: 5,
  seed: 42,
};

describe("generator request validation", () => {
  it("accepts a valid schema and rejects invalid counts and duplicate fields", () => {
    expect(generatorRequestSchema.safeParse(validRequest).success).toBe(true);
    expect(
      generatorRequestSchema.safeParse({ ...validRequest, count: 501 }).success,
    ).toBe(false);
    expect(
      generatorRequestSchema.safeParse({
        ...validRequest,
        fields: [...validRequest.fields, { name: "name", type: "email" }],
      }).success,
    ).toBe(false);
  });

  it("requires at least two values for enum fields", () => {
    expect(
      generatorRequestSchema.safeParse({
        ...validRequest,
        fields: [{ name: "role", type: "enum", options: ["admin"] }],
      }).success,
    ).toBe(false);
  });
});

describe("deterministic generation and export", () => {
  it("reproduces the same records for the same seed", () => {
    const request = generatorRequestSchema.parse(validRequest);
    expect(generateRecords(request)).toEqual(generateRecords(request));
  });

  it("exports properly escaped CSV and protects formula-leading values", () => {
    const fields = [
      { name: "name", type: "fullName" as const },
      { name: "value", type: "enum" as const, options: ["=SUM(A1:A2)", "ok"] },
    ];
    const csv = recordsToCsv(fields, [
      { name: 'A "quoted" name', value: "=SUM(A1:A2)" },
    ]);

    expect(csv).toBe(
      '"name","value"\r\n"A ""quoted"" name","\'=SUM(A1:A2)"',
    );
  });
});
