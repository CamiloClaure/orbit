import { pgEnum } from "drizzle-orm/pg-core";

// Fixed, application-wide vocabularies lifted straight from the mockup
// mock types (src/data/*.ts). These are not per-tenant configurable, unlike
// roles/permissions/leave-types, so a Postgres enum is the right fit.

export const countryEnum = pgEnum("country", ["BO", "CL", "EC", "AR", "PY"]);

export const employeeEstadoEnum = pgEnum("employee_estado", ["Activo", "Inactivo", "Ausente"]);

export const leaveStatusEnum = pgEnum("leave_status", ["Pendiente", "Aprobado", "Rechazado"]);

export const moduloEnum = pgEnum("modulo", [
  "Empleados",
  "Permisos",
  "Nómina",
  "OKRs",
  "Desempeño",
  "Reportes",
  "Encuestas",
  "Roles y permisos",
]);

export const accionEnum = pgEnum("accion", ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"]);

export const prioridadEnum = pgEnum("prioridad", ["Crítico", "Alto", "Medio", "Bajo"]);

export const nivelEnum = pgEnum("nivel", ["Empresa", "Área", "Equipo"]);

export const trimestreEnum = pgEnum("trimestre", ["T1", "T2", "T3", "T4"]);

export const campanaEstadoEnum = pgEnum("campana_estado", ["Iniciada", "Cerrada", "Borrador"]);

export const denunciaTipoEnum = pgEnum("denuncia_tipo", [
  "Acoso o intimidación",
  "Conflicto laboral",
  "Sugerencia",
  "Reconocimiento",
]);

export const denunciaEstadoEnum = pgEnum("denuncia_estado", ["Nueva", "En revisión", "Resuelta"]);

export const notifKindEnum = pgEnum("notif_kind", [
  "permiso",
  "reconocimiento",
  "okr",
  "nomina",
  "sistema",
  "cumple",
]);
