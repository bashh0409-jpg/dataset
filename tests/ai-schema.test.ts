import { describe, expect, it } from "vitest";
import {
  extractOpenRouterContent,
  parseAiSchema,
} from "../lib/generator/ai-schema";

describe("OpenRouter response parsing", () => {
  it("extracts text from the standard completion response", () => {
    expect(
      extractOpenRouterContent({
        choices: [{ message: { content: '{"status":"clarification"}' } }],
      }),
    ).toEqual({
      status: "content",
      content: '{"status":"clarification"}',
    });
  });

  it("joins text content parts returned by compatible providers", () => {
    expect(
      extractOpenRouterContent({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: '{"status":' },
                { type: "text", text: '"clarification"}' },
              ],
            },
          },
        ],
      }),
    ).toEqual({
      status: "content",
      content: '{"status":"clarification"}',
    });
  });

  it("distinguishes empty, refused, and malformed responses", () => {
    expect(
      extractOpenRouterContent({
        choices: [{ message: { content: null } }],
      }),
    ).toEqual({ status: "empty" });
    expect(
      extractOpenRouterContent({
        choices: [
          { finish_reason: "length", message: { content: null } },
        ],
      }),
    ).toEqual({ status: "truncated" });
    expect(
      extractOpenRouterContent({
        choices: [{ message: { content: null, refusal: "Not allowed" } }],
      }),
    ).toEqual({ status: "refused" });
    expect(extractOpenRouterContent({ error: "provider failure" })).toEqual({
      status: "unexpected",
    });
  });
});

describe("AI-generated schema parsing", () => {
  it("parses a schema with the requested count and applies the generation seed", () => {
    const result = parseAiSchema(
      JSON.stringify({
        status: "ready",
        name: "users",
        count: 30,
        fields: [
          { name: "id", type: "uuid" },
          { name: "email", type: "email" },
          { name: "role", type: "enum", options: ["admin", "member"] },
        ],
      }),
      123,
    );

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.request.tables).toHaveLength(1);
      expect(result.request.tables[0].name).toBe("users");
      expect(result.request.tables[0].fields).toHaveLength(3);
      expect(result.request.count).toBe(30);
      expect(result.request.seed).toBe(123);
    }
  });

  it("uses the user's clarified count and normalizes generic customer string fields", () => {
    const result = parseAiSchema(
      JSON.stringify({
        status: "ready",
        name: "customer",
        fields: [
          { name: "uuid", type: "uuid" },
          { name: "name", type: "string" },
          { name: "id_number", type: "string" },
        ],
      }),
      123,
      3,
    );

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.request.count).toBe(3);
      expect(result.request.tables[0].fields).toMatchObject([
        { name: "uuid", type: "uuid" },
        { name: "name", type: "fullName" },
        { name: "id_number", type: "idNumber" },
      ]);
    }
  });

  it("returns a clarification instead of generating when count is missing", () => {
    const result = parseAiSchema(
      '{"status":"clarification","question":"How many products should I generate?"}',
      0,
    );

    expect(result).toEqual({
      status: "clarification",
      question: "How many products should I generate?",
    });
  });

  it("asks for the record count when a ready response contains fields but no count", () => {
    const result = parseAiSchema(
      JSON.stringify({
        status: "ready",
        name: "cards",
        fields: [
          { name: "card_id", type: "uuid" },
          { name: "customer_id", type: "uuid" },
          { name: "network", type: "enum", options: ["VISA", "MASTERCARD"] },
          { name: "expiry_month", type: "integer" },
          { name: "expiry_year", type: "integer" },
          { name: "contactless_enabled", type: "boolean" },
          { name: "daily_atm_limit", type: "price" },
          { name: "status", type: "enum", options: ["ACTIVE", "BLOCKED"] },
          { name: "created_at", type: "date" },
          { name: "online_payments_enabled", type: "boolean" },
        ],
      }),
      0,
    );

    expect(result).toEqual({
      status: "clarification",
      question: "How many records should I generate? Choose between 1 and 500.",
    });
  });

  it("accepts a fenced JSON response", () => {
    const result = parseAiSchema(
      '```json\n{"status":"ready","name":"products","count":2,"fields":[{"name":"price","type":"price"}]}\n```',
      0,
    );

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.request.tables[0].name).toBe("products");
    }
  });

  it("parses multiple tables and their primary-key references", () => {
    const result = parseAiSchema(
      JSON.stringify({
        status: "ready",
        count: 3,
        tables: [
          {
            name: "users",
            fields: [
              { name: "id", type: "integer", primaryKey: true },
              { name: "email", type: "email" },
            ],
          },
          {
            name: "orders",
            fields: [
              { name: "id", type: "integer", primaryKey: true },
              {
                name: "user_id",
                type: "integer",
                references: { table: "users", field: "id" },
              },
            ],
          },
        ],
      }),
      42,
    );

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.request.tables).toHaveLength(2);
      expect(result.request.tables[1].fields[1]).toMatchObject({
        name: "user_id",
        references: { table: "users", field: "id" },
      });
    }
  });

  it("accepts a single table returned in the tables array", () => {
    const result = parseAiSchema(
      JSON.stringify({
        status: "ready",
        count: 2,
        tables: [
          {
            name: "customer",
            fields: [
              { name: "uuid", type: "uuid" },
              { name: "name", type: "string" },
              { name: "phone_number", type: "string" },
            ],
          },
        ],
      }),
      42,
    );

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.request.count).toBe(2);
      expect(result.request.tables).toHaveLength(1);
      expect(result.request.tables[0]).toMatchObject({
        name: "customer",
        fields: [
          { name: "uuid", type: "uuid" },
          { name: "name", type: "fullName" },
          { name: "phone_number", type: "phone" },
        ],
      });
    }
  });

  it("rejects unsupported field types and duplicate field names", () => {
    expect(() =>
      parseAiSchema(
        '{"status":"ready","name":"users","count":1,"fields":[{"name":"password","type":"secret"}]}',
        0,
      ),
    ).toThrow();

    expect(() =>
      parseAiSchema(
        '{"status":"ready","name":"users","count":1,"fields":[{"name":"email","type":"email"},{"name":"email","type":"uuid"}]}',
        0,
      ),
    ).toThrow();
  });

  it("rejects counts above the generation limit", () => {
    expect(() =>
      parseAiSchema(
        '{"status":"ready","name":"users","count":501,"fields":[{"name":"email","type":"email"}]}',
        0,
      ),
    ).toThrow();
  });
});
