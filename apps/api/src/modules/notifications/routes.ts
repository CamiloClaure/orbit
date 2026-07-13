import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { notifications } from "../../db/schema/index.js";
import { requireAuth } from "../../plugins/rbac.js";

// No permission gate — everyone sees (and only sees) their own notifications.
// Nothing here sends new notifications (out of scope this phase); RLS scopes
// by tenant, the userId filter below scopes by owner within that tenant.
export default async function notificationsRoutes(app: FastifyInstance) {
  app.get("/notifications", { preHandler: requireAuth }, async (request) => {
    return request.db.select().from(notifications).where(eq(notifications.userId, request.authUser!.id));
  });

  app.post("/notifications/:id/read", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [updated] = await request.db
      .update(notifications)
      .set({ unread: false })
      .where(and(eq(notifications.id, id), eq(notifications.userId, request.authUser!.id)))
      .returning();
    // Belongs to someone else (or doesn't exist): invisible, not forbidden —
    // same pattern as cross-tenant 404s elsewhere in this codebase.
    if (!updated) return reply.code(404).send({ error: "not found" });
    return updated;
  });
}
