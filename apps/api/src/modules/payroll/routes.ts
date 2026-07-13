import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { payrollRows, employees } from "../../db/schema/index.js";
import { requirePermission } from "../../plugins/rbac.js";

// Payroll rows are entirely salary data (bruto/bonos/neto/aportes/costoCompania
// — every column is sensitive). Unlike the employees module, where only one
// field ("salario") needs stripping out of an otherwise-visible row, here the
// whole row is the sensitive part. the mockup's Nomina.tsx (the source of
// truth for this endpoint's shape) renders every column unconditionally with
// no field-level distinction in the actual UI — the "Costo por centro de
// costo" field_permissions entry for `jefe` is unused by the mock's own page.
// So the simplest correct gate is module-level: requirePermission("Nómina",
// "Ver") on the whole endpoint, no per-column field-filtering.
export default async function payrollRoutes(app: FastifyInstance) {
  app.get("/payroll", { preHandler: requirePermission("Nómina", "Ver") }, async (request) => {
    const { periodo, employeeId } = request.query as { periodo?: string; employeeId?: string };
    const conditions = [];
    if (periodo) conditions.push(eq(payrollRows.periodo, periodo));
    if (employeeId) conditions.push(eq(payrollRows.employeeId, employeeId));

    return request.db
      .select()
      .from(payrollRows)
      .where(conditions.length ? and(...conditions) : undefined);
  });

  // Grouped totals by país and by centro de costo — two GROUP BY queries (one
  // round trip each), never a full row fetch aggregated in app code.
  app.get("/payroll/aggregates", { preHandler: requirePermission("Nómina", "Ver") }, async (request) => {
    const { periodo } = request.query as { periodo?: string };
    const where = periodo ? eq(payrollRows.periodo, periodo) : undefined;

    const totals = {
      headcount: sql<number>`count(*)::int`,
      bruto: sql<string>`sum(${payrollRows.bruto})`,
      bonos: sql<string>`sum(${payrollRows.bonos})`,
      descuentos: sql<string>`sum(${payrollRows.descuentos})`,
      neto: sql<string>`sum(${payrollRows.neto})`,
      aportes: sql<string>`sum(${payrollRows.aportes})`,
      costoCompania: sql<string>`sum(${payrollRows.costoCompania})`,
    };

    const byPais = await request.db
      .select({ pais: employees.pais, ...totals })
      .from(payrollRows)
      .innerJoin(employees, eq(employees.id, payrollRows.employeeId))
      .where(where)
      .groupBy(employees.pais);

    const byCentroCosto = await request.db
      .select({ centroCosto: employees.centroCosto, ...totals })
      .from(payrollRows)
      .innerJoin(employees, eq(employees.id, payrollRows.employeeId))
      .where(where)
      .groupBy(employees.centroCosto);

    return { byPais, byCentroCosto };
  });
}
