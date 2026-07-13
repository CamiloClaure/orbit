import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { recognitionInputSchema, denunciaInputSchema } from "@orbit/shared";
import { recognitions, denuncias, employees } from "../../db/schema/index.js";
import { requireAuth, requirePermission } from "../../plugins/rbac.js";

// Module-name resolution (checked against the mockup's src/data/roles.ts):
// there is no dedicated "Voz" module in the mock's matrix — recognitions and
// denuncias are both filed under "Encuestas". The mock's separate
// `fieldPermissions` list gates "Denuncias anónimas" (modulo Encuestas) to
// roles ['analista', 'global'] specifically — narrower than plain
// Encuestas/Ver (which empleado and supervisor also hold). The accion-level
// grant that maps to exactly {analista, global} in the matrix is
// Encuestas/Editar (empleado & supervisor only have Ver; jefe/nomina have no
// Encuestas grant at all), so GET /voz/denuncias is gated on that rather than
// inventing a new accion the product doesn't have.
export default async function vozRoutes(app: FastifyInstance) {
  app.get("/voz/recognitions", { preHandler: requirePermission("Encuestas", "Ver") }, async (request) => {
    return request.db.select().from(recognitions);
  });

  // Any authenticated employee can recognize a peer — the matrix has no
  // distinct "create a recognition" grant (Encuestas/Crear is analista+global
  // only, which would wrongly block regular employees from recognizing
  // anyone), so this only requires being logged in.
  app.post("/voz/recognitions", { preHandler: requireAuth }, async (request, reply) => {
    const deEmployeeId = request.authUser!.employeeId;
    if (!deEmployeeId) return reply.code(400).send({ error: "user has no linked employee record" });

    const parsed = recognitionInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });

    const [target] = await request.db
      .select()
      .from(employees)
      .where(eq(employees.id, parsed.data.paraEmployeeId))
      .limit(1);
    if (!target) return reply.code(404).send({ error: "not found" });

    const [row] = await request.db
      .insert(recognitions)
      .values({ ...parsed.data, deEmployeeId, tenantId: request.tenant!.id })
      .returning();
    return reply.code(201).send(row);
  });

  // Restricted read — see module comment above.
  app.get("/voz/denuncias", { preHandler: requirePermission("Encuestas", "Editar") }, async (request) => {
    return request.db.select().from(denuncias);
  });

  // Anonymous by design: requireAuth only (any employee can report), and the
  // input schema (packages/shared) structurally has no author/reporter
  // field — not tipo/titulo/pais plus a forced anonimo:true, nothing else.
  // Never add an employeeId/userId/reportedBy field here, in the schema, or
  // in any log line — that would defeat the anonymity invariant.
  app.post("/voz/denuncias", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = denunciaInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });

    const fecha = new Date().toISOString().slice(0, 10);
    const [row] = await request.db
      .insert(denuncias)
      .values({ ...parsed.data, estado: "Nueva", fecha, tenantId: request.tenant!.id })
      .returning();
    return reply.code(201).send(row);
  });
}
