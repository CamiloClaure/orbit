# RUNBOOK — extracting a tenant to its own database

Documentation, not automation. Do this by hand the first two times; only
build tooling once the same steps have been repeated and the manual version
is provably the bottleneck.

Context: all tenants live in the shared `orbit` Postgres DB today, isolated
by `tenant_id` + Row Level Security (every tenant table has a
`tenant_id = current_setting('app.tenant_id')::uuid` policy — see
`apps/api/src/db/migrations/0001_rls_and_app_role.sql`). When one tenant
outgrows the shared DB, move it to its own Postgres instance with **no
application code changes** — the app already resolves its connection via
`tenants.db_url` (null = shared DB, set = dedicated DB).

## Steps

1. **Provision a new Postgres 16 instance** for the tenant (managed service or
   another `docker compose` stack). Note its connection string.

2. **Run migrations against the new DB**, exactly as for the shared one:
   ```
   DATABASE_URL=postgres://<superuser>@<new-host>:5432/<db> npm run db:migrate -w apps/api
   ```
   This creates all tables, the `orbit_app` role, and the RLS policies. The
   new DB now has the identical empty schema.

3. **Export the tenant's rows from the shared DB, per table**, in FK-safe
   order (parents before children), and import into the new DB:
   ```
   TENANT_ID=<uuid>
   TABLES="tenants employees users roles role_permissions field_permissions \
     leave_types leave_requests leave_balances payroll_rows \
     objectives key_results key_result_quarters \
     survey_campaigns enps_snapshots survey_templates \
     recognitions denuncias notifications sessions"

   for t in $TABLES; do
     psql "$OLD_DB_URL" -c "\copy (SELECT * FROM $t WHERE tenant_id = '$TENANT_ID' OR ('$t' = 'tenants' AND id = '$TENANT_ID')) TO '/tmp/$t.csv' CSV HEADER"
     psql "$NEW_DB_URL" -c "\copy $t FROM '/tmp/$t.csv' CSV HEADER"
   done
   ```
   (`tenants` itself has no `tenant_id` column — it's filtered by `id`.)
   Use `pg_dump --table=<t> --where="tenant_id='$TENANT_ID'"` instead of
   `\copy` if you prefer a single dump/restore pass; either works, pick
   whichever is already installed.

4. **Point the tenant at its new DB**:
   ```sql
   UPDATE tenants SET db_url = '<new-connection-string>' WHERE id = '<uuid>';
   ```
   The API's `getDb(tenant)` (Phase 2) reads this column and routes that
   tenant's requests to the new pool from the next request onward.

5. **Verify** using the smoke suite (`SMOKE.md`, once it exists) against the
   new DB: log in as a user of the migrated tenant, confirm data renders,
   confirm a cross-tenant fetch still 404s.

6. **Delete the tenant's rows from the shared DB** (reverse FK order —
   children before parents this time), once step 5 is green:
   ```sql
   DELETE FROM notifications WHERE tenant_id = '<uuid>';
   DELETE FROM sessions WHERE tenant_id = '<uuid>';
   -- ... one DELETE per table in $TABLES, children before "tenants" ...
   DELETE FROM tenants WHERE id = '<uuid>';
   ```

## When to automate

If this happens twice for the same reason (e.g. every big client needs the
same 20-table copy), write a script. Until then, this checklist is cheaper
to maintain than a migration tool nobody has used more than once.
