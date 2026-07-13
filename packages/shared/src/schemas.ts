import { z } from "zod";

// First draft — ports the DB schema (apps/api/src/db/schema/*.ts) field-for-
// field, which itself ports the mockup's mock types. One schema per
// entity, types exported via z.infer. To be reviewed/locked by Opus before
// Phase 2 (routes/RBAC) is built against it.

/* ─────────────── Shared enums (mirror apps/api/src/db/schema/enums.ts) ─────────────── */

export const countrySchema = z.enum(["BO", "CL", "EC", "AR", "PY"]);
export type CountryCode = z.infer<typeof countrySchema>;

export const employeeEstadoSchema = z.enum(["Activo", "Inactivo", "Ausente"]);
export const leaveStatusSchema = z.enum(["Pendiente", "Aprobado", "Rechazado"]);

export const moduloSchema = z.enum([
  "Empleados",
  "Permisos",
  "Nómina",
  "OKRs",
  "Desempeño",
  "Reportes",
  "Encuestas",
  "Roles y permisos",
]);

export const accionSchema = z.enum(["Ver", "Crear", "Editar", "Aprobar", "Eliminar"]);
export const prioridadSchema = z.enum(["Crítico", "Alto", "Medio", "Bajo"]);
export const nivelSchema = z.enum(["Empresa", "Área", "Equipo"]);
export const trimestreSchema = z.enum(["T1", "T2", "T3", "T4"]);
export const campanaEstadoSchema = z.enum(["Iniciada", "Cerrada", "Borrador"]);

export const denunciaTipoSchema = z.enum([
  "Acoso o intimidación",
  "Conflicto laboral",
  "Sugerencia",
  "Reconocimiento",
]);
export const denunciaEstadoSchema = z.enum(["Nueva", "En revisión", "Resuelta"]);

export const notifKindSchema = z.enum(["permiso", "reconocimiento", "okr", "nomina", "sistema", "cumple"]);

/* ─────────────── Tenants ─────────────── */

export const tenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  nombre: z.string().min(1),
  dbUrl: z.string().url().nullable(),
  estado: z.string(),
});
export type Tenant = z.infer<typeof tenantSchema>;

/* ─────────────── Employees ─────────────── */

export const employeeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeCode: z.string().min(1),
  nombre: z.string().min(1),
  puesto: z.string().min(1),
  departamento: z.string().min(1),
  centroCosto: z.string().min(1),
  sede: z.string().min(1),
  pais: countrySchema,
  ciudad: z.string().min(1),
  supervisorId: z.string().uuid().nullable(),
  estado: employeeEstadoSchema,
  email: z.string().email(),
  telefono: z.string().min(1),
  ingreso: z.string(), // ISO date (YYYY-MM-DD)
  cumple: z.string().regex(/^\d{2}-\d{2}$/), // "MM-DD", no year in the mock
  salario: z.number().nonnegative(),
  iniciales: z.string().min(1).max(4),
  avatar: z.string().min(1),
  userId: z.string().uuid().nullable(),
});
export type Employee = z.infer<typeof employeeSchema>;

// Body for create/update — server assigns id/tenantId, client never sets them.
export const employeeInputSchema = employeeSchema.omit({ id: true, tenantId: true });
export type EmployeeInput = z.infer<typeof employeeInputSchema>;

/* ─────────────── Roles & permissions ─────────────── */

export const roleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  roleKey: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string(),
  color: z.string(),
});
export type Role = z.infer<typeof roleSchema>;

export const rolePermissionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  roleId: z.string().uuid(),
  modulo: moduloSchema,
  accion: accionSchema,
});
export type RolePermission = z.infer<typeof rolePermissionSchema>;

export const fieldPermissionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  campo: z.string().min(1),
  modulo: moduloSchema,
  roleId: z.string().uuid(),
});
export type FieldPermission = z.infer<typeof fieldPermissionSchema>;

/* ─────────────── Leave (permisos) ─────────────── */

export const leaveTypeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  pais: countrySchema,
  nombre: z.string().min(1),
  dias: z.number().nonnegative(),
  color: z.string(),
});
export type LeaveType = z.infer<typeof leaveTypeSchema>;

export const leaveRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  tipo: z.string().min(1),
  desde: z.string(), // ISO date
  hasta: z.string(), // ISO date
  dias: z.number().nonnegative(),
  saldo: z.number(),
  estado: leaveStatusSchema,
  comentario: z.string().nullable(),
  adjunto: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;

export const leaveRequestInputSchema = leaveRequestSchema.pick({
  employeeId: true,
  tipo: true,
  desde: true,
  hasta: true,
  dias: true,
  comentario: true,
  adjunto: true,
});
export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;

export const leaveBalanceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  tipo: z.string().min(1),
  total: z.number().nonnegative(),
  usado: z.number().nonnegative(),
  color: z.string(),
});
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>;

/* ─────────────── Payroll (nómina) ─────────────── */

export const payrollRowSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/), // "2026-06"
  bruto: z.number().nonnegative(),
  bonos: z.number().nonnegative(),
  descuentos: z.number().nonnegative(),
  neto: z.number(),
  aportes: z.number().nonnegative(),
  costoCompania: z.number().nonnegative(),
});
export type PayrollRow = z.infer<typeof payrollRowSchema>;

/* ─────────────── OKRs ─────────────── */

export const keyResultQuarterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  keyResultId: z.string().uuid(),
  trimestre: trimestreSchema,
  peso: z.number().min(0).max(100),
  avance: z.number().min(0).max(100),
});
export type KeyResultQuarter = z.infer<typeof keyResultQuarterSchema>;

export const keyResultSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  objectiveId: z.string().uuid(),
  nombre: z.string().min(1),
  owner: z.string().min(1),
  metrica: z.string().min(1),
  prioridad: prioridadSchema,
  trimestres: z.array(keyResultQuarterSchema).optional(), // present on detail/expanded reads
});
export type KeyResult = z.infer<typeof keyResultSchema>;

export const objectiveSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  nombre: z.string().min(1),
  owner: z.string().min(1),
  iniciales: z.string().min(1).max(4),
  nivel: nivelSchema,
  vencimiento: z.string(), // ISO date
  prioridad: prioridadSchema,
  krs: z.array(keyResultSchema).optional(), // present on detail/expanded reads
});
export type Objective = z.infer<typeof objectiveSchema>;

/* ─────────────── Engagement / encuestas / voz ─────────────── */

export const surveyCampaignSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  nombre: z.string().min(1),
  plantilla: z.string().min(1),
  vence: z.string(), // ISO date
  anonimo: z.boolean(),
  estado: campanaEstadoSchema,
  participacion: z.number().min(0).max(1),
});
export type SurveyCampaign = z.infer<typeof surveyCampaignSchema>;

export const enpsSnapshotSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  mes: z.string().min(1),
  score: z.number(),
  promotores: z.number().nullable(),
  pasivos: z.number().nullable(),
  detractores: z.number().nullable(),
});
export type EnpsSnapshot = z.infer<typeof enpsSnapshotSchema>;

export const surveyTemplateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  nombre: z.string().min(1),
  preguntas: z.number().int().nonnegative(),
  tipo: z.string().min(1),
  editable: z.boolean(),
});
export type SurveyTemplate = z.infer<typeof surveyTemplateSchema>;

export const recognitionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  deEmployeeId: z.string().uuid(),
  paraEmployeeId: z.string().uuid(),
  mensaje: z.string().min(1),
  estrellas: z.number().int().min(1).max(5),
  createdAt: z.string().datetime(),
});
export type Recognition = z.infer<typeof recognitionSchema>;

export const recognitionInputSchema = recognitionSchema.pick({
  paraEmployeeId: true,
  mensaje: true,
  estrellas: true,
});
export type RecognitionInput = z.infer<typeof recognitionInputSchema>;

// Denuncias are anonymous by design: no author field, ever — not here,
// not in the DB, not in any later phase. Do not add one.
export const denunciaSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  tipo: denunciaTipoSchema,
  titulo: z.string().min(1),
  estado: denunciaEstadoSchema,
  fecha: z.string(), // ISO date
  anonimo: z.boolean(),
  pais: countrySchema,
});
export type Denuncia = z.infer<typeof denunciaSchema>;

export const denunciaInputSchema = denunciaSchema.pick({ tipo: true, titulo: true, pais: true }).extend({
  anonimo: z.literal(true).default(true),
});
export type DenunciaInput = z.infer<typeof denunciaInputSchema>;

/* ─────────────── Auth ─────────────── */

export const loginRequestSchema = z.object({
  tenant: z.string().min(1), // tenant slug, e.g. "nortania"
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    roleKey: z.string(),
    employeeId: z.string().uuid().nullable(),
  }),
  tenant: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    nombre: z.string(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/* ─────────────── Notifications ─────────────── */

export const notificationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  kind: notifKindSchema,
  titulo: z.string().min(1),
  detalle: z.string(),
  unread: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;
