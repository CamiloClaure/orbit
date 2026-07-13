import { and, eq } from "drizzle-orm";
import { fieldPermissions } from "../../db/schema/index.js";
import type { ScopedDb } from "../../plugins/tenant-context.js";
import type { Modulo } from "../../plugins/rbac.js";

// Maps a field_permissions.campo label (Spanish, human-facing) to the object
// key(s) it gates on API responses. Only fields an actual route strips need
// an entry here — add as new gated fields come up.
const CAMPO_TO_KEYS: Record<string, string[]> = {
  "Salario y haberes": ["salario"],
};

const ALL_GATED_KEYS = new Set(Object.values(CAMPO_TO_KEYS).flat());

/** Field keys the given role is allowed to see for `modulo`, per field_permissions. */
export async function fieldsGrantedFor(db: ScopedDb, modulo: Modulo, roleId: string): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(fieldPermissions)
    .where(and(eq(fieldPermissions.modulo, modulo), eq(fieldPermissions.roleId, roleId)));
  const granted = new Set<string>();
  for (const row of rows) {
    for (const key of CAMPO_TO_KEYS[row.campo] ?? []) granted.add(key);
  }
  return granted;
}

/** Strips gated keys from `obj` unless present in `granted`. Untouched keys pass through as-is. */
export function stripGatedFields<T extends Record<string, unknown>>(obj: T, granted: Set<string>): T {
  const copy = { ...obj };
  for (const key of ALL_GATED_KEYS) {
    if (!granted.has(key) && key in copy) delete (copy as Record<string, unknown>)[key];
  }
  return copy;
}
