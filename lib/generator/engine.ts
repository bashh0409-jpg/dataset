import { faker } from "@faker-js/faker";
import { z } from "zod";

export const MAX_RECORD_COUNT = 500;

export const fieldTypes = [
  "uuid",
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
  "enum",
] as const;

export type FieldType = (typeof fieldTypes)[number];

const fieldSchema = z
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
    fields: z.array(fieldSchema).min(1).max(25),
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
export type GeneratedRecord = Record<string, string | number | boolean>;

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

function escapeCsvCell(value: string | number | boolean): string {
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
