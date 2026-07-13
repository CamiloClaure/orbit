import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { employees } from "../../db/schema/index.js";
import { requirePermission } from "../../plugins/rbac.js";

interface OrgNode {
  id: string;
  employeeCode: string;
  nombre: string;
  puesto: string;
  departamento: string;
  pais: string;
  iniciales: string;
  avatar: string;
  children: OrgNode[];
  /** Reportes directos + indirectos. */
  total: number;
}

// Derived straight from employees.supervisorId — no separate tree library,
// this is grouping-by-parent-id plus a recursive node builder. Only Activo
// employees are included (mirrors the mockup's `activos`-based org tree).
// Roots = supervisorId null, OR pointing at someone outside the Activo set
// (e.g. an inactive supervisor) so no employee silently disappears from the
// chart.
export default async function orgchartRoutes(app: FastifyInstance) {
  app.get("/orgchart", { preHandler: requirePermission("Empleados", "Ver") }, async (request) => {
    const rows = await request.db.select().from(employees).where(eq(employees.estado, "Activo"));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const childrenOf = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.supervisorId || !byId.has(r.supervisorId)) continue;
      if (!childrenOf.has(r.supervisorId)) childrenOf.set(r.supervisorId, []);
      childrenOf.get(r.supervisorId)!.push(r);
    }

    function buildNode(row: (typeof rows)[number]): OrgNode {
      const kids = (childrenOf.get(row.id) ?? [])
        .slice()
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(buildNode);
      const total = kids.reduce((sum, k) => sum + k.total, 0) + kids.length;
      return {
        id: row.id,
        employeeCode: row.employeeCode,
        nombre: row.nombre,
        puesto: row.puesto,
        departamento: row.departamento,
        pais: row.pais,
        iniciales: row.iniciales,
        avatar: row.avatar,
        children: kids,
        total,
      };
    }

    const roots = rows
      .filter((r) => !r.supervisorId || !byId.has(r.supervisorId))
      .sort((a, b) => a.departamento.localeCompare(b.departamento) || a.nombre.localeCompare(b.nombre))
      .map(buildNode);

    return { roots };
  });
}
