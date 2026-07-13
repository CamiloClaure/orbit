import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { eq, and } from "drizzle-orm";
import tenantContextPlugin from "../../plugins/tenant-context.js";
import authRoutes from "../auth/routes.js";
import dashboardRoutes from "./routes.js";
import { tenants, employees } from "../../db/schema/index.js";
import { adminDb } from "../../plugins/tenant-context.js";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(dashboardRoutes);
  return app;
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  if (!header) throw new Error("no set-cookie header in response");
  return header.split(";")[0];
}

async function login(app: ReturnType<typeof buildTestApp>, tenant: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { tenant, email, password: PASSWORD },
  });
  expect(res.statusCode, `login as ${email} should 200 (${res.payload})`).toBe(200);
  return cookieFrom(res);
}

async function activeCountFor(tenantSlug: string): Promise<number> {
  const [tenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
  const rows = await adminDb
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, tenant.id), eq(employees.estado, "Activo")));
  return rows.length;
}

describe("dashboard (Phase 3c)", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("nortania headcount matches the real seeded active-employee count", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/dashboard", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.headcount).toBe(await activeCountFor("nortania"));
  });

  it("demo tenant's dashboard headcount reflects ONLY demo's employees, never nortania's", async () => {
    const cookie = await login(app, "demo", "empleado@demo.test");
    const res = await app.inject({ method: "GET", url: "/dashboard", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const demoActive = await activeCountFor("demo");
    expect(body.headcount).toBe(demoActive);
    expect(body.headcount).toBeLessThan(50); // nowhere near nortania's 312-employee scale
  });

  it("payroll section is omitted (null) for a role without Nómina/Ver", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/dashboard", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().payroll).toBeNull();
  });

  it("payroll section is present with real totals for the nomina role", async () => {
    const cookie = await login(app, "nortania", "nomina@nortania.test");
    const res = await app.inject({ method: "GET", url: "/dashboard", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { payroll } = res.json();
    expect(payroll).not.toBeNull();
    expect(Number(payroll.neto)).toBeGreaterThan(0);
  });

  it("returns dept distribution, headcount trend, and top-reconocidos shapes", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/dashboard", headers: { cookie } });
    const body = res.json();
    expect(Array.isArray(body.deptDistribution)).toBe(true);
    expect(body.deptDistribution.length).toBeGreaterThan(0);
    expect(body.deptDistribution[0]).toHaveProperty("departamento");
    expect(Array.isArray(body.headcountTrend)).toBe(true);
    expect(Array.isArray(body.topReconocidos)).toBe(true); // may legitimately be empty
  });
});
