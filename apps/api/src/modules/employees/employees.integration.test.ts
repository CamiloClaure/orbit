import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import tenantContextPlugin from "../../plugins/tenant-context.js";
import authRoutes from "../auth/routes.js";
import employeesRoutes from "./routes.js";
import { tenants, employees } from "../../db/schema/index.js";
import { adminDb } from "../../plugins/tenant-context.js";

// Own Fastify instance per the Phase 3 spec — no import from server.ts (not
// allowed to touch it, and it only wires up the auth-only route set).
function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(employeesRoutes);
  return app;
}

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

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

function newEmployeePayload(suffix: string) {
  return {
    employeeCode: `ZZ-TEST-${suffix}`,
    nombre: "Test Testerson",
    puesto: "QA Analyst",
    departamento: "Tecnología",
    centroCosto: "BO-TI-DEV",
    sede: "Bolivia · Santa Cruz",
    pais: "BO" as const,
    ciudad: "Santa Cruz",
    supervisorId: null,
    estado: "Activo" as const,
    email: `test.testerson.${suffix}@nortania.com`,
    telefono: "+591 70000000",
    ingreso: "2026-01-01",
    cumple: "01-01",
    salario: 1500,
    iniciales: "TT",
    avatar: "linear-gradient(135deg,#000,#fff)",
    userId: null,
  };
}

describe("employees routes (Phase 3)", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("1. empleado@nortania.test (no Empleados/Crear grant) gets 403 on POST /employees", async () => {
    const cookieHeader = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({
      method: "POST",
      url: "/employees",
      headers: { cookie: cookieHeader },
      payload: newEmployeePayload("rbac-denial"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("2. nomina@nortania.test sees salario on GET /employees; analista@nortania.test does not", async () => {
    const nominaCookie = await login(app, "nortania", "nomina@nortania.test");
    const withSalario = await app.inject({ method: "GET", url: "/employees?pageSize=5", headers: { cookie: nominaCookie } });
    expect(withSalario.statusCode).toBe(200);
    const withSalarioBody = withSalario.json() as { data: Record<string, unknown>[] };
    expect(withSalarioBody.data.length).toBeGreaterThan(0);
    expect(withSalarioBody.data[0]).toHaveProperty("salario");
    expect(typeof withSalarioBody.data[0].salario).toBe("number");

    const analistaCookie = await login(app, "nortania", "analista@nortania.test");
    const withoutSalario = await app.inject({ method: "GET", url: "/employees?pageSize=5", headers: { cookie: analistaCookie } });
    expect(withoutSalario.statusCode).toBe(200);
    const withoutSalarioBody = withoutSalario.json() as { data: Record<string, unknown>[] };
    expect(withoutSalarioBody.data.length).toBeGreaterThan(0);
    expect(withoutSalarioBody.data[0]).not.toHaveProperty("salario");
  });

  it("3. demo tenant's empleado cannot see a nortania employee by id (404)", async () => {
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);
    const [someNortaniaEmployee] = await adminDb
      .select()
      .from(employees)
      .where(eq(employees.tenantId, nortaniaTenant.id))
      .limit(1);

    const cookieHeader = await login(app, "demo", "empleado@demo.test");
    const res = await app.inject({
      method: "GET",
      url: `/employees/${someNortaniaEmployee.id}`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(404);
  });

  it("4. filter + sort + pagination shape", async () => {
    const cookieHeader = await login(app, "nortania", "analista@nortania.test");
    const res = await app.inject({
      method: "GET",
      url: "/employees?departamento=Tecnología&sortBy=nombre&sortDir=asc&page=1&pageSize=10",
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { departamento: string; nombre: string }[]; total: number; page: number; pageSize: number };
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.length).toBeLessThanOrEqual(10);
    for (const row of body.data) expect(row.departamento).toBe("Tecnología");
    const names = body.data.map((r) => r.nombre);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("5. POST /employees then GET reflects it; PATCH then re-fetch reflects the change", async () => {
    const cookieHeader = await login(app, "nortania", "analista@nortania.test"); // has Empleados: Crear + Editar

    const createRes = await app.inject({
      method: "POST",
      url: "/employees",
      headers: { cookie: cookieHeader },
      payload: newEmployeePayload(`roundtrip-${Date.now()}`),
    });
    expect(createRes.statusCode, createRes.payload).toBe(201);
    const created = createRes.json() as { id: string; nombre: string };
    expect(created.nombre).toBe("Test Testerson");

    const getRes = await app.inject({ method: "GET", url: `/employees/${created.id}`, headers: { cookie: cookieHeader } });
    expect(getRes.statusCode).toBe(200);
    expect((getRes.json() as { nombre: string }).nombre).toBe("Test Testerson");

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/employees/${created.id}`,
      headers: { cookie: cookieHeader },
      payload: { puesto: "Senior QA Analyst" },
    });
    expect(patchRes.statusCode, patchRes.payload).toBe(200);
    expect((patchRes.json() as { puesto: string }).puesto).toBe("Senior QA Analyst");

    const refetchRes = await app.inject({ method: "GET", url: `/employees/${created.id}`, headers: { cookie: cookieHeader } });
    expect((refetchRes.json() as { puesto: string }).puesto).toBe("Senior QA Analyst");
  });

  it("6. malformed id (404), invalid POST/PATCH body (400), empty PATCH (400), PATCH of a nonexistent id (404)", async () => {
    const cookieHeader = await login(app, "nortania", "analista@nortania.test");

    const badId = await app.inject({ method: "GET", url: "/employees/not-a-uuid", headers: { cookie: cookieHeader } });
    expect(badId.statusCode).toBe(404);

    const badPost = await app.inject({ method: "POST", url: "/employees", headers: { cookie: cookieHeader }, payload: { nombre: "" } });
    expect(badPost.statusCode).toBe(400);

    const badPatchId = await app.inject({ method: "PATCH", url: "/employees/not-a-uuid", headers: { cookie: cookieHeader }, payload: { puesto: "X" } });
    expect(badPatchId.statusCode).toBe(404);

    const [anyEmployee] = await adminDb.select().from(employees).limit(1);
    const badPatchBody = await app.inject({
      method: "PATCH",
      url: `/employees/${anyEmployee.id}`,
      headers: { cookie: cookieHeader },
      payload: { pais: "ZZ" },
    });
    expect(badPatchBody.statusCode).toBe(400);

    const emptyPatch = await app.inject({
      method: "PATCH",
      url: `/employees/${anyEmployee.id}`,
      headers: { cookie: cookieHeader },
      payload: {},
    });
    expect(emptyPatch.statusCode).toBe(400);

    const missingId = "00000000-0000-0000-0000-000000000000";
    const patchMissing = await app.inject({
      method: "PATCH",
      url: `/employees/${missingId}`,
      headers: { cookie: cookieHeader },
      payload: { puesto: "X" },
    });
    expect(patchMissing.statusCode).toBe(404);
  });
});
