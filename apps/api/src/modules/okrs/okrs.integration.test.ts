import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { eq } from "drizzle-orm";
import tenantContextPlugin, { adminDb } from "../../plugins/tenant-context.js";
import { tenants, objectives } from "../../db/schema/index.js";
import authRoutes from "../auth/routes.js";
import okrsRoutes from "./routes.js";
import { krProgress, objProgress } from "./routes.js";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(okrsRoutes);
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

describe("okrs routes", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("krProgress/objProgress pure functions match the mock's formula", () => {
    // Σ (peso% × avance%) per KR, rounded; objective = plain average of KR progress, rounded.
    const kr1 = [
      { peso: 10, avance: 50 },
      { peso: 20, avance: 60 },
      { peso: 30, avance: 70 },
      { peso: 40, avance: 80 },
    ];
    expect(krProgress(kr1)).toBe(70); // 5 + 12 + 21 + 32 = 70
    const kr2 = [
      { peso: 25, avance: 100 },
      { peso: 25, avance: 100 },
      { peso: 25, avance: 100 },
      { peso: 25, avance: 100 },
    ];
    expect(krProgress(kr2)).toBe(100);
    expect(objProgress([70, 100])).toBe(85);
  });

  it("empleado lacking OKRs/Crear... wait, empleado HAS Crear — analista does not: denied 403", async () => {
    const cookie = await login(app, "nortania", "analista@nortania.test");
    const res = await app.inject({
      method: "POST",
      url: "/okrs/objectives",
      headers: { cookie },
      payload: { nombre: "x", owner: "x", iniciales: "XX", nivel: "Empresa", vencimiento: "2026-12-31", prioridad: "Alto" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("analista is also denied on edit (403)", async () => {
    const cookie = await login(app, "nortania", "analista@nortania.test");
    const res = await app.inject({
      method: "PUT",
      url: "/okrs/objectives/00000000-0000-0000-0000-000000000000",
      headers: { cookie },
      payload: { nombre: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("create objective with KRs across quarters/weights and verify server-computed weighted rollup", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const payload = {
      nombre: "Objetivo de prueba",
      owner: "Test Owner",
      iniciales: "TO",
      nivel: "Equipo",
      vencimiento: "2026-12-31",
      prioridad: "Alto",
      krs: [
        {
          nombre: "KR de prueba 1",
          owner: "Test Owner",
          metrica: "Porcentaje",
          prioridad: "Alto",
          trimestres: [
            { trimestre: "T1", peso: 10, avance: 50 },
            { trimestre: "T2", peso: 20, avance: 60 },
            { trimestre: "T3", peso: 30, avance: 70 },
            { trimestre: "T4", peso: 40, avance: 80 },
          ],
        },
        {
          nombre: "KR de prueba 2",
          owner: "Test Owner",
          metrica: "Porcentaje",
          prioridad: "Medio",
          trimestres: [
            { trimestre: "T1", peso: 25, avance: 100 },
            { trimestre: "T2", peso: 25, avance: 100 },
            { trimestre: "T3", peso: 25, avance: 100 },
            { trimestre: "T4", peso: 25, avance: 100 },
          ],
        },
      ],
    };
    const res = await app.inject({ method: "POST", url: "/okrs/objectives", headers: { cookie }, payload });
    expect(res.statusCode, res.payload).toBe(201);
    const body = res.json();
    expect(body.krs).toHaveLength(2);
    const kr1 = body.krs.find((k: { nombre: string }) => k.nombre === "KR de prueba 1");
    const kr2 = body.krs.find((k: { nombre: string }) => k.nombre === "KR de prueba 2");
    expect(kr1.progreso).toBe(70); // manual: 0.1*50 + 0.2*60 + 0.3*70 + 0.4*80 = 70
    expect(kr2.progreso).toBe(100);
    expect(body.progreso).toBe(85); // manual: round((70 + 100) / 2) = 85

    const detail = await app.inject({ method: "GET", url: `/okrs/objectives/${body.id}`, headers: { cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().progreso).toBe(85);
  });

  it("POST /okrs/objectives/:id/key-results: happy path, invalid body 400, missing objective 404", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const created = await app.inject({
      method: "POST",
      url: "/okrs/objectives",
      headers: { cookie },
      payload: { nombre: "Objetivo base", owner: "Test Owner", iniciales: "TO", nivel: "Equipo", vencimiento: "2026-12-31", prioridad: "Alto" },
    });
    expect(created.statusCode, created.payload).toBe(201);
    const objId = created.json().id;

    const addKr = await app.inject({
      method: "POST",
      url: `/okrs/objectives/${objId}/key-results`,
      headers: { cookie },
      payload: {
        nombre: "KR agregado",
        owner: "Test Owner",
        metrica: "Porcentaje",
        prioridad: "Medio",
        trimestres: [{ trimestre: "T1", peso: 100, avance: 50 }],
      },
    });
    expect(addKr.statusCode, addKr.payload).toBe(201);
    expect(addKr.json().progreso).toBe(50);

    const badBody = await app.inject({
      method: "POST",
      url: `/okrs/objectives/${objId}/key-results`,
      headers: { cookie },
      payload: { nombre: "" },
    });
    expect(badBody.statusCode).toBe(400);

    const missingObj = await app.inject({
      method: "POST",
      url: "/okrs/objectives/00000000-0000-0000-0000-000000000000/key-results",
      headers: { cookie },
      payload: { nombre: "X", owner: "Y", metrica: "Z", prioridad: "Alto" },
    });
    expect(missingObj.statusCode).toBe(404);
  });

  it("PUT objective and PUT key-result: happy path, empty-body 400, and not-found 404", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const created = await app.inject({
      method: "POST",
      url: "/okrs/objectives",
      headers: { cookie },
      payload: {
        nombre: "Objetivo editable",
        owner: "Test Owner",
        iniciales: "TO",
        nivel: "Equipo",
        vencimiento: "2026-12-31",
        prioridad: "Alto",
        krs: [{ nombre: "KR editable", owner: "Test Owner", metrica: "Porcentaje", prioridad: "Alto", trimestres: [] }],
      },
    });
    expect(created.statusCode, created.payload).toBe(201);
    const obj = created.json();
    const krId = obj.krs[0].id;

    const putObj = await app.inject({
      method: "PUT",
      url: `/okrs/objectives/${obj.id}`,
      headers: { cookie },
      payload: { prioridad: "Bajo" },
    });
    expect(putObj.statusCode, putObj.payload).toBe(200);
    expect(putObj.json().prioridad).toBe("Bajo");

    const emptyObj = await app.inject({ method: "PUT", url: `/okrs/objectives/${obj.id}`, headers: { cookie }, payload: {} });
    expect(emptyObj.statusCode).toBe(400);

    const missingId = "00000000-0000-0000-0000-000000000000";
    const missingObj = await app.inject({ method: "PUT", url: `/okrs/objectives/${missingId}`, headers: { cookie }, payload: { prioridad: "Alto" } });
    expect(missingObj.statusCode).toBe(404);

    const putKr = await app.inject({
      method: "PUT",
      url: `/okrs/key-results/${krId}`,
      headers: { cookie },
      payload: { metrica: "Días" },
    });
    expect(putKr.statusCode, putKr.payload).toBe(200);
    expect(putKr.json().metrica).toBe("Días");

    const emptyKr = await app.inject({ method: "PUT", url: `/okrs/key-results/${krId}`, headers: { cookie }, payload: {} });
    expect(emptyKr.statusCode).toBe(400);

    const missingKr = await app.inject({ method: "PUT", url: `/okrs/key-results/${missingId}`, headers: { cookie }, payload: { metrica: "Días" } });
    expect(missingKr.statusCode).toBe(404);
  });

  it("cross-tenant: a nortania objective id is invisible (404) through a demo session, and never listed", async () => {
    // Both tenants seed an identically-named OKR set (same template), so the
    // proof has to be by id, not by name.
    const [nortaniaTenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, "nortania")).limit(1);
    const [nortaniaObjective] = await adminDb
      .select()
      .from(objectives)
      .where(eq(objectives.tenantId, nortaniaTenant.id))
      .limit(1);

    const cookie = await login(app, "demo", "empleado@demo.test");

    const detail = await app.inject({
      method: "GET",
      url: `/okrs/objectives/${nortaniaObjective.id}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(404);

    const list = await app.inject({ method: "GET", url: "/okrs/objectives", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const ids: string[] = list.json().map((o: { id: string }) => o.id);
    expect(ids).not.toContain(nortaniaObjective.id);
  });
});
