import { pgTable, uuid, text } from "drizzle-orm/pg-core";

// The one table with no tenant_id — it IS the tenant list.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nombre: text("nombre").notNull(),
  dbUrl: text("db_url"), // null = lives in the shared DB
  estado: text("estado").notNull().default("activo"),
});
