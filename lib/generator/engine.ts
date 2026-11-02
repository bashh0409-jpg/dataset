import {
  fakerEN_GB,
  fakerEN_US,
  fakerEN_ZA,
  type Faker,
} from "@faker-js/faker";
import { z } from "zod";
import {
  carriersByLocale,
  citiesByLocale,
  generatorIndustries,
  generatorLocales,
  getIndustryCompanyNames,
  getIndustryForTable,
  getIndustryProductNames,
  type GeneratorIndustry,
  type GeneratorLocale,
} from "./packs";

export {
  generatorIndustries,
  generatorLocales,
  industryLabels,
  inferGenerationPacks,
  localeLabels,
} from "./packs";

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
  "carrier",
  "trackingNumber",
  "temperature",
  "precipitation",
  "coordinates",
  "country",
  "url",
  "postalCode",
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
export type { GeneratorIndustry, GeneratorLocale } from "./packs";

const uniquePrimaryKeyTypes = new Set<FieldType>([
  "integer",
  "uuid",
  "idNumber",
  "email",
  "company",
  "product",
]);

const generationPacksSchema = z.object({
  locale: z.enum(generatorLocales).default("en-US"),
  industry: z.enum(generatorIndustries).default("general"),
});

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
    ...generationPacksSchema.shape,
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
  from: new Date("2022-01-01T00:00:00.000Z"),
  to: new Date("2025-12-31T23:59:59.999Z"),
};
const birthDateRange = {
  from: new Date("1940-01-01T00:00:00.000Z"),
  to: new Date("2007-12-31T23:59:59.999Z"),
};
const expiryDateRange = {
  from: new Date("2026-01-01T00:00:00.000Z"),
  to: new Date("2030-12-31T23:59:59.999Z"),
};
const realisticTextSamples = [
  "The request is ready for review by the assigned team.",
  "The account was updated after the latest customer activity.",
  "The record was imported from the connected system.",
  "This item is available for standard processing.",
  "The customer requested a follow-up before completion.",
  "The details were confirmed during the latest review.",
  "The delivery is scheduled for the next business day.",
  "No additional action is required at this time.",
  "The order is being prepared for dispatch.",
  "The support team sent an update to the customer.",
  "The payment was confirmed and the receipt is available.",
  "The profile was created during account registration.",
];
const productDescriptions = [
  "Designed for dependable everyday use.",
  "Made with durable materials and a comfortable finish.",
  "A practical choice for home, work, or travel.",
  "Features a simple design and easy-to-use controls.",
  "Built to deliver reliable performance over time.",
  "Lightweight, easy to store, and ready to use.",
  "A versatile option with a clean, modern design.",
  "Suitable for daily use and straightforward to maintain.",
];
const fakerByLocale: Record<GeneratorLocale, Faker> = {
  "en-US": fakerEN_US,
  "en-GB": fakerEN_GB,
  "en-ZA": fakerEN_ZA,
};
const statusOptionsByTable: Record<string, string[]> = {
  order: ["pending", "processing", "shipped", "delivered", "cancelled"],
  payment: ["pending", "paid", "failed", "refunded"],
  user: ["active", "inactive", "suspended"],
  account: ["active", "inactive", "suspended"],
  ticket: ["open", "in_progress", "resolved", "closed"],
  shipment: ["pending", "in_transit", "delivered", "returned"],
};

function getTableStatusOptions(tableName: string) {
  const normalizedName = tableName.toLowerCase();
  const matchingEntity = Object.keys(statusOptionsByTable).find((entity) =>
    normalizedName.includes(entity),
  );
  return matchingEntity
    ? statusOptionsByTable[matchingEntity]
    : ["pending", "active", "completed"];
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function isTemperatureField(name: string) {
  return /(?:^|_)(?:temp|temperature)(?:_|$)/i.test(name);
}

function isPrecipitationField(name: string) {
  return /^(?:prcp|precip(?:itation)?|rain(?:fall)?)(?:_|$)/i.test(name);
}

function generateValue(
  field: GeneratorRequest["fields"][number],
  tableName: string,
  rowIndex: number,
  record: GeneratedRecord,
  person: { firstName: string; lastName: string },
  locale: GeneratorLocale,
  localeFaker: Faker,
  industry: GeneratorIndustry,
  primaryKey = false,
  primaryKeyValues?: readonly string[],
): string | number | boolean {
  const normalizedName = field.name.toLowerCase();
  const tableIndustry = getIndustryForTable(industry, tableName);
  if (
    field.type !== "enum" &&
    /^(?:carrier|carrier_name|shipping_carrier)$/.test(normalizedName)
  ) {
    return carriersByLocale[locale][rowIndex % carriersByLocale[locale].length]!;
  }
  if (
    field.type !== "enum" &&
    /^(?:tracking|tracking_no|tracking_number|tracking_code|tracking_id)$/.test(normalizedName)
  ) {
    return `TRK-${locale.slice(-2)}-${slugify(tableName).toUpperCase()}-${String(rowIndex + 1).padStart(6, "0")}`;
  }
  const firstName =
    typeof record.first_name === "string"
      ? record.first_name
      : person.firstName;
  const lastName =
    typeof record.last_name === "string" ? record.last_name : person.lastName;

  switch (field.type) {
    case "uuid":
      return localeFaker.string.uuid();
    case "idNumber":
      if (primaryKey) {
        return `TEST-${(rowIndex + 1).toString(16).padStart(10, "0").toUpperCase()}`;
      }
      return `TEST-${localeFaker.string.uuid().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    case "firstName":
      return firstName;
    case "lastName":
      return lastName;
    case "fullName":
      return `${firstName} ${lastName}`;
    case "email":
      return `${slugify(firstName)}.${slugify(lastName)}${rowIndex ? rowIndex + 1 : ""}@example.com`;
    case "company":
      {
        const names = getIndustryCompanyNames(tableIndustry);
        if (!primaryKey) return localeFaker.helpers.arrayElement(names);
        const values = primaryKeyValues ?? names;
        const value = values[rowIndex % values.length]!;
        const cycle = Math.floor(rowIndex / values.length);
        return cycle === 0 ? value : `${value} #${cycle + 1}`;
      }
    case "product":
      {
        const names = getIndustryProductNames(tableIndustry);
        if (!primaryKey) return localeFaker.helpers.arrayElement(names);
        const values = primaryKeyValues ?? names;
        const value = values[rowIndex % values.length]!;
        const cycle = Math.floor(rowIndex / values.length);
        return cycle === 0 ? value : `${value} #${cycle + 1}`;
      }
    case "carrier":
      return carriersByLocale[locale][rowIndex % carriersByLocale[locale].length]!;
    case "trackingNumber":
      return `TRK-${locale.slice(-2)}-${slugify(tableName).toUpperCase()}-${String(rowIndex + 1).padStart(6, "0")}`;
    case "temperature":
      return localeFaker.number.int({ min: -20, max: 45 });
    case "precipitation":
      return localeFaker.number.float({ min: 0, max: 50, fractionDigits: 2 });
    case "coordinates":
      return `(${localeFaker.location.longitude()}, ${localeFaker.location.latitude()})`;
    case "country":
      return locale === "en-ZA"
        ? "South Africa"
        : locale === "en-GB"
          ? "United Kingdom"
          : "United States";
    case "url":
      return `https://example.com/${slugify(tableName)}/${rowIndex + 1}`;
    case "postalCode":
      return localeFaker.location.zipCode();
    case "integer":
      if (isTemperatureField(field.name)) {
        return localeFaker.number.int({ min: -20, max: 45 });
      }
      if (/^(?:birth_?year)$/.test(normalizedName)) {
        return localeFaker.number.int({ min: 1940, max: 2008 });
      }
      if (/^(?:year|expiry_?year)$/.test(normalizedName)) {
        return localeFaker.number.int({ min: 2026, max: 2030 });
      }
      if (/^(?:month|expiry_?month)$/.test(normalizedName)) {
        return localeFaker.number.int({ min: 1, max: 12 });
      }
      if (/(?:^|_)(?:age)$/.test(normalizedName)) {
        return localeFaker.number.int({ min: 18, max: 90 });
      }
      if (/(?:quantity|count|number_of|total_items)$/.test(normalizedName)) {
        return localeFaker.number.int({ min: 1, max: 20 });
      }
      if (/(?:^|_)(?:rating|stars?)(?:_|$)/.test(normalizedName)) {
        return localeFaker.number.int({ min: 1, max: 5 });
      }
      if (/(?:^|_)(?:percent|percentage|discount)(?:_|$)/.test(normalizedName)) {
        return localeFaker.number.int({ min: 0, max: 50 });
      }
      if (/(?:^|_)(?:id)$/.test(normalizedName)) {
        return localeFaker.number.int({ min: 1, max: 5_000 });
      }
      return localeFaker.number.int({ min: 0, max: 1_000 });
    case "price":
      if (isPrecipitationField(field.name)) {
        return localeFaker.number.float({ min: 0, max: 50, fractionDigits: 2 });
      }
      if (/(?:^|_)(?:percent|percentage|discount|tax_rate)(?:_|$)/.test(normalizedName)) {
        return localeFaker.number.float({ min: 0, max: 50, fractionDigits: 2 });
      }
      if (/(?:^|_)(?:rating|stars?)(?:_|$)/.test(normalizedName)) {
        return localeFaker.number.float({ min: 1, max: 5, fractionDigits: 1 });
      }
      if (/(?:salary|annual_income)/.test(normalizedName)) {
        return localeFaker.number.int({ min: 35_000, max: 180_000 });
      }
      if (/(?:price|cost|amount|total|subtotal|balance|payment)/.test(normalizedName)) {
        return localeFaker.number.float({ min: 5, max: 1_000, fractionDigits: 2 });
      }
      return localeFaker.number.float({ min: 1, max: 500, fractionDigits: 2 });
    case "boolean":
      return localeFaker.datatype.boolean();
    case "date":
      {
        const range = /(?:birth|birthday)/i.test(field.name)
          ? birthDateRange
          : /(?:expir|expiry)/i.test(field.name)
            ? expiryDateRange
            : dateRange;
        const date = localeFaker.date.between(range).toISOString();
        return /(?:_at|timestamp)$/i.test(field.name)
          ? date
          : date.slice(0, 10);
      }
    case "phone":
      if (locale === "en-US") {
        return `+1-202-555-01${String(rowIndex % 100).padStart(2, "0")}`;
      }
      return localeFaker.phone.number();
    case "city":
      return field.name.toLowerCase() === "name" &&
        /^(?:cities|city|towns|town)$/.test(tableName.toLowerCase())
        ? citiesByLocale[locale][rowIndex % citiesByLocale[locale].length]!
        : localeFaker.helpers.arrayElement(citiesByLocale[locale]);
    case "address":
      return localeFaker.location.streetAddress();
    case "text":
      if (/^(?:url|website|homepage|profile_url)$/.test(normalizedName)) {
        return `https://example.com/${slugify(tableName)}/${rowIndex + 1}`;
      }
      if (/^(?:description|summary)$/.test(normalizedName)) {
        return /product|item|catalog/i.test(tableName)
          ? localeFaker.helpers.arrayElement(productDescriptions)
          : localeFaker.helpers.arrayElement(realisticTextSamples);
      }
      if (/^(?:title|subject)$/.test(normalizedName)) {
        return localeFaker.helpers.arrayElement([
          "Account update",
          "Order confirmation",
          "Delivery status",
          "Product availability",
          "Customer support request",
          "Payment receipt",
        ]);
      }
      if (/^(?:notes?|comment|message|reason)$/.test(normalizedName)) {
        return localeFaker.helpers.arrayElement(realisticTextSamples);
      }
      return localeFaker.helpers.arrayElement(realisticTextSamples);
    case "enum":
      return localeFaker.helpers.arrayElement(
        field.options?.length
          ? field.options
          : /^(?:status|state)$/.test(normalizedName)
            ? getTableStatusOptions(tableName)
            : [],
      );
  }
}

function orderTemperatureRanges(
  records: GeneratedRecord[],
  fields: GeneratorRequest["fields"],
) {
  const lowField = fields.find((field) =>
    /^(?:temp|temperature)_(?:lo|low|min|minimum)$/.test(
      field.name.toLowerCase(),
    ),
  );
  const highField = fields.find((field) =>
    /^(?:temp|temperature)_(?:hi|high|max|maximum)$/.test(
      field.name.toLowerCase(),
    ),
  );
  if (!lowField || !highField) return;

  for (const record of records) {
    const low = record[lowField.name];
    const high = record[highField.name];
    if (typeof low === "number" && typeof high === "number" && low > high) {
      record[lowField.name] = high;
      record[highField.name] = low;
    }
  }
}

export function generateRecords(request: GeneratorRequest): GeneratedRecord[] {
  const localeFaker = fakerByLocale[request.locale];
  localeFaker.seed(request.seed);

  const records = Array.from({ length: request.count }, (_, rowIndex) => {
    const person = {
      firstName: localeFaker.person.firstName(),
      lastName: localeFaker.person.lastName(),
    };
    const record: GeneratedRecord = {};
    for (const field of request.fields) {
      record[field.name] = generateValue(
        field,
        request.name,
        rowIndex,
        record,
        person,
        request.locale,
        localeFaker,
        request.industry,
      );
    }
    return record;
  });
  orderTemperatureRanges(records, request.fields);
  return records;
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
      ...generationPacksSchema.shape,
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

        for (const [fieldIndex, field] of table.fields.entries()) {
          if (field.primaryKey && !uniquePrimaryKeyTypes.has(field.type)) {
            context.addIssue({
              code: "custom",
              message: `Primary key "${table.name}.${field.name}" must use a unique-capable type: integer, uuid, idNumber, email, company, or product.`,
              path: ["tables", tableIndex, "fields", fieldIndex, "primaryKey"],
            });
          }
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
    const localeFaker = fakerByLocale[request.locale];
    localeFaker.seed(tableSeed);
    const primaryKeyValues = new Map<string, readonly string[]>();
    for (const field of next.fields) {
      if (!field.primaryKey || !["company", "product"].includes(field.type)) {
        continue;
      }
      const tableIndustry = getIndustryForTable(request.industry, next.name);
      const values =
        field.type === "company"
          ? getIndustryCompanyNames(tableIndustry)
          : getIndustryProductNames(tableIndustry);
      primaryKeyValues.set(field.name, localeFaker.helpers.shuffle([...values]));
    }

    const records = Array.from({ length: request.count }, (_, rowIndex) => {
      const person = {
        firstName: localeFaker.person.firstName(),
        lastName: localeFaker.person.lastName(),
      };
      const record: GeneratedRecord = {};
      for (const field of next.fields) {
          if (field.references) {
            if (field.references.table === next.name) {
              record[field.name] = null;
              continue;
            }
            const parentRecords = generated.get(field.references.table);
            if (!parentRecords?.length) {
              throw new Error("Referenced table has no generated records.");
            }
            const parent = localeFaker.helpers.arrayElement(parentRecords);
            record[field.name] = parent[field.references.field];
            continue;
          }
          if (field.primaryKey && field.type === "integer") {
            record[field.name] = rowIndex + 1;
            continue;
          }
          record[field.name] = generateValue(
            field,
            next.name,
            rowIndex,
            record,
            person,
            request.locale,
            localeFaker,
            request.industry,
            Boolean(field.primaryKey),
            primaryKeyValues.get(field.name),
          );
      }
      return record;
    });
    orderTemperatureRanges(records, next.fields);
    for (const [rowIndex, record] of records.entries()) {
      for (const field of next.fields) {
        if (field.references?.table !== next.name || rowIndex === 0) continue;
        const parent = localeFaker.helpers.arrayElement(records.slice(0, rowIndex));
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
