import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { users } from "./users.js";
import { notifKindEnum } from "./enums.js";

// Ports `Notif` (notifications.ts). `createdAt` replaces the mock's relative
// "hace" string, computed at read time instead of stored.
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: notifKindEnum("kind").notNull(),
  titulo: text("titulo").notNull(),
  detalle: text("detalle").notNull(),
  unread: boolean("unread").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
