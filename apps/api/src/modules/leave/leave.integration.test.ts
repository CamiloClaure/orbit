import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import tenantContextPlugin from "../../plugins/tenant-context.js";
import authRoutes from "../auth/routes.js";
import leaveRoutes from "./routes.js";
import { adminDb } from "../../plugins/tenant-context.js";
import { tenants, employees, users, leaveBalances, leaveRequests } from "../../db/schema/index.js";

// Integration test against the real seeded Postgres (docker-compose up,
// `npm run db:seed -w apps/api` already run) — same pattern as Phase 2: our
// own Fastify instance (not server.ts), .inject() over real RLS/RBAC.

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(leaveRoutes);
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

// tenant-context's per-request reserved connection commits in an onResponse
// hook (see plugins/tenant-context.ts) — fastify.inject() can resolve before
// that COMMIT lands, so a write from one inject() call is not guaranteed
// visible to the very next one. Can't touch that plugin, so the test polls
// for read-your-write visibility instead of assuming immediate consistency.
async function waitFor<T>(check: () => Promise<T | undefined | null | false>, tries = 40, delayMs = 25): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const result = await check();
    if (result) return result;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("waitFor: condition never became true");
}

describe("leave/permisos module", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("1. RBAC denial: jefe@nortania.test has no Permisos/Crear -> 403 on create", async () => {
    const cookieHdr = await login(app, "nortania", "jefe@nortania.test");
    const res = await app.inject({
      method: "POST",
      url: "/leave/requests",
      headers: { cookie: cookieHdr },
      payload: { employeeId: "00000000-0000-0000-0000-000000000000", tipo: "Vacaciones", desde: "2026-08-01", hasta: "2026-08-02" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("5. GET /leave/types?pais=BO matches the mockup's leaveRulesByCountry.BO", async () => {
    const cookieHdr = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/leave/types?pais=BO", headers: { cookie: cookieHdr } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { nombre: string; dias: number }[];
    const byName = Object.fromEntries(body.map((r) => [r.nombre, r.dias]));
    expect(byName["Vacaciones"]).toBe(15);
    expect(byName["Permiso personal"]).toBe(3);
    expect(byName["Licencia por cumpleaños"]).toBe(0.5);
    expect(byName["Enfermedad"]).toBe(5);
    expect(byName["Matrimonio"]).toBe(3);
  });

  it("2 & 3. create + approve deducts balance; a second create + reject leaves balance unchanged", async () => {
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);

    // Find the seeded "supervisor" login account, then a real report of
    // theirs (employees.supervisorId), so the approve/reject supervisor-gate
    // is satisfied by an actual org relationship rather than an assumption.
    const [supervisorUser] = await adminDb
      .select({ employeeId: users.employeeId })
      .from(users)
      .where(and(eq(users.tenantId, nortaniaTenant.id), eq(users.email, "supervisor@nortania.test")))
      .limit(1);
    expect(supervisorUser.employeeId).toBeTruthy();

    const [report] = await adminDb
      .select()
      .from(employees)
      .where(and(eq(employees.tenantId, nortaniaTenant.id), eq(employees.supervisorId, supervisorUser.employeeId!)))
      .limit(1);
    expect(report, "seeded supervisor account should supervise at least one employee").toBeTruthy();

    const [existingBalance] = await adminDb
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.tenantId, nortaniaTenant.id), eq(leaveBalances.employeeId, report.id)))
      .limit(1);
    expect(existingBalance, "seeded employee should have at least one leave_balances row").toBeTruthy();
    const tipo = existingBalance.tipo;
    const usadoBefore = Number(existingBalance.usado);

    const creatorCookie = await login(app, "nortania", "empleado@nortania.test"); // has Permisos/Crear
    const supervisorCookie = await login(app, "nortania", "supervisor@nortania.test"); // has Permisos/Aprobar

    // --- approve flow ---
    const createRes = await app.inject({
      method: "POST",
      url: "/leave/requests",
      headers: { cookie: creatorCookie },
      payload: { employeeId: report.id, tipo, desde: "2026-08-03", hasta: "2026-08-04", comentario: "test" },
    });
    expect(createRes.statusCode, createRes.payload).toBe(201);
    const created = createRes.json() as { id: string; dias: number; estado: string };
    expect(created.estado).toBe("Pendiente");
    expect(created.dias).toBe(2); // inclusive day count: Aug 3-4

    // Wait for the create's commit to be visible before approving it —
    // otherwise approve's own SELECT-by-id can 404 on the still-uncommitted row.
    await waitFor(async () => {
      const [row] = await adminDb.select().from(leaveRequests).where(eq(leaveRequests.id, created.id)).limit(1);
      return row;
    });

    const approveRes = await app.inject({
      method: "POST",
      url: `/leave/requests/${created.id}/approve`,
      headers: { cookie: supervisorCookie },
    });
    expect(approveRes.statusCode, approveRes.payload).toBe(200);
    expect(approveRes.json().estado).toBe("Aprobado");

    const balanceAfterApprove = await waitFor(async () => {
      const [row] = await adminDb
        .select()
        .from(leaveBalances)
        .where(and(eq(leaveBalances.employeeId, report.id), eq(leaveBalances.tipo, tipo)))
        .limit(1);
      return Number(row.usado) !== usadoBefore ? row : undefined;
    });
    expect(Number(balanceAfterApprove.usado)).toBeCloseTo(usadoBefore + 2, 5);

    // --- reject flow ---
    const createRes2 = await app.inject({
      method: "POST",
      url: "/leave/requests",
      headers: { cookie: creatorCookie },
      payload: { employeeId: report.id, tipo, desde: "2026-09-10", hasta: "2026-09-11" },
    });
    expect(createRes2.statusCode, createRes2.payload).toBe(201);
    const created2 = createRes2.json() as { id: string };

    await waitFor(async () => {
      const [row] = await adminDb.select().from(leaveRequests).where(eq(leaveRequests.id, created2.id)).limit(1);
      return row;
    });

    const rejectRes = await app.inject({
      method: "POST",
      url: `/leave/requests/${created2.id}/reject`,
      headers: { cookie: supervisorCookie },
    });
    expect(rejectRes.statusCode, rejectRes.payload).toBe(200);
    expect(rejectRes.json().estado).toBe("Rechazado");

    const [balanceAfterReject] = await adminDb
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, report.id), eq(leaveBalances.tipo, tipo)))
      .limit(1);
    expect(Number(balanceAfterReject.usado)).toBeCloseTo(usadoBefore + 2, 5); // unchanged by reject
  });

  it("4. cross-tenant denial: demo's supervisor cannot approve a nortania leave request (404)", async () => {
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);
    const [someRequest] = await adminDb
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, nortaniaTenant.id), eq(leaveRequests.estado, "Pendiente")))
      .limit(1);
    expect(someRequest).toBeTruthy();

    const demoSupervisorCookie = await login(app, "demo", "supervisor@demo.test"); // has Permisos/Aprobar
    const res = await app.inject({
      method: "POST",
      url: `/leave/requests/${someRequest.id}/approve`,
      headers: { cookie: demoSupervisorCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("5. reject: not-the-supervisor (403), missing id (404), already-resolved (409)", async () => {
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);

    // Same reliable supervisor/report pair as test 2&3, not a random pending
    // row — most seeded employees have no login at all, so picking an
    // arbitrary request's supervisor can easily land on one that can't log in.
    const [supervisorUser] = await adminDb
      .select({ employeeId: users.employeeId })
      .from(users)
      .where(and(eq(users.tenantId, nortaniaTenant.id), eq(users.email, "supervisor@nortania.test")))
      .limit(1);
    const [report] = await adminDb
      .select()
      .from(employees)
      .where(and(eq(employees.tenantId, nortaniaTenant.id), eq(employees.supervisorId, supervisorUser.employeeId!)))
      .limit(1);
    const [balance] = await adminDb
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.tenantId, nortaniaTenant.id), eq(leaveBalances.employeeId, report.id)))
      .limit(1);

    const creatorCookie = await login(app, "nortania", "empleado@nortania.test");
    const createRes = await app.inject({
      method: "POST",
      url: "/leave/requests",
      headers: { cookie: creatorCookie },
      payload: { employeeId: report.id, tipo: balance.tipo, desde: "2026-09-01", hasta: "2026-09-01", comentario: null },
    });
    expect(createRes.statusCode, createRes.payload).toBe(201);
    const created = createRes.json() as { id: string };
    await waitFor(async () => {
      const [row] = await adminDb.select().from(leaveRequests).where(eq(leaveRequests.id, created.id)).limit(1);
      return row;
    });

    // analista has Permisos/Aprobar but isn't this employee's supervisor.
    const analistaCookie = await login(app, "nortania", "analista@nortania.test");
    const notSupervisor = await app.inject({
      method: "POST",
      url: `/leave/requests/${created.id}/reject`,
      headers: { cookie: analistaCookie },
    });
    expect(notSupervisor.statusCode).toBe(403);

    const missingId = "00000000-0000-0000-0000-000000000000";
    const notFound = await app.inject({
      method: "POST",
      url: `/leave/requests/${missingId}/reject`,
      headers: { cookie: analistaCookie },
    });
    expect(notFound.statusCode).toBe(404);

    const supervisorCookie = await login(app, "nortania", "supervisor@nortania.test");
    const rejected = await app.inject({
      method: "POST",
      url: `/leave/requests/${created.id}/reject`,
      headers: { cookie: supervisorCookie },
    });
    expect(rejected.statusCode, rejected.payload).toBe(200);

    const alreadyResolved = await app.inject({
      method: "POST",
      url: `/leave/requests/${created.id}/reject`,
      headers: { cookie: supervisorCookie },
    });
    expect(alreadyResolved.statusCode).toBe(409);
  });

  it("smoke: GET /leave/balances defaults to the caller's own employeeId", async () => {
    const cookieHdr = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/leave/balances", headers: { cookie: cookieHdr } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { employeeId: string }[];
    expect(body.length).toBeGreaterThan(0);
  });
});
