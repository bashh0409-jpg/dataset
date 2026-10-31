import { faker } from "@faker-js/faker";
import { z } from "zod";

export const MAX_RECORD_COUNT = 500;
export const DEFAULT_RELATIONAL_GENERATION_LIMITS = {
  maxTables: 10,
  maxRecordsPerTable: MAX_RECORD_COUNT,
  maxTotalRecords: 2_000,
} as const;
export const PRO_RELATIONAL_GENERATION_LIMITS = {
  maxTables: 80,
  maxRecordsPerTable: 100,
  maxTotalRecords: 8_000,
} as const;

export type RelationalGenerationLimits = {
  maxTables: number;
  maxRecordsPerTable: number;
  maxTotalRecords: number;
};

export const fieldTypes = [
  "uuid",
  "idNumber",
  "firstName",
  "lastName",
  "fullName",
  "email",
  "company",
  "product",
  "integer",
  "price",
  "boolean",
  "date",
  "phone",
  "city",
  "address",
  "text",
  "enum",
] as const;

export type FieldType = (typeof fieldTypes)[number];

export const generatorFieldSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Field names are required.")
      .max(40, "Field names must be 40 characters or fewer.")
      .regex(
        /^[A-Za-z_][A-Za-z0-9_]*$/,
        "Use letters, numbers, and underscores; the first character must be a letter or underscore.",
      ),
    type: z.enum(fieldTypes),
    options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  })
  .superRefine((field, context) => {
    if (field.type === "enum" && (!field.options || field.options.length < 2)) {
      context.addIssue({
        code: "custom",
        message: "Enum fields need at least two options.",
        path: ["options"],
      });
    }

    if (field.options && new Set(field.options).size !== field.options.length) {
      context.addIssue({
        code: "custom",
        message: "Enum options must be unique.",
        path: ["options"],
      });
    }
  });

export const generatorRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    fields: z.array(generatorFieldSchema).min(1).max(25),
    count: z.number().int().min(1).max(MAX_RECORD_COUNT),
    seed: z.number().int().min(0).max(2_147_483_647),
  })
  .superRefine((request, context) => {
    const names = request.fields.map((field) => field.name);
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        message: "Field names must be unique.",
        path: ["fields"],
      });
    }
  });

export type GeneratorRequest = z.infer<typeof generatorRequestSchema>;
export type GeneratedRecord = Record<string, string | number | boolean | null>;

const dateRange = {
  from: new Date("2000-01-01T00:00:00.000Z"),
  to: new Date("2030-12-31T23:59:59.999Z"),
};

function generateValue(
  field: GeneratorRequest["fields"][number],
): string | number | boolean {
  switch (field.type) {
    case "uuid":
      return faker.string.uuid();
    case "idNumber":
      return `TEST-${faker.string.uuid().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    case "firstName":
      return faker.person.firstName();
    case "lastName":
      return faker.person.lastName();
    case "fullName":
      return faker.person.fullName();
    case "email":
      return faker.internet.email();
    case "company":
      return faker.company.name();
    case "product":
      return faker.commerce.productName();
    case "integer":
      return faker.number.int({ min: 0, max: 100_000 });
    case "price":
      return faker.number.float({ min: 1, max: 10_000, fractionDigits: 2 });
    case "boolean":
      return faker.datatype.boolean();
    case "date":
      return faker.date.between(dateRange).toISOString();
    case "phone":
      return faker.phone.number();
    case "city":
      return faker.location.city();
    case "address":
      return faker.location.streetAddress();
    case "text":
      return faker.lorem.sentence();
    case "enum":
      return faker.helpers.arrayElement(field.options ?? []);
  }
}

export function generateRecords(request: GeneratorRequest): GeneratedRecord[] {
  faker.seed(request.seed);

  return Array.from({ length: request.count }, () =>
    Object.fromEntries(
      request.fields.map((field) => [field.name, generateValue(field)]),
    ),
  );
}

function escapeCsvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[\t\r\n ]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function recordsToCsv(
  fields: GeneratorRequest["fields"],
  records: GeneratedRecord[],
): string {
  const header = fields.map((field) => escapeCsvCell(field.name)).join(",");
  const rows = records.map((record) =>
    fields.map((field) => escapeCsvCell(record[field.name])).join(","),
  );

  return [header, ...rows].join("\r\n");
}

export const relationalGeneratorFieldSchema = generatorFieldSchema.extend({
  primaryKey: z.boolean().optional(),
  references: z
    .object({
      table: z.string().trim().min(1).max(80),
      field: z.string().trim().min(1).max(40),
    })
    .optional(),
});

export function createRelationalGeneratorRequestSchema(
  limits: RelationalGenerationLimits = DEFAULT_RELATIONAL_GENERATION_LIMITS,
) {
  return z
    .object({
      tables: z
        .array(
          z.object({
            name: z
              .string()
              .trim()
              .min(1)
              .max(80)
              .regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
            fields: z.array(relationalGeneratorFieldSchema).min(1).max(25),
          }),
        )
        .min(1)
        .max(limits.maxTables),
      count: z.number().int().min(1).max(limits.maxRecordsPerTable),
      seed: z.number().int().min(0).max(2_147_483_647),
    })
    .superRefine((request, context) => {
      if (request.tables.length * request.count > limits.maxTotalRecords) {
        context.addIssue({
          code: "custom",
          message: `A request can generate at most ${limits.maxTotalRecords.toLocaleString()} records across all tables.`,
          path: ["count"],
        });
      }

      const tablesByName = new Map(
        request.tables.map((table) => [table.name, table]),
      );
      if (tablesByName.size !== request.tables.length) {
        context.addIssue({
          code: "custom",
          message: "Table names must be unique.",
          path: ["tables"],
        });
      }

      const dependencies = new Map<string, Set<string>>();
      for (const [tableIndex, table] of request.tables.entries()) {
        const fieldNames = new Set(table.fields.map((field) => field.name));
        if (fieldNames.size !== table.fields.length) {
          context.addIssue({
            code: "custom",
            message: `Field names in table "${table.name}" must be unique.`,
            path: ["tables", tableIndex, "fields"],
          });
        }

        const primaryKeys = table.fields.filter((field) => field.primaryKey);
        if (primaryKeys.length > 1) {
          context.addIssue({
            code: "custom",
            message: `Table "${table.name}" can define only one primary key.`,
            path: ["tables", tableIndex, "fields"],
          });
        }

        dependencies.set(table.name, new Set());
        for (const [fieldIndex, field] of table.fields.entries()) {
          if (!field.references) continue;
          const targetTable = tablesByName.get(field.references.table);
          const targetField = targetTable?.fields.find(
            (candidate) => candidate.name === field.references?.field,
          );
          if (
            !targetTable ||
            !targetField?.primaryKey ||
            targetField.type !== field.type
          ) {
            context.addIssue({
              code: "custom",
              message: `Reference "${table.name}.${field.name}" must target a compatible primary key in a generated table.`,
              path: ["tables", tableIndex, "fields", fieldIndex, "references"],
            });
            continue;
          }
          if (targetTable.name !== table.name) {
            dependencies.get(table.name)?.add(targetTable.name);
          }
        }
      }

      const visited = new Set<string>();
      const visiting = new Set<string>();
      const visit = (tableName: string) => {
        if (visiting.has(tableName)) return false;
        if (visited.has(tableName)) return true;
        visiting.add(tableName);
        for (const dependency of dependencies.get(tableName) ?? []) {
          if (!visit(dependency)) return false;
        }
        visiting.delete(tableName);
        visited.add(tableName);
        return true;
      };

      for (const table of request.tables) {
        if (!visit(table.name)) {
          context.addIssue({
            code: "custom",
            message: "Table relationships cannot contain cycles.",
            path: ["tables"],
          });
          break;
        }
      }
    });
}

export const relationalGeneratorRequestSchema =
  createRelationalGeneratorRequestSchema();

export type RelationalGeneratorRequest = z.infer<
  typeof relationalGeneratorRequestSchema
>;
export type RelationalGeneratorField = z.infer<
  typeof relationalGeneratorFieldSchema
>;
export type GeneratedTable = {
  name: string;
  fields: RelationalGeneratorField[];
  records: GeneratedRecord[];
  count: number;
  seed: number;
};

export function generateRelationalTables(
  input: RelationalGeneratorRequest,
  limits: RelationalGenerationLimits = DEFAULT_RELATIONAL_GENERATION_LIMITS,
): GeneratedTable[] {
  const request = createRelationalGeneratorRequestSchema(limits).parse(input);
  const pending = new Map(request.tables.map((table) => [table.name, table]));
  const generated = new Map<string, GeneratedRecord[]>();
  const output: GeneratedTable[] = [];

  while (pending.size > 0) {
    const next = [...pending.values()].find((table) =>
      table.fields.every(
        (field) =>
          !field.references ||
          field.references.table === table.name ||
          generated.has(field.references.table),
      ),
    );
    if (!next) {
      throw new Error("Unable to resolve table generation order.");
    }

    const tableSeed =
      (request.seed + request.tables.findIndex((table) => table.name === next.name)) %
      2_147_483_648;
    faker.seed(tableSeed);
    const records = Array.from({ length: request.count }, (_, rowIndex) =>
      Object.fromEntries(
        next.fields.map((field) => {
          if (field.references) {
            if (field.references.table === next.name) {
              return [field.name, null];
            }
            const parentRecords = generated.get(field.references.table);
            if (!parentRecords?.length) {
              throw new Error("Referenced table has no generated records.");
            }
            const parent = faker.helpers.arrayElement(parentRecords);
            return [field.name, parent[field.references.field]];
          }
          if (field.primaryKey && field.type === "integer") {
            return [field.name, rowIndex + 1];
          }
          return [field.name, generateValue(field)];
        }),
      ),
    );
    for (const [rowIndex, record] of records.entries()) {
      for (const field of next.fields) {
        if (field.references?.table !== next.name || rowIndex === 0) continue;
        const parent = faker.helpers.arrayElement(records.slice(0, rowIndex));
        record[field.name] = parent[field.references.field];
      }
    }

    generated.set(next.name, records);
    output.push({
      name: next.name,
      fields: next.fields,
      records,
      count: request.count,
      seed: tableSeed,
    });
    pending.delete(next.name);
  }

  return output;
}
