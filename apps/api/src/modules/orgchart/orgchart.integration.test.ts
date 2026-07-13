import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import tenantContextPlugin from "../../plugins/tenant-context.js";
import authRoutes from "../auth/routes.js";
import orgchartRoutes from "./routes.js";

interface OrgNode {
  id: string;
  nombre: string;
  children: OrgNode[];
  total: number;
}

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(orgchartRoutes);
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

// Walks the tree, collecting every node id (to check for duplicates) and
// verifying `total` is consistent with the actual descendant count.
function walk(node: OrgNode, seenIds: Set<string>, hasChildrenFlag: { found: boolean }) {
  expect(seenIds.has(node.id)).toBe(false); // each employee appears exactly once
  seenIds.add(node.id);
  if (node.children.length > 0) hasChildrenFlag.found = true;
  const expectedTotal = node.children.reduce((sum, c) => sum + c.total, 0) + node.children.length;
  expect(node.total).toBe(expectedTotal);
  for (const child of node.children) walk(child, seenIds, hasChildrenFlag);
}

describe("orgchart routes (Phase 3)", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("builds a well-formed tree from real seeded nortania data", async () => {
    const cookieHeader = await login(app, "nortania", "supervisor@nortania.test");
    const res = await app.inject({ method: "GET", url: "/orgchart", headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { roots: OrgNode[] };
    expect(Array.isArray(body.roots)).toBe(true);
    expect(body.roots.length).toBeGreaterThan(0);

    const seenIds = new Set<string>();
    const hasChildrenFlag = { found: false };
    for (const root of body.roots) walk(root, seenIds, hasChildrenFlag);

    expect(hasChildrenFlag.found).toBe(true); // at least one employee has direct reports
    expect(seenIds.size).toBeGreaterThan(body.roots.length); // non-root employees exist too
  });

  it("requires Empleados/Ver — denied without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/orgchart" });
    expect(res.statusCode).toBe(401);
  });
});
