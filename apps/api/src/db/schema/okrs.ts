import { pgTable, uuid, text, date, numeric, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { nivelEnum, prioridadEnum, trimestreEnum } from "./enums.js";

// Ports `Objetivo` (okrs.ts). `owner`/`iniciales` are kept as text, same as
// the mock — OKR owners (e.g. "Sarah Mitchell") are leadership names that
// don't necessarily exist in the 312-employee dataset.
export const objectives = pgTable("objectives", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: text("nombre").notNull(),
  owner: text("owner").notNull(),
  iniciales: text("iniciales").notNull(),
  nivel: nivelEnum("nivel").notNull(),
  vencimiento: date("vencimiento").notNull(),
  prioridad: prioridadEnum("prioridad").notNull(),
});

// Ports `KeyResult`.
export const keyResults = pgTable("key_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  objectiveId: uuid("objective_id").notNull().references(() => objectives.id),
  nombre: text("nombre").notNull(),
  owner: text("owner").notNull(),
  metrica: text("metrica").notNull(),
  prioridad: prioridadEnum("prioridad").notNull(),
});

// Ports `Trimestre` — the quarterly weight/progress breakdown
// (`krProgress` = Σ peso% × avance%, computed server-side, not stored).
export const keyResultQuarters = pgTable(
  "key_result_quarters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    keyResultId: uuid("key_result_id").notNull().references(() => keyResults.id),
    trimestre: trimestreEnum("trimestre").notNull(),
    peso: numeric("peso", { precision: 5, scale: 2 }).notNull(),
    avance: numeric("avance", { precision: 5, scale: 2 }).notNull(),
  },
  (t) => [unique("key_result_quarters_uq").on(t.tenantId, t.keyResultId, t.trimestre)],
);
