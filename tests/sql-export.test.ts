import { describe, expect, it } from "vitest";
import {
  generateRelationalTables,
  relationalGeneratorRequestSchema,
} from "../lib/generator/engine";
import { exportRelationalSql } from "../lib/generator/sql-export";
import { parseUploadedSqlSchema } from "../lib/generator/sql-schema";

const request = relationalGeneratorRequestSchema.parse({
  tables: [
    {
      name: "order_items",
      fields: [
        { name: "id", type: "integer", primaryKey: true },
        {
          name: "order_id",
          type: "integer",
          references: { table: "orders", field: "id" },
        },
      ],
    },
    {
      name: "orders",
      fields: [
        { name: "id", type: "integer", primaryKey: true },
        {
          name: "customer_id",
          type: "uuid",
          references: { table: "customers", field: "id" },
        },
        { name: "created_at", type: "date" },
        { name: "amount", type: "price" },
      ],
    },
    {
      name: "customers",
      fields: [
        { name: "id", type: "uuid", primaryKey: true },
        { name: "email", type: "email" },
      ],
    },
  ],
  count: 3,
  seed: 42,
});

function decodeFirstInsertValues(sql: string) {
  const insertIndex = sql.indexOf("INSERT INTO ");
  const valuesIndex = sql.indexOf("VALUES (", insertIndex);
  if (insertIndex === -1 || valuesIndex === -1) {
    throw new Error("No INSERT statement found.");
  }
  let index = valuesIndex + "VALUES (".length;
  const values: string[] = [];

  while (index < sql.length) {
    while (/\s/.test(sql[index] ?? "")) index += 1;
    if (sql[index] === ")") break;
    if (sql[index] === ",") {
      index += 1;
      continue;
    }

    if (sql[index] === "'") {
      index += 1;
      let value = "";
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          value += "'";
          index += 2;
        } else if (sql[index] === "'") {
          index += 1;
          break;
        } else {
          value += sql[index];
          index += 1;
        }
      }
      values.push(value);
      continue;
    }

    const start = index;
    while (index < sql.length && sql[index] !== "," && sql[index] !== ")") {
      index += 1;
    }
    values.push(sql.slice(start, index).trim());
  }

  return values;
}

describe("relational SQL export", () => {
  it("round-trips table and relationship metadata through the SQL schema parser", () => {
    const generated = generateRelationalTables(request);
    const sql = exportRelationalSql(generated);
    const parsed = parseUploadedSqlSchema(sql, request.count, request.seed);
    const schemaSummary = (
      tables: typeof request.tables,
    ) =>
      tables
        .map((table) => ({
          name: table.name,
          fields: table.fields.map((field) => ({
            name: field.name,
            primaryKey: Boolean(field.primaryKey),
            references: field.references ?? null,
          })),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

    expect(schemaSummary(parsed.tables)).toEqual(schemaSummary(request.tables));
  });

  it("escapes apostrophes and preserves double quotes in string values", () => {
    const generated = generateRelationalTables(
      relationalGeneratorRequestSchema.parse({
        tables: [
          {
            name: "quotes",
            fields: [
              { name: "id", type: "integer", primaryKey: true },
              { name: "note", type: "text" },
              { name: "quote_text", type: "text" },
              { name: "nullable_text", type: "text" },
              { name: "enabled", type: "boolean" },
              { name: "amount", type: "price" },
            ],
          },
        ],
        count: 1,
        seed: 1,
      }),
    );
    generated[0]!.records[0]!.note = "O'Brien";
    generated[0]!.records[0]!.quote_text = 'She said "hello".';
    generated[0]!.records[0]!.nullable_text = null;
    generated[0]!.records[0]!.enabled = true;
    generated[0]!.records[0]!.amount = 12.5;

    const sql = exportRelationalSql(generated);

    expect(decodeFirstInsertValues(sql)).toEqual([
      "1",
      "O'Brien",
      'She said "hello".',
      "NULL",
      "true",
      "12.5",
    ]);
  });

  it("writes tables in dependency order and batches inserts at 500 rows", () => {
    const generated = generateRelationalTables({
      ...request,
      count: 500,
    });
    const sql = exportRelationalSql([...generated].reverse());
    const createOrder = [
      sql.indexOf('CREATE TABLE "customers"'),
      sql.indexOf('CREATE TABLE "orders"'),
      sql.indexOf('CREATE TABLE "order_items"'),
    ];

    expect(createOrder[0]).toBeLessThan(createOrder[1]!);
    expect(createOrder[1]).toBeLessThan(createOrder[2]!);

    const tableWithExtraRow = {
      ...generated[0]!,
      records: [...generated[0]!.records, generated[0]!.records[0]!],
    };
    const batchedSql = exportRelationalSql([tableWithExtraRow]);
    const rowCounts = [
      ...batchedSql.matchAll(/INSERT INTO [^\n]+\nVALUES ([\s\S]*?);/g),
    ].map(([, values]) => values?.match(/\(/g)?.length ?? 0);
    expect(rowCounts).toEqual([500, 1]);
  });

  it("produces byte-identical SQL for the same seed", () => {
    expect(
      exportRelationalSql(generateRelationalTables(request)),
    ).toBe(exportRelationalSql(generateRelationalTables(request)));
  });

  it("uses the requested SQL types and quotes embedded identifier quotes", () => {
    const generated = generateRelationalTables(
      relationalGeneratorRequestSchema.parse({
        tables: [
          {
            name: "type_checks",
            fields: [
              { name: "id", type: "integer", primaryKey: true },
              { name: "reference_id", type: "uuid" },
              { name: "price", type: "price" },
              { name: "rainfall", type: "precipitation" },
              { name: "temperature", type: "temperature" },
              { name: "observed_at", type: "date" },
              { name: "birthday", type: "date" },
              { name: "enabled", type: "boolean" },
              { name: "display_name", type: "fullName" },
            ],
          },
        ],
        count: 1,
        seed: 8,
      }),
    );
    const table = generated[0]!;
    const renamedField = table.fields[1]!;
    for (const record of table.records) {
      record['ref"id'] = record[renamedField.name]!;
      delete record[renamedField.name];
    }
    renamedField.name = 'ref"id';

    const sql = exportRelationalSql(generated);

    expect(sql).toContain('"ref""id" uuid');
    expect(sql).toContain('"price" numeric(12,2)');
    expect(sql).toContain('"rainfall" numeric(6,2)');
    expect(sql).toContain('"temperature" integer');
    expect(sql).toContain('"observed_at" timestamptz');
    expect(sql).toContain('"birthday" date');
    expect(sql).toContain('"enabled" boolean');
    expect(sql).toContain('"display_name" text');
  });
});
