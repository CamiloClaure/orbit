-- Custom SQL migration file, put your code below! --

-- Non-superuser role the API connects as (Phase 2). Superuser and table
-- owners bypass RLS; this role is neither, so policies below actually apply.
-- Password documented in RUNBOOK.md / apps/api/src/db/client.ts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'orbit_app') THEN
    CREATE ROLE orbit_app LOGIN PASSWORD 'orbit_app_pw';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO orbit_app;

-- tenants: read-only for the app (needed to resolve slug -> id at login).
-- No tenant_id column on this table, so no RLS policy here.
GRANT SELECT ON tenants TO orbit_app;

-- Every tenant-owned table: full CRUD for the app role, gated by RLS below.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  employees, users, sessions, roles, role_permissions, field_permissions,
  leave_types, leave_requests, leave_balances, payroll_rows,
  objectives, key_results, key_result_quarters,
  survey_campaigns, enps_snapshots, survey_templates,
  recognitions, denuncias, notifications
TO orbit_app;

-- Row Level Security: every tenant table is isolated by
-- current_setting('app.tenant_id'), set per-request via `SET LOCAL` (Phase 2).
-- nullif(..., '') means a missing/unset tenant_id casts to NULL, not an error,
-- and tenant_id = NULL is never true — so "forgot to set it" fails closed
-- (zero rows) instead of leaking everything or throwing.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees', 'users', 'sessions', 'roles', 'role_permissions', 'field_permissions',
    'leave_types', 'leave_requests', 'leave_balances', 'payroll_rows',
    'objectives', 'key_results', 'key_result_quarters',
    'survey_campaigns', 'enps_snapshots', 'survey_templates',
    'recognitions', 'denuncias', 'notifications'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;
