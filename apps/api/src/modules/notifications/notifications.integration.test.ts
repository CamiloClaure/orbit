import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { and, eq } from "drizzle-orm";
import tenantContextPlugin, { adminDb } from "../../plugins/tenant-context.js";
import { tenants, users, notifications } from "../../db/schema/index.js";
import authRoutes from "../auth/routes.js";
import notificationsRoutes from "./routes.js";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(notificationsRoutes);
  return app;
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  if (!header) throw new Error("no set-cookie header in response");
  return header.split(";")[0];
}

async function login(app: ReturnType<typeof buildTestApp>, tenant: string, email: string) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { tenant, email, password: PASSWORD } });
  expect(res.statusCode, `login as ${email} should 200 (${res.payload})`).toBe(200);
  return cookieFrom(res);
}

describe("notifications routes", () => {
  const app = buildTestApp();
  let tenantId: string;
  let userAId: string;
  let userBId: string;
  let notifAId: string;
  let notifBId: string;

  beforeAll(async () => {
    await app.ready();
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);
    tenantId = nortaniaTenant.id;
    const [userA] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, "empleado@nortania.test")))
      .limit(1);
    const [userB] = await adminDb
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, "supervisor@nortania.test")))
      .limit(1);
    userAId = userA.id;
    userBId = userB.id;

    // No create-notification endpoint this phase (nothing dispatches
    // notifications yet) — seed rows directly via the admin connection, the
    // same way the seed script writes tenant-owned data.
    const [notifA] = await adminDb
      .insert(notifications)
      .values({ tenantId, userId: userAId, kind: "sistema", titulo: "Notif A", detalle: "para userA", unread: true })
      .returning();
    const [notifB] = await adminDb
      .insert(notifications)
      .values({ tenantId, userId: userBId, kind: "sistema", titulo: "Notif B", detalle: "para userB", unread: true })
      .returning();
    notifAId = notifA.id;
    notifBId = notifB.id;
  });

  afterAll(async () => {
    await adminDb.delete(notifications).where(eq(notifications.id, notifAId));
    await adminDb.delete(notifications).where(eq(notifications.id, notifBId));
    await app.close();
  });

  it("GET /notifications for user A never includes user B's rows", async () => {
    const cookieA = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/notifications", headers: { cookie: cookieA } });
    expect(res.statusCode).toBe(200);
    const ids: string[] = res.json().map((n: { id: string }) => n.id);
    expect(ids).toContain(notifAId);
    expect(ids).not.toContain(notifBId);
  });

  it("user A cannot mark user B's notification as read (404)", async () => {
    const cookieA = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "POST", url: `/notifications/${notifBId}/read`, headers: { cookie: cookieA } });
    expect(res.statusCode).toBe(404);

    // Prove it's genuinely untouched, not just hidden.
    const [row] = await adminDb.select().from(notifications).where(eq(notifications.id, notifBId)).limit(1);
    expect(row.unread).toBe(true);
  });

  it("user A can mark their own notification as read", async () => {
    const cookieA = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "POST", url: `/notifications/${notifAId}/read`, headers: { cookie: cookieA } });
    expect(res.statusCode, res.payload).toBe(200);
    expect(res.json().unread).toBe(false);
  });
});
