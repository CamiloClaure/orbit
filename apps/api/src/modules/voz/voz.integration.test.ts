import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { eq } from "drizzle-orm";
import tenantContextPlugin, { adminDb } from "../../plugins/tenant-context.js";
import { tenants, employees } from "../../db/schema/index.js";
import authRoutes from "../auth/routes.js";
import vozRoutes from "./routes.js";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(vozRoutes);
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

const NO_AUTHOR_FIELDS = ["employeeId", "userId", "reportedBy", "reporterId", "de", "author"];

describe("voz routes (recognitions + denuncias)", () => {
  const app = buildTestApp();
  let nortaniaEmployeeId: string;

  beforeAll(async () => {
    await app.ready();
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);
    const [someEmployee] = await adminDb.select().from(employees).where(eq(employees.tenantId, nortaniaTenant.id)).limit(1);
    nortaniaEmployeeId = someEmployee.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("any authenticated employee can post a recognition (requireAuth only, no dedicated grant)", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({
      method: "POST",
      url: "/voz/recognitions",
      headers: { cookie },
      payload: { paraEmployeeId: nortaniaEmployeeId, mensaje: "Gran trabajo en el cierre de mes.", estrellas: 5 },
    });
    expect(res.statusCode, res.payload).toBe(201);
    expect(res.json().paraEmployeeId).toBe(nortaniaEmployeeId);
  });

  it("recognition: invalid body (400) and target employee not found (404); denuncia: invalid body (400)", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");

    const badBody = await app.inject({
      method: "POST",
      url: "/voz/recognitions",
      headers: { cookie },
      payload: { paraEmployeeId: nortaniaEmployeeId, mensaje: "", estrellas: 5 },
    });
    expect(badBody.statusCode).toBe(400);

    const missingTarget = await app.inject({
      method: "POST",
      url: "/voz/recognitions",
      headers: { cookie },
      payload: { paraEmployeeId: "00000000-0000-0000-0000-000000000000", mensaje: "Hola", estrellas: 5 },
    });
    expect(missingTarget.statusCode).toBe(404);

    const badDenuncia = await app.inject({
      method: "POST",
      url: "/voz/denuncias",
      headers: { cookie },
      payload: { tipo: "Sugerencia", titulo: "", pais: "BO", anonimo: true },
    });
    expect(badDenuncia.statusCode).toBe(400);
  });

  it("empleado (Encuestas/Ver) can list recognitions; jefe (no Encuestas grant) is denied", async () => {
    const empCookie = await login(app, "nortania", "empleado@nortania.test");
    const okRes = await app.inject({ method: "GET", url: "/voz/recognitions", headers: { cookie: empCookie } });
    expect(okRes.statusCode).toBe(200);

    const jefeCookie = await login(app, "nortania", "jefe@nortania.test");
    const deniedRes = await app.inject({ method: "GET", url: "/voz/recognitions", headers: { cookie: jefeCookie } });
    expect(deniedRes.statusCode).toBe(403);
  });

  it("denuncia anonymity: POST as any user, then GET as analista/global carries no identifying field", async () => {
    const posterCookie = await login(app, "nortania", "supervisor@nortania.test");
    const postRes = await app.inject({
      method: "POST",
      url: "/voz/denuncias",
      headers: { cookie: posterCookie },
      payload: { tipo: "Conflicto laboral", titulo: "Reporte de prueba anónimo", pais: "BO" },
    });
    expect(postRes.statusCode, postRes.payload).toBe(201);
    const posted = postRes.json();
    for (const field of NO_AUTHOR_FIELDS) expect(posted).not.toHaveProperty(field);
    expect(posted.anonimo).toBe(true);

    const analistaCookie = await login(app, "nortania", "analista@nortania.test");
    const listRes = await app.inject({ method: "GET", url: "/voz/denuncias", headers: { cookie: analistaCookie } });
    expect(listRes.statusCode).toBe(200);
    const rows = listRes.json() as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const field of NO_AUTHOR_FIELDS) expect(row).not.toHaveProperty(field);
    }

    const globalCookie = await login(app, "nortania", "global@nortania.test");
    const globalListRes = await app.inject({ method: "GET", url: "/voz/denuncias", headers: { cookie: globalCookie } });
    expect(globalListRes.statusCode).toBe(200);
  });

  it("denuncias restricted read: empleado is denied (403) even though empleado can post one", async () => {
    const empCookie = await login(app, "nortania", "empleado@nortania.test");

    const postRes = await app.inject({
      method: "POST",
      url: "/voz/denuncias",
      headers: { cookie: empCookie },
      payload: { tipo: "Sugerencia", titulo: "Otra prueba", pais: "CL" },
    });
    expect(postRes.statusCode).toBe(201);

    const getRes = await app.inject({ method: "GET", url: "/voz/denuncias", headers: { cookie: empCookie } });
    expect(getRes.statusCode).toBe(403);
  });
});
