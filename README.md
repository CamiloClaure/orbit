# Orbit — Nortania HRM

Fastify + Postgres (Drizzle, RLS multi-tenant) backend, with the mockup
React mockup wired to real data. See `PLAN.md` for the full build plan and
architecture rationale, `RUNBOOK.md` for extracting a tenant to its own
database, and `SMOKE.md` for the manual/automated smoke checklist.

## Run it

```bash
npm install
docker compose up -d          # postgres 16
npm run db:migrate -w apps/api
npm run db:seed -w apps/api
npm run dev -w apps/api        # http://localhost:3001
npm run dev -w apps/web        # http://localhost:5173 (proxies /api/* to the API)
```

## Tests

```bash
npm run test -w apps/api            # vitest, real seeded Postgres, no mocks
npm run test:coverage -w apps/api   # same, gated at 85% lines/branches/functions/statements
npx tsc -b apps/web --noEmit        # frontend typecheck
npm run build -w apps/web           # production build
```

## Seed logins

Two tenants, one user per role in each:

| Tenant slug | Dataset |
|---|---|
| `nortania` | 312 employees (full demo dataset) |
| `demo` | 12 employees (small tenant, isolation testing) |

Login form takes **tenant slug + email + password**. Roles seeded in each tenant:
`empleado`, `supervisor`, `analista`, `jefe`, `nomina`, `global`.

- Email: `<roleKey>@<tenant>.test` (e.g. `nomina@nortania.test`, `empleado@demo.test`)
- Password: `changeme123` (override via `SEED_USER_PASSWORD` env var before seeding)

`global` is the only role with access to `/roles` (role/permission matrix editing).
`nomina`/`global` are the only roles that see salary fields.

## Architecture (short version)

- **Multi-tenancy**: shared Postgres DB, `tenant_id` on every table, Postgres RLS
  policies enforce isolation — a forgotten scope returns zero rows, not a leak. The
  API connects as a non-superuser role (`orbit_app`) so RLS actually applies.
- **Auth**: session cookie (`sid`), argon2 password hashes, no JWT/OAuth.
- **RBAC**: `role_permissions` (module × action grants) + `field_permissions`
  (salary-style field-level gating), enforced server-side on every route.
- **Contract**: Zod schemas in `packages/shared/src/schemas.ts`, imported by both
  `apps/api` (request/response validation) and `apps/web` (types + form validation).

Full phase-by-phase rationale, deferred scope, and the tenant-extraction runbook
are in `PLAN.md` / `RUNBOOK.md`.
