import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { eq } from "drizzle-orm";
import tenantContextPlugin, { adminDb } from "../../plugins/tenant-context.js";
import authRoutes from "../auth/routes.js";
import rolesRoutes from "./routes.js";
import { users } from "../../db/schema/index.js";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(rolesRoutes);
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

describe("roles routes", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("empleado (no Roles y permisos/Ver — only global has this module) gets 403 on /roles", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/roles", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("global lists roles with real usuarios counts", async () => {
    const cookie = await login(app, "nortania", "global@nortania.test");
    const res = await app.inject({ method: "GET", url: "/roles", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const rolesList = res.json() as { id: string; nombre: string; descripcion: string; color: string; usuarios: number }[];
    expect(rolesList.length).toBe(6); // rolesSeed: empleado/supervisor/analista/jefe/nomina/global
    // nortania seeds exactly one login user per role.
    for (const r of rolesList) expect(r.usuarios).toBe(1);
  });

  it("field-permissions groups roleIds per (campo, modulo) from real seeded rows", async () => {
    const cookie = await login(app, "nortania", "global@nortania.test");
    const res = await app.inject({ method: "GET", url: "/roles/field-permissions", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as { campo: string; modulo: string; roleIds: string[] }[];
    expect(rows.length).toBeGreaterThan(0);
    const salario = rows.find((r) => r.campo === "Salario y haberes");
    expect(salario).toBeDefined();
    expect(salario!.roleIds.length).toBeGreaterThanOrEqual(2); // nomina + global
  });

  it("toggle a grant on via PUT, matrix reflects it, toggle off, matrix drops it", async () => {
    const cookie = await login(app, "nortania", "global@nortania.test");

    const rolesRes = await app.inject({ method: "GET", url: "/roles", headers: { cookie } });
    const empleadoRole = (rolesRes.json() as { id: string; nombre: string }[]).find((r) => r.nombre === "Empleado")!;

    // "empleado" role has no "Reportes" grants at all in the seed matrix (db/seed.ts).
    const before = await app.inject({ method: "GET", url: "/roles/matrix", headers: { cookie } });
    const beforeMatrix = before.json() as Record<string, Partial<Record<string, string[]>>>;
    expect(beforeMatrix[empleadoRole.id]?.Reportes ?? []).not.toContain("Ver");

    const on = await app.inject({
      method: "PUT",
      url: `/roles/${empleadoRole.id}/permissions`,
      headers: { cookie },
      payload: { modulo: "Reportes", accion: "Ver", granted: true },
    });
    expect(on.statusCode).toBe(200);

    const afterOn = await app.inject({ method: "GET", url: "/roles/matrix", headers: { cookie } });
    const afterOnMatrix = afterOn.json() as Record<string, Partial<Record<string, string[]>>>;
    expect(afterOnMatrix[empleadoRole.id]?.Reportes ?? []).toContain("Ver");

    const off = await app.inject({
      method: "PUT",
      url: `/roles/${empleadoRole.id}/permissions`,
      headers: { cookie },
      payload: { modulo: "Reportes", accion: "Ver", granted: false },
    });
    expect(off.statusCode).toBe(200);

    const afterOff = await app.inject({ method: "GET", url: "/roles/matrix", headers: { cookie } });
    const afterOffMatrix = afterOff.json() as Record<string, Partial<Record<string, string[]>>>;
    expect(afterOffMatrix[empleadoRole.id]?.Reportes ?? []).not.toContain("Ver");
  });

  it("PUT permissions: malformed id (404), invalid body (400), missing role (404); apply: invalid body (400)", async () => {
    const cookie = await login(app, "nortania", "global@nortania.test");

    const badId = await app.inject({
      method: "PUT",
      url: "/roles/not-a-uuid/permissions",
      headers: { cookie },
      payload: { modulo: "Reportes", accion: "Ver", granted: true },
    });
    expect(badId.statusCode).toBe(404);

    const rolesRes = await app.inject({ method: "GET", url: "/roles", headers: { cookie } });
    const anyRole = (rolesRes.json() as { id: string }[])[0];

    const badBody = await app.inject({
      method: "PUT",
      url: `/roles/${anyRole.id}/permissions`,
      headers: { cookie },
      payload: { modulo: "NoExiste", accion: "Ver", granted: true },
    });
    expect(badBody.statusCode).toBe(400);

    const missingRole = await app.inject({
      method: "PUT",
      url: "/roles/00000000-0000-0000-0000-000000000000/permissions",
      headers: { cookie },
      payload: { modulo: "Reportes", accion: "Ver", granted: true },
    });
    expect(missingRole.statusCode).toBe(404);

    const badApply = await app.inject({
      method: "POST",
      url: "/roles/audit/apply",
      headers: { cookie },
      payload: { userIds: ["not-a-uuid"] },
    });
    expect(badApply.statusCode).toBe(400);
  });

  it("audit returns a real, derived-from-seed list (shape + at least logic ran)", async () => {
    const cookie = await login(app, "nortania", "global@nortania.test");
    const res = await app.inject({ method: "GET", url: "/roles/audit", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const audit = res.json() as {
      userId: string;
      employeeId: string;
      nombre: string;
      iniciales: string;
      avatar: string;
      pais: string;
      departamento: string;
      puesto: string;
      rolActualId: string;
      rolActualNombre: string;
      rolSugeridoId: string;
      rolSugeridoNombre: string;
    }[];
    expect(Array.isArray(audit)).toBe(true);

    // sugerirRol() never suggests "Administrador Global" — the seeded
    // global@ user is therefore always expected to show up as a mismatch,
    // proving the heuristic ran against real seeded employee data rather
    // than being fabricated.
    const globalMismatch = audit.find((a) => a.rolActualNombre === "Administrador Global");
    expect(globalMismatch).toBeDefined();
    expect(globalMismatch!.rolSugeridoNombre).not.toBe("Administrador Global");
    if (globalMismatch) {
      for (const key of ["userId", "employeeId", "nombre", "iniciales", "avatar", "pais", "departamento", "puesto", "rolActualId", "rolSugeridoId"]) {
        expect(globalMismatch).toHaveProperty(key);
      }
    }
  });

  it("audit/apply reassigns a flagged user to their suggested role, then the audit drops them", async () => {
    const cookie = await login(app, "nortania", "global@nortania.test");
    const before = await app.inject({ method: "GET", url: "/roles/audit", headers: { cookie } });
    const auditBefore = before.json() as { userId: string; rolActualNombre: string; rolSugeridoId: string }[];
    expect(auditBefore.length).toBeGreaterThan(0);

    // Every seeded nortania user is also a fixed login fixture other test
    // files log in as by email (e.g. voz.integration.test.ts uses
    // global@nortania.test). Pick a target OTHER than the account we're
    // logged in as here, and always restore its original roleId afterward —
    // this suite's users are shared, session-scoped-by-email fixtures, not
    // disposable rows.
    const target = auditBefore.find((a) => a.rolActualNombre !== "Administrador Global") ?? auditBefore[0];
    const [originalUser] = await adminDb.select({ roleId: users.roleId }).from(users).where(eq(users.id, target.userId)).limit(1);
    expect(originalUser).toBeTruthy();

    try {
      const applyRes = await app.inject({
        method: "POST",
        url: "/roles/audit/apply",
        headers: { cookie },
        payload: { userIds: [target.userId] },
      });
      expect(applyRes.statusCode).toBe(200);
      expect((applyRes.json() as { updated: string[] }).updated).toEqual([target.userId]);

      const [updatedUser] = await adminDb.select({ roleId: users.roleId }).from(users).where(eq(users.id, target.userId)).limit(1);
      expect(updatedUser.roleId).toBe(target.rolSugeridoId);

      const after = await app.inject({ method: "GET", url: "/roles/audit", headers: { cookie } });
      const auditAfter = after.json() as { userId: string }[];
      expect(auditAfter.some((a) => a.userId === target.userId)).toBe(false);
    } finally {
      await adminDb.update(users).set({ roleId: originalUser.roleId }).where(eq(users.id, target.userId));
    }
  });

  it("cross-tenant: demo's roles never include nortania's role ids", async () => {
    const nortaniaCookie = await login(app, "nortania", "global@nortania.test");
    const nortaniaRes = await app.inject({ method: "GET", url: "/roles", headers: { cookie: nortaniaCookie } });
    const nortaniaIds = (nortaniaRes.json() as { id: string }[]).map((r) => r.id);

    const demoCookie = await login(app, "demo", "global@demo.test");
    const demoRes = await app.inject({ method: "GET", url: "/roles", headers: { cookie: demoCookie } });
    expect(demoRes.statusCode).toBe(200);
    const demoIds = (demoRes.json() as { id: string }[]).map((r) => r.id);

    expect(demoIds.some((id) => nortaniaIds.includes(id))).toBe(false);
  });
});
