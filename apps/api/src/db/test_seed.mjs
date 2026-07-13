// Runnable check for the seed + RLS setup (ponytail: non-trivial logic —
// PRNG-driven generation, RLS policies — gets one runnable check, not a
// test framework). Run: node src/db/test_seed.mjs (after db:migrate + db:seed).
import postgres from "postgres";

const ADMIN_URL = process.env.DATABASE_URL ?? "postgres://orbit:orbit@localhost:5432/orbit";
const APP_URL = process.env.APP_DATABASE_URL ?? "postgres://orbit_app:orbit_app_pw@localhost:5432/orbit";

const admin = postgres(ADMIN_URL);
const app = postgres(APP_URL);

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`ok   - ${label}`);
  } else {
    console.error(`FAIL - ${label}`);
    failures++;
  }
}

const [nortania] = await admin`SELECT id FROM tenants WHERE slug = 'nortania'`;
const [demo] = await admin`SELECT id FROM tenants WHERE slug = 'demo'`;
check("nortania and demo tenants exist", !!nortania && !!demo);

const [{ count: empCount }] = await admin`SELECT count(*) FROM employees WHERE tenant_id = ${nortania.id}`;
check("nortania has 312 employees", Number(empCount) === 312);

const [{ count: roleCount }] = await admin`SELECT count(*) FROM roles WHERE tenant_id = ${nortania.id}`;
check("nortania has 6 roles", Number(roleCount) === 6);

const [{ count: countryCount }] = await admin`SELECT count(DISTINCT pais) FROM leave_types WHERE tenant_id = ${nortania.id}`;
check("nortania has leave rules for 5 countries", Number(countryCount) === 5);

// RLS isolation: as the non-superuser app role, scoped to demo's tenant_id,
// nortania rows must be completely invisible.
await app.begin(async (tx) => {
  await tx`SELECT set_config('app.tenant_id', ${demo.id}, true)`;
  const rows = await tx`SELECT tenant_id FROM employees`;
  check("RLS: demo session sees > 0 rows", rows.length > 0);
  check("RLS: demo session sees only demo's tenant_id", rows.every((r) => r.tenant_id === demo.id));
  check("RLS: demo session sees zero nortania rows", rows.every((r) => r.tenant_id !== nortania.id));
});

// Fail-closed: no tenant_id set at all -> zero rows, not an error and not everything.
await app.begin(async (tx) => {
  const rows = await tx`SELECT 1 FROM employees`;
  check("RLS: no tenant_id set -> zero rows (fail closed)", rows.length === 0);
});

await admin.end();
await app.end();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
