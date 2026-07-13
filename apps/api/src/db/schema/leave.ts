import { pgTable, uuid, text, date, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { employees } from "./employees.js";
import { countryEnum, leaveStatusEnum } from "./enums.js";

// Ports `leaveRulesByCountry` (leave.ts) as per-tenant rows so a tenant can
// customize its own rules later without a schema change.
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    pais: countryEnum("pais").notNull(),
    nombre: text("nombre").notNull(),
    dias: numeric("dias", { precision: 5, scale: 2 }).notNull(),
    color: text("color").notNull(),
  },
  (t) => [unique("leave_types_uq").on(t.tenantId, t.pais, t.nombre)],
);

// Ports `LeaveRequest`.
export const leaveRequests = pgTable("leave_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  tipo: text("tipo").notNull(),
  desde: date("desde").notNull(),
  hasta: date("hasta").notNull(),
  dias: numeric("dias", { precision: 5, scale: 2 }).notNull(),
  saldo: numeric("saldo", { precision: 5, scale: 2 }).notNull(),
  estado: leaveStatusEnum("estado").notNull(),
  comentario: text("comentario"),
  adjunto: text("adjunto"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Ports `LeaveBalance` (`myBalances` in the mock, generalized to any employee).
export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    tipo: text("tipo").notNull(),
    total: numeric("total", { precision: 5, scale: 2 }).notNull(),
    usado: numeric("usado", { precision: 5, scale: 2 }).notNull(),
    color: text("color").notNull(),
  },
  (t) => [unique("leave_balances_uq").on(t.tenantId, t.employeeId, t.tipo)],
);
