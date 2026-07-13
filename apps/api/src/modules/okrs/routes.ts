import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { objectiveSchema, keyResultSchema, keyResultQuarterSchema } from "@orbit/shared";
import { objectives, keyResults, keyResultQuarters } from "../../db/schema/index.js";
import { requirePermission } from "../../plugins/rbac.js";
import type { ScopedDb } from "../../plugins/tenant-context.js";

// Ports `krProgress`/`objProgress` from the mockup's src/data/okrs.ts verbatim:
// KR progress = Σ (peso% × avance%) across its trimestres; objective progress
// = plain average of its KRs' progress (not weighted further). Both rounded.
export function krProgress(trimestres: { peso: number; avance: number }[]): number {
  return Math.round(trimestres.reduce((sum, t) => sum + (t.peso / 100) * t.avance, 0));
}

export function objProgress(krProgresses: number[]): number {
  if (!krProgresses.length) return 0;
  return Math.round(krProgresses.reduce((sum, p) => sum + p, 0) / krProgresses.length);
}

const quarterInputSchema = keyResultQuarterSchema.omit({ id: true, tenantId: true, keyResultId: true });

const keyResultInputSchema = keyResultSchema
  .omit({ id: true, tenantId: true, objectiveId: true, trimestres: true })
  .extend({ trimestres: z.array(quarterInputSchema).optional() });

const objectiveInputSchema = objectiveSchema
  .omit({ id: true, tenantId: true, krs: true })
  .extend({ krs: z.array(keyResultInputSchema).optional() });

const objectiveUpdateSchema = objectiveSchema.omit({ id: true, tenantId: true, krs: true }).partial();
const keyResultUpdateSchema = keyResultSchema
  .omit({ id: true, tenantId: true, objectiveId: true, trimestres: true })
  .partial();

type QuarterRow = typeof keyResultQuarters.$inferSelect;
type KeyResultRow = typeof keyResults.$inferSelect;
type ObjectiveRow = typeof objectives.$inferSelect;

function serializeQuarter(q: QuarterRow) {
  return { ...q, peso: Number(q.peso), avance: Number(q.avance) };
}

function serializeKr(kr: KeyResultRow, quarters: QuarterRow[]) {
  const trimestres = quarters.map(serializeQuarter);
  return { ...kr, trimestres, progreso: krProgress(trimestres) };
}

function serializeObjective(obj: ObjectiveRow, krs: ReturnType<typeof serializeKr>[]) {
  return { ...obj, krs, progreso: objProgress(krs.map((k) => k.progreso)) };
}

// Fetches every KR + quarter under a set of objective ids and nests them.
// Three flat queries + in-memory grouping — plenty fast at this data size,
// no need for a recursive CTE or ORM relational query builder.
async function loadObjectivesWithKrs(db: ScopedDb, objs: ObjectiveRow[]) {
  if (!objs.length) return [];
  const objIds = objs.map((o) => o.id);
  const krRows = await db.select().from(keyResults).where(inArray(keyResults.objectiveId, objIds));
  const krIds = krRows.map((k) => k.id);
  const quarterRows = krIds.length
    ? await db.select().from(keyResultQuarters).where(inArray(keyResultQuarters.keyResultId, krIds))
    : [];

  const quartersByKr = new Map<string, QuarterRow[]>();
  for (const q of quarterRows) {
    const list = quartersByKr.get(q.keyResultId) ?? [];
    list.push(q);
    quartersByKr.set(q.keyResultId, list);
  }
  const krsByObjective = new Map<string, ReturnType<typeof serializeKr>[]>();
  for (const kr of krRows) {
    const list = krsByObjective.get(kr.objectiveId) ?? [];
    list.push(serializeKr(kr, quartersByKr.get(kr.id) ?? []));
    krsByObjective.set(kr.objectiveId, list);
  }
  return objs.map((o) => serializeObjective(o, krsByObjective.get(o.id) ?? []));
}

export default async function okrsRoutes(app: FastifyInstance) {
  app.get("/okrs/objectives", { preHandler: requirePermission("OKRs", "Ver") }, async (request) => {
    const objs = await request.db.select().from(objectives);
    return loadObjectivesWithKrs(request.db, objs);
  });

  app.get("/okrs/objectives/:id", { preHandler: requirePermission("OKRs", "Ver") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [obj] = await request.db.select().from(objectives).where(eq(objectives.id, id)).limit(1);
    if (!obj) return reply.code(404).send({ error: "not found" });
    const [result] = await loadObjectivesWithKrs(request.db, [obj]);
    return result;
  });

  // Creates an objective and, optionally, its initial KRs (each with
  // trimestres) in one call — simpler for a first-load form than requiring a
  // second round trip. Adding more KRs later goes through the endpoint below.
  app.post("/okrs/objectives", { preHandler: requirePermission("OKRs", "Crear") }, async (request, reply) => {
    const parsed = objectiveInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });
    const { krs, ...objInput } = parsed.data;
    const tenantId = request.tenant!.id;

    const [objRow] = await request.db.insert(objectives).values({ ...objInput, tenantId }).returning();
    const serializedKrs: ReturnType<typeof serializeKr>[] = [];
    for (const kr of krs ?? []) {
      const { trimestres, ...krInput } = kr;
      const [krRow] = await request.db
        .insert(keyResults)
        .values({ ...krInput, objectiveId: objRow.id, tenantId })
        .returning();
      let quarterRows: QuarterRow[] = [];
      if (trimestres?.length) {
        quarterRows = await request.db
          .insert(keyResultQuarters)
          .values(
            trimestres.map((t) => ({ ...t, keyResultId: krRow.id, tenantId, peso: String(t.peso), avance: String(t.avance) })),
          )
          .returning();
      }
      serializedKrs.push(serializeKr(krRow, quarterRows));
    }
    return reply.code(201).send(serializeObjective(objRow, serializedKrs));
  });

  app.post(
    "/okrs/objectives/:id/key-results",
    { preHandler: requirePermission("OKRs", "Crear") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [obj] = await request.db.select().from(objectives).where(eq(objectives.id, id)).limit(1);
      if (!obj) return reply.code(404).send({ error: "not found" });

      const parsed = keyResultInputSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });
      const { trimestres, ...krInput } = parsed.data;
      const tenantId = request.tenant!.id;

      const [krRow] = await request.db
        .insert(keyResults)
        .values({ ...krInput, objectiveId: id, tenantId })
        .returning();
      let quarterRows: QuarterRow[] = [];
      if (trimestres?.length) {
        quarterRows = await request.db
          .insert(keyResultQuarters)
          .values(
            trimestres.map((t) => ({ ...t, keyResultId: krRow.id, tenantId, peso: String(t.peso), avance: String(t.avance) })),
          )
          .returning();
      }
      return reply.code(201).send(serializeKr(krRow, quarterRows));
    },
  );

  app.put("/okrs/objectives/:id", { preHandler: requirePermission("OKRs", "Editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = objectiveUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: "empty update" });

    const [updated] = await request.db.update(objectives).set(parsed.data).where(eq(objectives.id, id)).returning();
    if (!updated) return reply.code(404).send({ error: "not found" });
    const [result] = await loadObjectivesWithKrs(request.db, [updated]);
    return result;
  });

  app.put("/okrs/key-results/:id", { preHandler: requirePermission("OKRs", "Editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = keyResultUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid request", details: parsed.error.flatten() });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: "empty update" });

    const [updated] = await request.db.update(keyResults).set(parsed.data).where(eq(keyResults.id, id)).returning();
    if (!updated) return reply.code(404).send({ error: "not found" });
    const quarterRows = await request.db
      .select()
      .from(keyResultQuarters)
      .where(eq(keyResultQuarters.keyResultId, id));
    return serializeKr(updated, quarterRows);
  });
}
