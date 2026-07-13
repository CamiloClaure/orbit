import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { leaveTypes, leaveRequests, leaveBalances, employees } from "../../db/schema/index.js";
import { requirePermission } from "../../plugins/rbac.js";
import { countrySchema, leaveStatusSchema, leaveRequestInputSchema } from "@orbit/shared";

// Local-only schemas (not promoted to @orbit/shared): query-string shapes and
// a create-body variant. Flagged in the phase report — `leaveRequestInputSchema`
// in @orbit/shared includes a client-supplied `dias`, which we never trust
// (server computes it from desde/hasta), so we omit it here rather than edit
// the shared package.
const leaveTypesQuerySchema = z.object({ pais: countrySchema });
const balancesQuerySchema = z.object({ employeeId: z.string().uuid().optional() });
const listRequestsQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  estado: leaveStatusSchema.optional(),
});
// Also relaxes comentario/adjunto from nullable-but-required to optional —
// a client creating a request has no reason to send `"adjunto": null`
// explicitly just to satisfy the shared schema.
const createLeaveRequestBodySchema = leaveRequestInputSchema.omit({ dias: true }).extend({
  comentario: z.string().nullable().optional(),
  adjunto: z.string().nullable().optional(),
});

// Numeric columns come back from postgres-js/drizzle as strings — convert
// for a client-friendly JSON shape (matches @orbit/shared's number-typed schemas).
function mapRequest(row: typeof leaveRequests.$inferSelect) {
  return { ...row, dias: Number(row.dias), saldo: Number(row.saldo) };
}

function mapBalance(row: typeof leaveBalances.$inferSelect) {
  return { ...row, total: Number(row.total), usado: Number(row.usado) };
}

// Inclusive whole-day count — a single-day request (desde === hasta) is 1 day.
// Stdlib Date arithmetic only, no date library (none installed, none needed
// for whole-day differences on plain YYYY-MM-DD strings).
function diasBetween(desde: string, hasta: string): number {
  const d1 = new Date(desde);
  const d2 = new Date(hasta);
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1;
}

export default async function leaveRoutes(app: FastifyInstance) {
  app.get("/leave/types", { preHandler: requirePermission("Permisos", "Ver") }, async (request, reply) => {
    const parsed = leaveTypesQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });

    const rows = await request.db.select().from(leaveTypes).where(eq(leaveTypes.pais, parsed.data.pais));
    return rows.map((r) => ({ ...r, dias: Number(r.dias) }));
  });

  app.get("/leave/balances", { preHandler: requirePermission("Permisos", "Ver") }, async (request, reply) => {
    const parsed = balancesQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });

    const employeeId = parsed.data.employeeId ?? request.authUser!.employeeId;
    if (!employeeId) return reply.code(400).send({ error: "employeeId required" });

    const rows = await request.db.select().from(leaveBalances).where(eq(leaveBalances.employeeId, employeeId));
    return rows.map(mapBalance);
  });

  app.get("/leave/requests", { preHandler: requirePermission("Permisos", "Ver") }, async (request, reply) => {
    const parsed = listRequestsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });

    const conditions = [
      parsed.data.employeeId ? eq(leaveRequests.employeeId, parsed.data.employeeId) : undefined,
      parsed.data.estado ? eq(leaveRequests.estado, parsed.data.estado) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    const rows = await request.db
      .select()
      .from(leaveRequests)
      .where(conditions.length ? and(...conditions) : undefined);
    return rows.map(mapRequest);
  });

  app.post("/leave/requests", { preHandler: requirePermission("Permisos", "Crear") }, async (request, reply) => {
    const parsed = createLeaveRequestBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });
    const { employeeId, tipo, desde, hasta, comentario, adjunto } = parsed.data;

    if (Number.isNaN(new Date(desde).getTime()) || Number.isNaN(new Date(hasta).getTime())) {
      return reply.code(400).send({ error: "invalid desde/hasta date" });
    }
    if (hasta < desde) return reply.code(400).send({ error: "hasta must be >= desde" });

    const dias = diasBetween(desde, hasta);

    // Projected remaining balance for this leave type after this request (the
    // mock's `saldo` field on LeaveRequest). Missing balance row -> treat as 0/0
    // rather than reject; balance sufficiency isn't a requirement here.
    const [balance] = await request.db
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.tipo, tipo)))
      .limit(1);
    const total = balance ? Number(balance.total) : 0;
    const usado = balance ? Number(balance.usado) : 0;
    const saldo = total - usado - dias;

    const [row] = await request.db
      .insert(leaveRequests)
      .values({
        tenantId: request.tenant!.id,
        employeeId,
        tipo,
        desde,
        hasta,
        dias: String(dias),
        saldo: String(saldo),
        estado: "Pendiente",
        comentario: comentario ?? null,
        adjunto: adjunto ?? null,
      })
      .returning();

    return reply.code(201).send(mapRequest(row));
  });

  // Approve/reject share the same lookup + supervisor-gate; the request-scoped
  // transaction (BEGIN in tenant-context's onRequest, COMMIT in onResponse)
  // already makes the balance update + status update atomic — no separate
  // transaction wrapper needed here.
  app.post(
    "/leave/requests/:id/approve",
    { preHandler: requirePermission("Permisos", "Aprobar") },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [reqRow] = await request.db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
      if (!reqRow) return reply.code(404).send({ error: "not found" });
      if (reqRow.estado !== "Pendiente") return reply.code(409).send({ error: "already resolved" });

      const [employee] = await request.db.select().from(employees).where(eq(employees.id, reqRow.employeeId)).limit(1);
      if (!employee || employee.supervisorId !== request.authUser!.employeeId) {
        return reply.code(403).send({ error: "not the employee's supervisor" });
      }

      await request.db
        .update(leaveBalances)
        .set({ usado: sql`${leaveBalances.usado} + ${Number(reqRow.dias)}` })
        .where(and(eq(leaveBalances.employeeId, reqRow.employeeId), eq(leaveBalances.tipo, reqRow.tipo)));

      const [updated] = await request.db
        .update(leaveRequests)
        .set({ estado: "Aprobado" })
        .where(eq(leaveRequests.id, id))
        .returning();

      return mapRequest(updated);
    },
  );

  app.post(
    "/leave/requests/:id/reject",
    { preHandler: requirePermission("Permisos", "Aprobar") },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [reqRow] = await request.db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
      if (!reqRow) return reply.code(404).send({ error: "not found" });
      if (reqRow.estado !== "Pendiente") return reply.code(409).send({ error: "already resolved" });

      const [employee] = await request.db.select().from(employees).where(eq(employees.id, reqRow.employeeId)).limit(1);
      if (!employee || employee.supervisorId !== request.authUser!.employeeId) {
        return reply.code(403).send({ error: "not the employee's supervisor" });
      }

      const [updated] = await request.db
        .update(leaveRequests)
        .set({ estado: "Rechazado" })
        .where(eq(leaveRequests.id, id))
        .returning();

      return mapRequest(updated);
    },
  );
}
