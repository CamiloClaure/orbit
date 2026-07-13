import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import tenantContextPlugin from "../../plugins/tenant-context.js";
import authRoutes from "../auth/routes.js";
import engagementRoutes from "./routes.js";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme123";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(engagementRoutes);
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

describe("engagement routes (read-only)", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("empleado (Encuestas/Ver granted) sees campaigns, eNPS, and templates", async () => {
    const cookie = await login(app, "nortania", "empleado@nortania.test");

    const campaigns = await app.inject({ method: "GET", url: "/engagement/campaigns", headers: { cookie } });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json().length).toBeGreaterThan(0);

    const enps = await app.inject({ method: "GET", url: "/engagement/enps", headers: { cookie } });
    expect(enps.statusCode).toBe(200);
    expect(enps.json().length).toBeGreaterThan(0);

    const templates = await app.inject({ method: "GET", url: "/engagement/templates", headers: { cookie } });
    expect(templates.statusCode).toBe(200);
    expect(templates.json().length).toBeGreaterThan(0);
  });

  it("jefe has no Encuestas grant at all in the matrix: denied 403", async () => {
    const cookie = await login(app, "nortania", "jefe@nortania.test");
    const res = await app.inject({ method: "GET", url: "/engagement/campaigns", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("cross-tenant: demo's campaigns list is scoped to demo's own rows (RLS)", async () => {
    const nortaniaCookie = await login(app, "nortania", "empleado@nortania.test");
    const nortaniaRes = await app.inject({ method: "GET", url: "/engagement/campaigns", headers: { cookie: nortaniaCookie } });
    const nortaniaIds: string[] = nortaniaRes.json().map((c: { id: string }) => c.id);

    const demoCookie = await login(app, "demo", "empleado@demo.test");
    const demoRes = await app.inject({ method: "GET", url: "/engagement/campaigns", headers: { cookie: demoCookie } });
    expect(demoRes.statusCode).toBe(200);
    const demoIds: string[] = demoRes.json().map((c: { id: string }) => c.id);

    expect(demoIds.some((id) => nortaniaIds.includes(id))).toBe(false);
  });
});
