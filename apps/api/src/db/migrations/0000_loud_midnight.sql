CREATE TYPE "public"."accion" AS ENUM('Ver', 'Crear', 'Editar', 'Aprobar', 'Eliminar');--> statement-breakpoint
CREATE TYPE "public"."campana_estado" AS ENUM('Iniciada', 'Cerrada', 'Borrador');--> statement-breakpoint
CREATE TYPE "public"."country" AS ENUM('BO', 'CL', 'EC', 'AR', 'PY');--> statement-breakpoint
CREATE TYPE "public"."denuncia_estado" AS ENUM('Nueva', 'En revisión', 'Resuelta');--> statement-breakpoint
CREATE TYPE "public"."denuncia_tipo" AS ENUM('Acoso o intimidación', 'Conflicto laboral', 'Sugerencia', 'Reconocimiento');--> statement-breakpoint
CREATE TYPE "public"."employee_estado" AS ENUM('Activo', 'Inactivo', 'Ausente');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('Pendiente', 'Aprobado', 'Rechazado');--> statement-breakpoint
CREATE TYPE "public"."modulo" AS ENUM('Empleados', 'Permisos', 'Nómina', 'OKRs', 'Desempeño', 'Reportes', 'Encuestas', 'Roles y permisos');--> statement-breakpoint
CREATE TYPE "public"."nivel" AS ENUM('Empresa', 'Área', 'Equipo');--> statement-breakpoint
CREATE TYPE "public"."notif_kind" AS ENUM('permiso', 'reconocimiento', 'okr', 'nomina', 'sistema', 'cumple');--> statement-breakpoint
CREATE TYPE "public"."prioridad" AS ENUM('Crítico', 'Alto', 'Medio', 'Bajo');--> statement-breakpoint
CREATE TYPE "public"."trimestre" AS ENUM('T1', 'T2', 'T3', 'T4');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"db_url" text,
	"estado" text DEFAULT 'activo' NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_code" text NOT NULL,
	"nombre" text NOT NULL,
	"puesto" text NOT NULL,
	"departamento" text NOT NULL,
	"centro_costo" text NOT NULL,
	"sede" text NOT NULL,
	"pais" "country" NOT NULL,
	"ciudad" text NOT NULL,
	"supervisor_id" uuid,
	"estado" "employee_estado" NOT NULL,
	"email" text NOT NULL,
	"telefono" text NOT NULL,
	"ingreso" date NOT NULL,
	"cumple" text NOT NULL,
	"salario" numeric(12, 2) NOT NULL,
	"iniciales" text NOT NULL,
	"avatar" text NOT NULL,
	"user_id" uuid,
	CONSTRAINT "employees_tenant_code_uq" UNIQUE("tenant_id","employee_code"),
	CONSTRAINT "employees_tenant_email_uq" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_tenant_email_uq" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "field_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campo" text NOT NULL,
	"modulo" "modulo" NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "field_permissions_uq" UNIQUE("tenant_id","campo","modulo","role_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"modulo" "modulo" NOT NULL,
	"accion" "accion" NOT NULL,
	CONSTRAINT "role_permissions_uq" UNIQUE("tenant_id","role_id","modulo","accion")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "roles_tenant_key_uq" UNIQUE("tenant_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"total" numeric(5, 2) NOT NULL,
	"usado" numeric(5, 2) NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "leave_balances_uq" UNIQUE("tenant_id","employee_id","tipo")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"dias" numeric(5, 2) NOT NULL,
	"saldo" numeric(5, 2) NOT NULL,
	"estado" "leave_status" NOT NULL,
	"comentario" text,
	"adjunto" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pais" "country" NOT NULL,
	"nombre" text NOT NULL,
	"dias" numeric(5, 2) NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "leave_types_uq" UNIQUE("tenant_id","pais","nombre")
);
--> statement-breakpoint
CREATE TABLE "payroll_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"bruto" numeric(12, 2) NOT NULL,
	"bonos" numeric(12, 2) NOT NULL,
	"descuentos" numeric(12, 2) NOT NULL,
	"neto" numeric(12, 2) NOT NULL,
	"aportes" numeric(12, 2) NOT NULL,
	"costo_compania" numeric(12, 2) NOT NULL,
	CONSTRAINT "payroll_rows_uq" UNIQUE("tenant_id","employee_id","periodo")
);
--> statement-breakpoint
CREATE TABLE "key_result_quarters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key_result_id" uuid NOT NULL,
	"trimestre" "trimestre" NOT NULL,
	"peso" numeric(5, 2) NOT NULL,
	"avance" numeric(5, 2) NOT NULL,
	CONSTRAINT "key_result_quarters_uq" UNIQUE("tenant_id","key_result_id","trimestre")
);
--> statement-breakpoint
CREATE TABLE "key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"owner" text NOT NULL,
	"metrica" text NOT NULL,
	"prioridad" "prioridad" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"owner" text NOT NULL,
	"iniciales" text NOT NULL,
	"nivel" "nivel" NOT NULL,
	"vencimiento" date NOT NULL,
	"prioridad" "prioridad" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "denuncias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" "denuncia_tipo" NOT NULL,
	"titulo" text NOT NULL,
	"estado" "denuncia_estado" NOT NULL,
	"fecha" date NOT NULL,
	"anonimo" boolean NOT NULL,
	"pais" "country" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enps_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"score" integer NOT NULL,
	"promotores" integer,
	"pasivos" integer,
	"detractores" integer
);
--> statement-breakpoint
CREATE TABLE "recognitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"de_employee_id" uuid NOT NULL,
	"para_employee_id" uuid NOT NULL,
	"mensaje" text NOT NULL,
	"estrellas" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"plantilla" text NOT NULL,
	"vence" date NOT NULL,
	"anonimo" boolean NOT NULL,
	"estado" "campana_estado" NOT NULL,
	"participacion" numeric(4, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"preguntas" integer NOT NULL,
	"tipo" text NOT NULL,
	"editable" boolean NOT NULL,
	CONSTRAINT "survey_templates_uq" UNIQUE("tenant_id","nombre")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notif_kind" NOT NULL,
	"titulo" text NOT NULL,
	"detalle" text NOT NULL,
	"unread" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisor_id_employees_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_permissions" ADD CONSTRAINT "field_permissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_permissions" ADD CONSTRAINT "field_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_rows" ADD CONSTRAINT "payroll_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_rows" ADD CONSTRAINT "payroll_rows_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_result_quarters" ADD CONSTRAINT "key_result_quarters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_result_quarters" ADD CONSTRAINT "key_result_quarters_key_result_id_key_results_id_fk" FOREIGN KEY ("key_result_id") REFERENCES "public"."key_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enps_snapshots" ADD CONSTRAINT "enps_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_de_employee_id_employees_id_fk" FOREIGN KEY ("de_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_para_employee_id_employees_id_fk" FOREIGN KEY ("para_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD CONSTRAINT "survey_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_templates" ADD CONSTRAINT "survey_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;