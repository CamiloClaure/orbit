import type { FastifyInstance } from "fastify";
import { employees } from "../../db/schema/index.js";
import { requirePermission } from "../../plugins/rbac.js";
import { fieldsGrantedFor, stripGatedFields } from "../auth/field-filter.js";

const COLUMNS = [
  "employeeCode",
  "nombre",
  "puesto",
  "departamento",
  "centroCosto",
  "sede",
  "pais",
  "ciudad",
  "estado",
  "email",
  "telefono",
  "ingreso",
  "salario",
] as const;

// The entire CSV escaping rule: wrap in quotes and double any embedded quote,
// only when the field actually contains a comma/quote/newline.
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async function reportsRoutes(app: FastifyInstance) {
  app.get("/reports/employees.csv", { preHandler: requirePermission("Reportes", "Ver") }, async (request, reply) => {
    const rows = await request.db.select().from(employees);
    const granted = await fieldsGrantedFor(request.db, "Nómina", request.authUser!.roleId);
    const filtered = rows.map((r) => stripGatedFields(r, granted));

    // Drop the salario column from the header entirely (rather than leaving
    // an empty column) when the role lacks the field grant.
    const columns = COLUMNS.filter((c) => c !== "salario" || granted.has("salario"));
    const lines = [columns.join(",")];
    for (const row of filtered) {
      const record = row as unknown as Record<string, unknown>;
      lines.push(columns.map((c) => csvField(record[c])).join(","));
    }

    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=employees.csv");
    return lines.join("\n");
  });
}
