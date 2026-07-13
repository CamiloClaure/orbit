import { pgTable, uuid, text, date, integer, numeric, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { employees } from "./employees.js";
import { countryEnum, campanaEstadoEnum, denunciaTipoEnum, denunciaEstadoEnum } from "./enums.js";

// Ports `Campaña` (engagement.ts).
export const surveyCampaigns = pgTable("survey_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: text("nombre").notNull(),
  plantilla: text("plantilla").notNull(),
  vence: date("vence").notNull(),
  anonimo: boolean("anonimo").notNull(),
  estado: campanaEstadoEnum("estado").notNull(),
  participacion: numeric("participacion", { precision: 4, scale: 3 }).notNull(),
});

// Ports the eNPS overall score + `enpsTrend` — one row per month snapshot.
export const enpsSnapshots = pgTable("enps_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  mes: text("mes").notNull(),
  score: integer("score").notNull(),
  promotores: integer("promotores"),
  pasivos: integer("pasivos"),
  detractores: integer("detractores"),
});

// Ports `Plantilla`.
export const surveyTemplates = pgTable(
  "survey_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    nombre: text("nombre").notNull(),
    preguntas: integer("preguntas").notNull(),
    tipo: text("tipo").notNull(),
    editable: boolean("editable").notNull(),
  },
  (t) => [unique("survey_templates_uq").on(t.tenantId, t.nombre)],
);

// Ports `Reconocimiento`. `createdAt` replaces the mock's relative "hace" string.
export const recognitions = pgTable("recognitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  deEmployeeId: uuid("de_employee_id").notNull().references(() => employees.id),
  paraEmployeeId: uuid("para_employee_id").notNull().references(() => employees.id),
  mensaje: text("mensaje").notNull(),
  estrellas: integer("estrellas").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Ports `Denuncia`. By design this NEVER carries an author FK, even nullable —
// anonymity is structural, not a UI toggle. Do not add one in later phases.
export const denuncias = pgTable("denuncias", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  tipo: denunciaTipoEnum("tipo").notNull(),
  titulo: text("titulo").notNull(),
  estado: denunciaEstadoEnum("estado").notNull(),
  fecha: date("fecha").notNull(),
  anonimo: boolean("anonimo").notNull(),
  pais: countryEnum("pais").notNull(),
});
