import type { FieldType, GeneratedRecord, GeneratedTable } from "./engine";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function getSqlType(type: FieldType, fieldName: string) {
  switch (type) {
    case "uuid":
      return "uuid";
    case "integer":
    case "temperature":
      return "integer";
    case "boolean":
      return "boolean";
    case "price":
      return "numeric(12,2)";
    case "precipitation":
      return "numeric(6,2)";
    case "date":
      return /_at$/i.test(fieldName) || /timestamp/i.test(fieldName)
        ? "timestamptz"
        : "date";
    default:
      return "text";
  }
}

function orderTablesByDependency(tables: GeneratedTable[]) {
  const tablesByName = new Map(tables.map((table) => [table.name, table]));
  if (tablesByName.size !== tables.length) {
    throw new Error("SQL export requires unique table names.");
  }

  const pending = new Set(tables.map((table) => table.name));
  const ordered: GeneratedTable[] = [];

  while (pending.size > 0) {
    const next = tables.find(
      (table) =>
        pending.has(table.name) &&
        table.fields.every((field) => {
          if (!field.references) return true;
          const referencedTable = tablesByName.get(field.references.table);
          if (
            !referencedTable?.fields.some(
              (candidate) => candidate.name === field.references?.field,
            )
          ) {
            throw new Error(
              `SQL export cannot resolve reference "${table.name}.${field.name}" to "${field.references.table}.${field.references.field}".`,
            );
          }
          if (field.references.table === table.name) return true;
          return !pending.has(field.references.table);
        }),
    );

    if (!next) {
      throw new Error("SQL export requires acyclic table references.");
    }

    ordered.push(next);
    pending.delete(next.name);
  }

  return ordered;
}

function encodeSqlValue(value: GeneratedRecord[string] | undefined) {
  if (value === undefined) {
    throw new Error("SQL export cannot encode a missing field value.");
  }
  if (value === null) return "NULL";
  if (typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("SQL export cannot encode a non-finite number.");
    }
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function createTableStatement(table: GeneratedTable) {
  const columns = table.fields.map((field) => {
    const primaryKey = field.primaryKey ? " PRIMARY KEY" : "";
    const reference = field.references
      ? ` REFERENCES ${quoteIdentifier(field.references.table)} (${quoteIdentifier(field.references.field)})`
      : "";
    return `  ${quoteIdentifier(field.name)} ${getSqlType(field.type, field.name)}${primaryKey}${reference}`;
  });

  return `CREATE TABLE ${quoteIdentifier(table.name)} (\n${columns.join(",\n")}\n);`;
}

function insertStatements(table: GeneratedTable) {
  if (table.records.length === 0) return [];

  const columns = table.fields
    .map((field) => quoteIdentifier(field.name))
    .join(", ");
  const statements: string[] = [];

  for (let start = 0; start < table.records.length; start += 500) {
    const batch = table.records.slice(start, start + 500);
    const values = batch.map(
      (record) =>
        `(${table.fields
          .map((field) => encodeSqlValue(record[field.name]))
          .join(", ")})`,
    );
    statements.push(
      `INSERT INTO ${quoteIdentifier(table.name)} (${columns})\nVALUES ${values.join(",\n")};`,
    );
  }

  return statements;
}

export function exportRelationalSql(tables: GeneratedTable[]) {
  if (tables.length === 0) return "";

  const orderedTables = orderTablesByDependency(tables);
  const createStatements = orderedTables.map(createTableStatement);
  const insertStatementsInOrder = orderedTables.flatMap(insertStatements);

  return [...createStatements, ...insertStatementsInOrder].join("\n\n");
}
