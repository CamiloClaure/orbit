import { pgTable, uuid, text, timestamp, unique, type AnyPgColumn } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { roles } from "./roles.js";
import { employees } from "./employees.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    employeeId: uuid("employee_id").references((): AnyPgColumn => employees.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("users_tenant_email_uq").on(t.tenantId, t.email)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(), // doubles as the session token
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
