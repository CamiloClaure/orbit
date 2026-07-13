import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { rolePermissions, moduloEnum, accionEnum } from "../db/schema/index.js";

export type Modulo = (typeof moduloEnum.enumValues)[number];
export type Accion = (typeof accionEnum.enumValues)[number];

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.authUser || !request.tenant) {
    return reply.code(401).send({ error: "not authenticated" });
  }
}

// One indexed lookup against role_permissions per call. No caching layer —
// correct and fast enough at this scale; add a cache if profiling says
// otherwise (per-request cost is one PK-ish lookup on a tiny table).
export function requirePermission(modulo: Modulo, accion: Accion) {
  return async function requirePermissionPreHandler(request: FastifyRequest, reply: FastifyReply) {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const [grant] = await request.db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, request.authUser!.roleId),
          eq(rolePermissions.modulo, modulo),
          eq(rolePermissions.accion, accion),
        ),
      )
      .limit(1);

    if (!grant) return reply.code(403).send({ error: "forbidden" });
  };
}
