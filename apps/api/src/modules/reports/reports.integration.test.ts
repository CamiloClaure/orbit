import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import tenantContextPlugin from "../../plugins/tenant-context.js";
import authRoutes from "../auth/routes.js";
import reportsRoutes from "./routes.js";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(reportsRoutes);
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

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  const rows = lines.slice(1).map((l) => l.split(","));
  return { header, rows };
}

describe("reports (Phase 3c)", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("empleado (no Reportes/Ver) gets 403 on the CSV export", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");
    const res = await app.inject({ method: "GET", url: "/reports/employees.csv", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("nomina role's CSV includes the salario column", async () => {
    const cookie = await login(app, "nortania", "nomina@nortania.test");
    const res = await app.inject({ method: "GET", url: "/reports/employees.csv", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    const { header, rows } = parseCsv(res.payload);
    expect(header).toContain("salario");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("analista role's CSV omits the salario column entirely", async () => {
    const cookie = await login(app, "nortania", "analista@nortania.test");
    const res = await app.inject({ method: "GET", url: "/reports/employees.csv", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { header, rows } = parseCsv(res.payload);
    expect(header).not.toContain("salario");
    expect(rows.length).toBeGreaterThan(0);
  });
});
