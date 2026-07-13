import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { buildApp } from "../../server.js";
import { tenants, employees } from "../../db/schema/index.js";
import { adminDb } from "../../plugins/tenant-context.js";

// Integration test against the real seeded Postgres (docker-compose up,
// `npm run db:seed -w apps/api` already run) — no mocks. Uses Fastify's
// .inject() so there's no real network port, but every query goes through
// the actual tenant-context hook, RLS, and RBAC/field-filter code.

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  if (!header) throw new Error("no set-cookie header in response");
  return header.split(";")[0]; // "sid=<uuid>"
}

async function login(app: ReturnType<typeof buildApp>, tenant: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { tenant, email, password: PASSWORD },
  });
  expect(res.statusCode, `login as ${email} should 200 (${res.payload})`).toBe(200);
  return cookieFrom(res);
}

describe("auth + RBAC + tenant context (Phase 2)", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("1. empleado@nortania.test logs in, then is denied Nómina/Ver (403)", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/payroll", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("2. nomina@nortania.test sees the salario field on employees", async () => {
    const cookie = await login(app, "nortania", "nomina@nortania.test");
    const res = await app.inject({ method: "GET", url: "/employees", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Record<string, unknown>[] };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty("salario");
  });

  it("3. analista@nortania.test does NOT see the salario field on employees", async () => {
    const cookie = await login(app, "nortania", "analista@nortania.test");
    const res = await app.inject({ method: "GET", url: "/employees", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Record<string, unknown>[] };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).not.toHaveProperty("salario");
  });

  it("4. demo tenant's empleado cannot see a nortania employee by id (404, not 403)", async () => {
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);
    const [someNortaniaEmployee] = await adminDb
      .select()
      .from(employees)
      .where(eq(employees.tenantId, nortaniaTenant.id))
      .limit(1);

    const cookie = await login(app, "demo", "empleado@demo.test");
    const res = await app.inject({
      method: "GET",
      url: `/employees/${someNortaniaEmployee.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("5. /auth/me reflects the logged-in user/tenant/role, and 401s after logout", async () => {
    const cookie = await login(app, "nortania", "supervisor@nortania.test");

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const meBody = me.json();
    expect(meBody.user.email).toBe("supervisor@nortania.test");
    expect(meBody.user.roleKey).toBe("supervisor");
    expect(meBody.tenant.slug).toBe("nortania");

    const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
    expect(logout.statusCode).toBe(200);

    const meAfter = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(meAfter.statusCode).toBe(401);
  });

  it("sanity: wrong password is rejected with a generic message", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenant: "nortania", email: "empleado@nortania.test", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("sanity: unknown tenant slug is rejected the same way", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenant: "nope", email: "empleado@nortania.test", password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });
});
