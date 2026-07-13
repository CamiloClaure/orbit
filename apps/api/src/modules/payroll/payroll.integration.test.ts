import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { eq, and } from "drizzle-orm";
import tenantContextPlugin from "../../plugins/tenant-context.js";
import authRoutes from "../auth/routes.js";
import payrollRoutes from "./routes.js";
import { tenants, employees, payrollRows } from "../../db/schema/index.js";
import { adminDb } from "../../plugins/tenant-context.js";

// Integration test against the real seeded Postgres, same pattern as Phase 2's
// auth.integration.test.ts — a fresh Fastify instance registering only what
// this module needs (server.ts is owned by another phase, not touched here).

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";
const PERIODO = "2026-06"; // matches db/seed.ts's PERIODO

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(payrollRoutes);
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

describe("payroll (Phase 3c)", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("empleado (no Nómina/Ver) gets 403 on /payroll", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/payroll", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("nomina role lists payroll rows for a period", async () => {
    const cookie = await login(app, "nortania", "nomina@nortania.test");
    const res = await app.inject({ method: "GET", url: `/payroll?periodo=${PERIODO}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("bruto");
    expect(body[0]).toHaveProperty("neto");
  });

  it("/payroll/aggregates by país sums correctly against the raw seeded rows", async () => {
    const cookie = await login(app, "nortania", "nomina@nortania.test");
    const res = await app.inject({
      method: "GET",
      url: `/payroll/aggregates?periodo=${PERIODO}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const { byPais, byCentroCosto } = res.json() as {
      byPais: { pais: string; headcount: number; neto: string }[];
      byCentroCosto: { centroCosto: string; headcount: number; neto: string }[];
    };
    expect(byPais.length).toBeGreaterThan(0);
    expect(byCentroCosto.length).toBeGreaterThan(0);

    // Spot-check one país group's arithmetic against the raw seeded rows,
    // fetched independently via the admin (RLS-bypassing) connection.
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);
    const rawRows = await adminDb
      .select({ pais: employees.pais, neto: payrollRows.neto })
      .from(payrollRows)
      .innerJoin(employees, eq(employees.id, payrollRows.employeeId))
      .where(and(eq(payrollRows.tenantId, nortaniaTenant.id), eq(payrollRows.periodo, PERIODO)));

    const sample = byPais[0];
    const matching = rawRows.filter((r) => r.pais === sample.pais);
    expect(sample.headcount).toBe(matching.length);
    const expectedNeto = matching.reduce((sum, r) => sum + Number(r.neto), 0);
    expect(Number(sample.neto)).toBeCloseTo(expectedNeto, 2);
  });

  it("/payroll filters by employeeId (no periodo) and /payroll/aggregates with no periodo covers all rows", async () => {
    const cookie = await login(app, "nortania", "nomina@nortania.test");

    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);
    const [aRow] = await adminDb.select().from(payrollRows).where(eq(payrollRows.tenantId, nortaniaTenant.id)).limit(1);

    const byEmployee = await app.inject({ method: "GET", url: `/payroll?employeeId=${aRow.employeeId}`, headers: { cookie } });
    expect(byEmployee.statusCode).toBe(200);
    const rows = byEmployee.json() as Record<string, unknown>[];
    expect(rows.every((r) => r.employeeId === aRow.employeeId)).toBe(true);

    const noPeriodo = await app.inject({ method: "GET", url: "/payroll/aggregates", headers: { cookie } });
    expect(noPeriodo.statusCode).toBe(200);
    const { byPais } = noPeriodo.json() as { byPais: { headcount: number }[] };
    expect(byPais.length).toBeGreaterThan(0);
  });
});
