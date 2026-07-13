import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";

// Two connection strings, two purposes:
// - DATABASE_URL: superuser (`orbit`, from docker-compose). Needed to run
//   migrations (CREATE ROLE, ENABLE ROW LEVEL SECURITY, CREATE POLICY, GRANT)
//   and to seed data — seeding bypasses RLS on purpose (it writes both
//   tenants' rows in one pass; that's an admin operation, not a tenant request).
// - APP_DATABASE_URL: the `orbit_app` role Phase 2's API will connect as. This
//   role is NOT the table owner and is NOT superuser, so RLS actually applies
//   to it. Password documented in RUNBOOK.md.
export const ADMIN_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://orbit:orbit@localhost:5432/orbit";

export const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ?? "postgres://orbit_app:orbit_app_pw@localhost:5432/orbit";

export function makeDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}
