import { pgTable, uuid, text, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { moduloEnum, accionEnum } from "./enums.js";

// Ports `Role` from roles.ts. `roleKey` is the mock's stable id ('empleado',
// 'supervisor', ...); roles are per-tenant rows so `global` can customize them.
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    roleKey: text("role_key").notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion").notNull(),
    color: text("color").notNull(),
  },
  (t) => [unique("roles_tenant_key_uq").on(t.tenantId, t.roleKey)],
);

// Ports the module x action `matrix` — one row per (role, modulo, accion) grant,
// which is what `requirePermission(modulo, accion)` (Phase 2) queries directly.
export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    modulo: moduloEnum("modulo").notNull(),
    accion: accionEnum("accion").notNull(),
  },
  (t) => [unique("role_permissions_uq").on(t.tenantId, t.roleId, t.modulo, t.accion)],
);

// Ports `fieldPermissions` (roles.ts) — salary-field-level grants, e.g. only
// nomina/global can see "Salario y haberes" in Nómina.
export const fieldPermissions = pgTable(
  "field_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    campo: text("campo").notNull(),
    modulo: moduloEnum("modulo").notNull(),
    roleId: uuid("role_id").notNull().references(() => roles.id),
  },
  (t) => [unique("field_permissions_uq").on(t.tenantId, t.campo, t.modulo, t.roleId)],
);

// Note: mock `Role.usuarios` (user count per role) is not stored — it's a
// COUNT(*) FROM users at request time, same reasoning as the other NOT-tables.
