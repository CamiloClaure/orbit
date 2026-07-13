import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ADMIN_DATABASE_URL } from "./client.js";

// Runs as the superuser (`orbit`) — migrations include CREATE ROLE and
// ENABLE ROW LEVEL SECURITY, which the app's `orbit_app` role can't do.
const client = postgres(ADMIN_DATABASE_URL, { max: 1 });
const db = drizzle(client);

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

await migrate(db, { migrationsFolder });
console.log("Migrations applied.");
await client.end();
