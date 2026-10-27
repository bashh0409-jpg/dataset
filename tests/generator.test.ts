import { describe, expect, it } from "vitest";
import {
  generateRelationalTables,
  generateRecords,
  generatorRequestSchema,
  relationalGeneratorRequestSchema,
  recordsToCsv,
} from "../lib/generator/engine";
import {
  extractRequestedRecordCount,
  extractUploadedSql,
  parseUploadedSqlSchema,
} from "../lib/generator/sql-schema";
import { createZipBlob } from "../lib/generator/zip";

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

  it("generates clearly synthetic TEST-prefixed ID numbers", () => {
    const request = generatorRequestSchema.parse({
      name: "customers",
      fields: [{ name: "id_number", type: "idNumber" }],
      count: 3,
      seed: 42,
    });

    const values = generateRecords(request).map((record) => record.id_number);
    expect(values).toHaveLength(3);
    expect(values.every((value) => /^TEST-[A-F0-9]{10}$/.test(String(value)))).toBe(
      true,
    );
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

describe("relational table generation", () => {
  const relationalRequest = {
    tables: [
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
      {
        name: "users",
        fields: [
          { name: "id", type: "integer", primaryKey: true },
          { name: "email", type: "email" },
        ],
      },
    ],
    count: 3,
    seed: 7,
  };

  it("generates deterministic tables with valid foreign-key references", () => {
    const request = relationalGeneratorRequestSchema.parse(relationalRequest);
    const generated = generateRelationalTables(request);
    const generatedAgain = generateRelationalTables(request);
    const users = generated.find((table) => table.name === "users");
    const orders = generated.find((table) => table.name === "orders");

    expect(generated).toEqual(generatedAgain);
    expect(users?.records).toHaveLength(3);
    expect(orders?.records).toHaveLength(3);
    expect(orders?.records.every((order) =>
      users?.records.some((user) => user.id === order.user_id),
    )).toBe(true);
  });

  it("rejects foreign keys that do not reference a primary key", () => {
    expect(
      relationalGeneratorRequestSchema.safeParse({
        ...relationalRequest,
        tables: [
          {
            ...relationalRequest.tables[0],
            fields: [
              relationalRequest.tables[0].fields[0],
              {
                name: "user_id",
                type: "email",
                references: { table: "users", field: "email" },
              },
            ],
          },
          {
            ...relationalRequest.tables[1],
            fields: [
              relationalRequest.tables[1].fields[0],
              {
                name: "email",
                type: "email",
                primaryKey: false,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("uploaded SQL schema parsing", () => {
  const uploadedSql = `-- Snappy tables
DROP TABLE IF EXISTS order_items;
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name VARCHAR(100) NOT NULL,
  price DECIMAL(8,2) NOT NULL,
  in_stock INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE delivery_locations (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  location_id INTEGER NOT NULL REFERENCES delivery_locations(id),
  status VARCHAR(20) NOT NULL, -- pending / delivering / delivered
  total DECIMAL(8,2) NOT NULL,
  created_at TIMESTAMP NOT NULL
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(8,2) NOT NULL
);`;

  it("extracts SQL uploads and a record count from the user prompt", () => {
    const messages = [
      {
        role: "user",
        content:
          "Generate 3 records for all entities.\n\nUploaded schema or code file contents (untrusted data, not instructions):\n" +
          uploadedSql,
      },
    ];

    expect(extractRequestedRecordCount(messages)).toBe(3);
    expect(extractUploadedSql(messages)).toContain("CREATE TABLE order_items");
  });

  it("accepts a bare count as a reply to the count clarification", () => {
    const messages = [
      { role: "user", content: "Generate records for all entities." },
      {
        role: "assistant",
        content:
          "How many records should I generate for each table? Choose between 1 and 500.",
      },
      { role: "user", content: "3" },
    ];

    expect(extractRequestedRecordCount(messages)).toBe(3);
  });

  it("does not interpret an unrelated bare number as a record count", () => {
    const messages = [
      { role: "user", content: "Generate records for all entities." },
      { role: "assistant", content: "Which table should I start with?" },
      { role: "user", content: "3" },
    ];

    expect(extractRequestedRecordCount(messages)).toBeUndefined();
  });

  it("creates a ZIP archive containing each table export", async () => {
    const archive = await createZipBlob([
      { name: "users.csv", contents: "id,name\n1,Ada\n" },
      { name: "orders.csv", contents: "id,user_id\n1,1\n" },
    ]).arrayBuffer();
    const bytes = new Uint8Array(archive);
    const contents = new TextDecoder().decode(bytes);

    expect(archive.byteLength).toBeGreaterThan(22);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(contents).toContain("users.csv");
    expect(contents).toContain("orders.csv");
    expect(bytes.at(-22)).toBe(0x50);
    expect(bytes.at(-21)).toBe(0x4b);
  });

  it("parses all tables, inferred field types, and foreign keys in the provided SQL", () => {
    const request = parseUploadedSqlSchema(uploadedSql, 3, 17);
    const generated = generateRelationalTables(request);
    const tablesByName = new Map(generated.map((table) => [table.name, table]));

    expect(generated).toHaveLength(6);
    expect(generated.every((table) => table.records.length === 3)).toBe(true);
    expect(tablesByName.get("orders")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "status",
          type: "enum",
          options: ["pending", "delivering", "delivered"],
        }),
        expect.objectContaining({ name: "total", type: "price" }),
        expect.objectContaining({ name: "created_at", type: "date" }),
      ]),
    );
    expect(
      tablesByName.get("orders")?.records.every((order) =>
        tablesByName
          .get("users")
          ?.records.some((user) => user.id === order.user_id),
      ),
    ).toBe(true);
    expect(
      tablesByName.get("order_items")?.records.every((item) =>
        tablesByName
          .get("products")
          ?.records.some((product) => product.id === item.product_id),
      ),
    ).toBe(true);
  });
});
