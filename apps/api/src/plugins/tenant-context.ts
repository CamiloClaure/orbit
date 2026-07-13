import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index.js";
import { makeDb, ADMIN_DATABASE_URL, APP_DATABASE_URL } from "../db/client.js";

export type ScopedDb = ReturnType<typeof drizzle<typeof schema>>;

export interface AuthUser {
  id: string;
  email: string;
  roleId: string;
  roleKey: string;
  employeeId: string | null;
}

export interface AuthTenant {
  id: string;
  slug: string;
  nombre: string;
}

declare module "fastify" {
  interface FastifyRequest {
    // RLS-scoped, request-lifetime db handle. Only set once a valid session
    // cookie resolves to a live session (see onRequest hook below).
    db: ScopedDb;
    authUser?: AuthUser;
    tenant?: AuthTenant;
    _reserved?: postgres.ReservedSql;
  }
}

export const SESSION_COOKIE = "sid";

// Bypasses RLS. Used ONLY for the auth-infrastructure lookups that happen
// before a tenant is known from a session (session-by-id, and — in the login
// route — tenant-by-slug / user-by-email, and session creation/deletion).
// Never used to serve business data. This is option (a) from the phase spec:
// less code than a SET LOCAL dance for a lookup-by-PK, and the RLS invariant
// on business tables is untouched since nothing else uses this connection.
export const adminDb = makeDb(ADMIN_DATABASE_URL);

// One physical-connection pool for the `orbit_app` role. Each authenticated
// request reserves a single dedicated connection from it so `SET LOCAL
// app.tenant_id` (transaction-scoped) can't leak across requests the way a
// session-scoped SET on a pooled connection could.
const pgApp = postgres(APP_DATABASE_URL);

export default fp(async function tenantContextPlugin(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (!sessionId) return; // anonymous — route-level guards decide if that's allowed

    const [row] = await adminDb
      .select({
        userId: schema.users.id,
        email: schema.users.email,
        roleId: schema.users.roleId,
        roleKey: schema.roles.roleKey,
        employeeId: schema.users.employeeId,
        tenantId: schema.sessions.tenantId,
        tenantSlug: schema.tenants.slug,
        tenantNombre: schema.tenants.nombre,
        expiresAt: schema.sessions.expiresAt,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.sessions.tenantId))
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!row || row.expiresAt < new Date()) return; // missing/expired session: stays anonymous

    // Postgres doesn't allow bind parameters in SET — the value must be a
    // literal. row.tenantId came straight back from our own DB (a uuid
    // column), but re-validate the shape before interpolating raw SQL.
    if (!/^[0-9a-f-]{36}$/i.test(row.tenantId)) return;

    const reserved = await pgApp.reserve();
    await reserved`BEGIN`;
    await reserved.unsafe(`SET LOCAL app.tenant_id = '${row.tenantId}'`);

    // postgres.js's own .d.ts says ReservedSql has `.options`, but reserve()'s
    // runtime implementation doesn't actually copy it from the parent client
    // (it builds a bare Sql() without the Object.assign the top-level client
    // gets) — drizzle needs client.options.parsers, so patch it in. Safe:
    // it's the same shared type-parser config for every connection in pgApp.
    (reserved as unknown as { options: typeof pgApp.options }).options = pgApp.options;

    request._reserved = reserved;
    request.db = drizzle(reserved, { schema });
    request.tenant = { id: row.tenantId, slug: row.tenantSlug, nombre: row.tenantNombre };
    request.authUser = { id: row.userId, email: row.email, roleId: row.roleId, roleKey: row.roleKey, employeeId: row.employeeId };
  });

  // Commit (or roll back on error) and always release the reserved connection
  // back to the pool — this is what makes SET LOCAL request-scoped rather
  // than a leak into whatever request reuses this physical connection next.
  //
  // Must run on `onSend`, not `onResponse`: onResponse fires AFTER the reply
  // has already been flushed to the client, so a client that fires a quick
  // follow-up request right after receiving e.g. a 201 could read against
  // this transaction before it commits — a real cross-request race. onSend
  // runs before the bytes go out, so the commit is guaranteed visible by the
  // time the client can act on the response.
  fastify.addHook("onSend", async (request, reply, payload) => {
    const reserved = request._reserved;
    if (!reserved) return payload;
    try {
      if (reply.statusCode >= 500) await reserved`ROLLBACK`;
      else await reserved`COMMIT`;
    } catch {
      // ponytail: best-effort — connection is dropped from the pool below regardless.
    } finally {
      reserved.release();
    }
    return payload;
  });
});
