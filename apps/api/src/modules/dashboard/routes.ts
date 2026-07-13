import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { employees, payrollRows, recognitions, rolePermissions } from "../../db/schema/index.js";
import { requireAuth } from "../../plugins/rbac.js";

const TREND_MONTHS = 6;

// No dedicated "Dashboard" entry exists in the module×action matrix
// (the mockup's roles.ts `modulos` list has no "Dashboard" — it's a general
// landing page every role sees a version of), so this is gated by
// `requireAuth` only. The one section that IS sensitive — payroll totals —
// is independently checked against the Nómina/Ver grant and omitted (not the
// whole dashboard 403'd) when absent.
export default async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: requireAuth }, async (request) => {
    const db = request.db;

    const [{ headcount }] = await db
      .select({ headcount: sql<number>`count(*) filter (where ${employees.estado} = 'Activo')::int` })
      .from(employees);

    const deptDistribution = await db
      .select({ departamento: employees.departamento, total: sql<number>`count(*)::int` })
      .from(employees)
      .groupBy(employees.departamento)
      .orderBy(sql`count(*) desc`);

    // One grouped query over all hire months present in the seed data, then
    // a cumulative sum in JS over that (already tiny) aggregate result — not
    // a per-month round trip, and not fetching full employee rows to sum in
    // app code.
    const monthlyHires = await db
      .select({
        mes: sql<string>`to_char(date_trunc('month', ${employees.ingreso}), 'YYYY-MM')`,
        altas: sql<number>`count(*)::int`,
      })
      .from(employees)
      .groupBy(sql`date_trunc('month', ${employees.ingreso})`)
      .orderBy(sql`date_trunc('month', ${employees.ingreso})`);

    // ponytail: there's no termination-date column yet, so this cumulative
    // headcount is "hired on or before that month" (ignores estado) rather
    // than a true point-in-time headcount. Add a bajas/exit date if that
    // distinction becomes load-bearing.
    let running = 0;
    const headcountTrend = monthlyHires
      .map((m) => ({ mes: m.mes, altas: m.altas, headcount: (running += m.altas) }))
      .slice(-TREND_MONTHS);

    const [grant] = await db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, request.authUser!.roleId),
          eq(rolePermissions.modulo, "Nómina"),
          eq(rolePermissions.accion, "Ver"),
        ),
      )
      .limit(1);

    let payroll = null;
    if (grant) {
      const [totals] = await db
        .select({
          bruto: sql<string>`coalesce(sum(${payrollRows.bruto}), 0)`,
          bonos: sql<string>`coalesce(sum(${payrollRows.bonos}), 0)`,
          descuentos: sql<string>`coalesce(sum(${payrollRows.descuentos}), 0)`,
          neto: sql<string>`coalesce(sum(${payrollRows.neto}), 0)`,
          aportes: sql<string>`coalesce(sum(${payrollRows.aportes}), 0)`,
          costoCompania: sql<string>`coalesce(sum(${payrollRows.costoCompania}), 0)`,
        })
        .from(payrollRows);
      payroll = totals;
    }

    // recognitions may legitimately be empty (table exists, seeded sparsely
    // or not at all depending on timing) — an empty top-5 is a fine result.
    const topReconocidos = await db
      .select({
        employeeId: recognitions.paraEmployeeId,
        nombre: employees.nombre,
        total: sql<number>`count(*)::int`,
      })
      .from(recognitions)
      .innerJoin(employees, eq(employees.id, recognitions.paraEmployeeId))
      .groupBy(recognitions.paraEmployeeId, employees.nombre)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    return { headcount, deptDistribution, headcountTrend, payroll, topReconocidos };
  });
}
