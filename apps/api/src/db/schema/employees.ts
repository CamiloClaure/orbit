import { pgTable, uuid, text, date, numeric, unique, type AnyPgColumn } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { countryEnum, employeeEstadoEnum } from "./enums.js";
import { users } from "./users.js";

// Ports `Employee` from the mockup's src/data/employees.ts field-for-field.
// `employeeCode` is the mock's human `id` (e.g. "BO1001"); `id` here is the
// real PK so FKs (supervisor, payroll, leave, recognitions...) are stable.
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    employeeCode: text("employee_code").notNull(),
    nombre: text("nombre").notNull(),
    puesto: text("puesto").notNull(),
    departamento: text("departamento").notNull(),
    centroCosto: text("centro_costo").notNull(),
    sede: text("sede").notNull(),
    pais: countryEnum("pais").notNull(),
    ciudad: text("ciudad").notNull(),
    // Mock stores supervisor as a name string; ported to a real FK per the plan.
    supervisorId: uuid("supervisor_id").references((): AnyPgColumn => employees.id),
    estado: employeeEstadoEnum("estado").notNull(),
    email: text("email").notNull(),
    telefono: text("telefono").notNull(),
    ingreso: date("ingreso").notNull(),
    cumple: text("cumple").notNull(), // "MM-DD", no year in the mock
    salario: numeric("salario", { precision: 12, scale: 2 }).notNull(),
    iniciales: text("iniciales").notNull(),
    avatar: text("avatar").notNull(),
    // Nullable: most employees never get a login (only ~seed users do in Phase 2).
    userId: uuid("user_id").references((): AnyPgColumn => users.id),
  },
  (t) => [
    unique("employees_tenant_code_uq").on(t.tenantId, t.employeeCode),
    unique("employees_tenant_email_uq").on(t.tenantId, t.email),
  ],
);
