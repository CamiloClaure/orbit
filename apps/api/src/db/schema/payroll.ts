import { pgTable, uuid, text, numeric, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { employees } from "./employees.js";

// Ports `PayrollRow` (payroll.ts). `periodo` ("2026-06") makes this a
// time series per employee instead of the mock's single-snapshot array.
export const payrollRows = pgTable(
  "payroll_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    periodo: text("periodo").notNull(),
    bruto: numeric("bruto", { precision: 12, scale: 2 }).notNull(),
    bonos: numeric("bonos", { precision: 12, scale: 2 }).notNull(),
    descuentos: numeric("descuentos", { precision: 12, scale: 2 }).notNull(),
    neto: numeric("neto", { precision: 12, scale: 2 }).notNull(),
    aportes: numeric("aportes", { precision: 12, scale: 2 }).notNull(),
    costoCompania: numeric("costo_compania", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [unique("payroll_rows_uq").on(t.tenantId, t.employeeId, t.periodo)],
);
