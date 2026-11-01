import { describe, expect, it } from "vitest";
import {
  groupWorkspaceGeneratedSchemas,
  savedSchemaDefinitionSchema,
} from "../lib/workspace-schemas";

describe("saved workspace schema validation", () => {
  it("accepts reusable field definitions without requiring a record count", () => {
    expect(
      savedSchemaDefinitionSchema.safeParse({
        datasetName: "customers",
        fields: [
          { name: "id", type: "uuid" },
          { name: "email", type: "email" },
          {
            name: "status",
            type: "enum",
            options: ["active", "pending"],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate fields and invalid enum definitions", () => {
    expect(
      savedSchemaDefinitionSchema.safeParse({
        datasetName: "customers",
        fields: [
          { name: "email", type: "email" },
          { name: "email", type: "text" },
        ],
      }).success,
    ).toBe(false);
    expect(
      savedSchemaDefinitionSchema.safeParse({
        datasetName: "customers",
        fields: [
          { name: "status", type: "enum", options: ["active"] },
        ],
      }).success,
    ).toBe(false);
  });

  it("groups artifacts from one generation as a complete relational schema", () => {
    const schema = groupWorkspaceGeneratedSchemas(
      [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Customers and orders",
          messages: [
            {
              role: "assistant",
              generatedArtifactIds: [
                "00000000-0000-4000-8000-000000000011",
                "00000000-0000-4000-8000-000000000012",
              ],
            },
          ],
        },
      ],
      [
        {
          id: "00000000-0000-4000-8000-000000000011",
          conversationId: "00000000-0000-4000-8000-000000000001",
          name: "customers",
          fields: [{ name: "id", type: "uuid", primaryKey: true }],
          createdAt: "2026-10-31T12:00:00.000Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000012",
          conversationId: "00000000-0000-4000-8000-000000000001",
          name: "orders",
          fields: [
            { name: "id", type: "uuid", primaryKey: true },
            {
              name: "customer_id",
              type: "uuid",
              references: { table: "customers", field: "id" },
            },
          ],
          createdAt: "2026-10-31T12:00:01.000Z",
        },
      ],
    );

    expect(schema).toHaveLength(1);
    expect(schema[0]?.tables.map((table) => table.name)).toEqual([
      "customers",
      "orders",
    ]);
    expect(schema[0]?.tables[1]?.fields[1]?.references).toEqual({
      table: "customers",
      field: "id",
    });
  });
});
