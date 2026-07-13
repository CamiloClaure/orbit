import type { FastifyInstance } from "fastify";
import { and, asc, desc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { employees } from "../../db/schema/index.js";
import { requirePermission } from "../../plugins/rbac.js";
import { fieldsGrantedFor, stripGatedFields } from "../auth/field-filter.js";
import { employeeInputSchema } from "@orbit/shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Columns a client is allowed to sort by — a fixed allowlist, not a raw
// column-name passthrough (that would let a query param reach into SQL).
const SORTABLE_COLUMNS = {
  employeeCode: employees.employeeCode,
  nombre: employees.nombre,
  puesto: employees.puesto,
  departamento: employees.departamento,
  centroCosto: employees.centroCosto,
  sede: employees.sede,
  pais: employees.pais,
  ciudad: employees.ciudad,
  estado: employees.estado,
  email: employees.email,
  ingreso: employees.ingreso,
  cumple: employees.cumple,
  salario: employees.salario,
} as const;
type SortableColumn = keyof typeof SORTABLE_COLUMNS;
const SORTABLE_KEYS = Object.keys(SORTABLE_COLUMNS) as [SortableColumn, ...SortableColumn[]];

// Pagination: page (1-indexed) + pageSize, the shape TanStack Table's
// server-side pagination model sends (`pageIndex + 1` / `pageSize`).
const listQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  estado: z.enum(["Activo", "Inactivo", "Ausente"]).optional(),
  pais: z.enum(["BO", "CL", "EC", "AR", "PY"]).optional(),
  search: z.string().min(1).optional(), // matches nombre OR email, case-insensitive substring
  sortBy: z.enum(SORTABLE_KEYS).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

// numeric() columns round-trip as strings through postgres-js; convert to
// number so the response matches @orbit/shared's employeeSchema.
function serialize(row: typeof employees.$inferSelect) {
  return { ...row, salario: Number(row.salario) };
}

export default async function employeesRoutes(app: FastifyInstance) {
  app.get("/employees", { preHandler: requirePermission("Empleados", "Ver") }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid query", details: parsed.error.flatten() });
    const { departamento, estado, pais, search, sortBy, sortDir } = parsed.data;
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 25;

    const conditions: SQL[] = [];
    if (departamento) conditions.push(eq(employees.departamento, departamento));
    if (estado) conditions.push(eq(employees.estado, estado));
    if (pais) conditions.push(eq(employees.pais, pais));
    if (search) conditions.push(or(ilike(employees.nombre, `%${search}%`), ilike(employees.email, `%${search}%`))!);
    const where = conditions.length ? and(...conditions) : undefined;

    const sortColumn = SORTABLE_COLUMNS[sortBy ?? "nombre"];
    const orderFn = sortDir === "desc" ? desc : asc;

    const [rows, totalRows] = await Promise.all([
      request.db
        .select()
        .from(employees)
        .where(where)
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      request.db.select({ total: count() }).from(employees).where(where),
    ]);

    const granted = await fieldsGrantedFor(request.db, "Nómina", request.authUser!.roleId);
    return {
      data: rows.map((r) => stripGatedFields(serialize(r), granted)),
      total: totalRows[0]?.total ?? 0,
      page,
      pageSize,
    };
  });

  app.get("/employees/:id", { preHandler: requirePermission("Empleados", "Ver") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(404).send({ error: "not found" });
    const [row] = await request.db.select().from(employees).where(eq(employees.id, id)).limit(1);
    if (!row) return reply.code(404).send({ error: "not found" });
    const granted = await fieldsGrantedFor(request.db, "Nómina", request.authUser!.roleId);
    return stripGatedFields(serialize(row), granted);
  });

  app.post("/employees", { preHandler: requirePermission("Empleados", "Crear") }, async (request, reply) => {
    const parsed = employeeInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    const { salario, ...rest } = parsed.data;

    const [row] = await request.db
      .insert(employees)
      .values({ ...rest, tenantId: request.tenant!.id, salario: String(salario) })
      .returning();

    reply.code(201);
    const granted = await fieldsGrantedFor(request.db, "Nómina", request.authUser!.roleId);
    return stripGatedFields(serialize(row), granted);
  });

  // Partial update (PATCH semantics) — only the fields present in the body
  // change; everything else on the row is untouched.
  app.patch("/employees/:id", { preHandler: requirePermission("Empleados", "Editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(404).send({ error: "not found" });
    const parsed = employeeInputSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: "empty update" });
    const { salario, ...rest } = parsed.data;
    const values = salario !== undefined ? { ...rest, salario: String(salario) } : rest;

    const [row] = await request.db.update(employees).set(values).where(eq(employees.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    const granted = await fieldsGrantedFor(request.db, "Nómina", request.authUser!.roleId);
    return stripGatedFields(serialize(row), granted);
  });
}
