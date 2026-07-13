import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { tenants, users, sessions } from "../../db/schema/index.js";
import { adminDb, SESSION_COOKIE } from "../../plugins/tenant-context.js";
import { requireAuth } from "../../plugins/rbac.js";
import { loginRequestSchema } from "@orbit/shared";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });
    const { tenant, email, password } = parsed.data;

    const [tenantRow] = await adminDb.select().from(tenants).where(eq(tenants.slug, tenant)).limit(1);
    // Same generic message whether tenant, email, or password is wrong — never
    // reveal which part of the triple failed.
    const fail = () => reply.code(401).send({ error: "invalid credentials" });
    if (!tenantRow) return fail();

    const [userRow] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantRow.id), eq(users.email, email)))
      .limit(1);
    if (!userRow) return fail();

    const ok = await argon2.verify(userRow.passwordHash, password);
    if (!ok) return fail();

    const [session] = await adminDb
      .insert(sessions)
      .values({ tenantId: tenantRow.id, userId: userRow.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .returning();

    reply.setCookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return { ok: true };
  });

  app.post("/auth/logout", async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId) await adminDb.delete(sessions).where(eq(sessions.id, sessionId));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (request) => {
    return {
      user: { id: request.authUser!.id, email: request.authUser!.email, roleKey: request.authUser!.roleKey, employeeId: request.authUser!.employeeId },
      tenant: request.tenant!,
    };
  });
}
