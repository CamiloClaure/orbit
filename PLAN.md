# Orbit — HRM Build Plan

Plan for an Opus orchestrator agent coordinating Sonnet worker agents.
Goal: turn the mockup (React 19 + Vite, all data mocked in `src/data/`)
into a working product: real backend + hardened frontend, living in `orbit/`.

## Source of truth

- Mockup: `<local mockup checkout>` — 12 pages, mock data in `src/data/*.ts`
  (1,020 lines). README states the migration path: "Para conectar a una API real,
  basta con reemplazar los módulos de `src/data/`". That is the core contract of
  this plan: **each `src/data/` module becomes an API endpoint group + query hook.**
- Knowledge graph: `the mockup's graphify-out/graph.json` — workers can run
  `graphify query "<question>"` from that directory to locate code.
- RBAC model already designed in `src/data/roles.ts`: 6 roles, module×action matrix,
  field-level permissions (salary visible only to `nomina`/`global`). Reuse it as-is.

## Stack (decided — do not re-litigate)

| Layer | Choice | Why |
|---|---|---|
| Repo | npm workspaces: `apps/api`, `apps/web`, `packages/shared` | No Nx/Turbo. Three folders. |
| API | Fastify + TypeScript | Boring, fast, tiny. No NestJS. |
| DB | Postgres 16 (docker-compose) + Drizzle ORM | Relational data, owner already uses Drizzle (mechasys). |
| Tenancy | Shared DB, `tenant_id` column + Postgres RLS | See "Multi-tenancy" below. |
| Validation | Zod schemas in `packages/shared` | Single contract: API validates with them, web infers types from them. |
| Auth | Email+password (argon2) + httpOnly session cookie, sessions table | No OAuth, no JWT rotation machinery. Tenant-scoped (see below). |
| Web | Copy of the mockup + TanStack Query | Keep the premium UI; swap data layer only. |
| Tests | Vitest (unit + integration), coverage ≥85% enforced | Threshold in `vitest.config` (`coverage.thresholds`), build fails below it. |
| Smoke | `agent-browser` driven walkthrough | Scripted route×role sweep, run at phase gates and in Phase 6. |

**Prisma considered, rejected.** Multi-tenant isolation is enforced with Postgres RLS
(below), so the ORM never carries the security burden — which removes Prisma's main
pitch here (middleware auto-scoping). RLS policies are raw SQL migrations either way,
Drizzle is closer to that SQL, has no codegen step, and the owner already uses it.
Revisit only if the team grows and schema DX becomes the bottleneck.

Skipped deliberately: microservices, GraphQL, Redis, message queues,
i18n (product is Spanish), file uploads, email sending (log to console),
per-tenant infra automation (runbook instead). Add when needed.

## Multi-tenancy

Design goal: all clients in one shared DB now; when a big client arrives, move that
tenant to its own DB with no code changes.

- `tenants` table: `id`, `slug`, `nombre`, `db_url` (nullable — null means shared DB),
  `estado`. Every tenant-owned table carries `tenant_id NOT NULL` FK; unique
  constraints become composite (`tenant_id, email`, `tenant_id, slug`, …).
- **Isolation = Postgres RLS, not app code.** Every tenant table gets
  `ENABLE ROW LEVEL SECURITY` + policy
  `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. The API connects as a
  non-superuser role so RLS applies. Per request, a Fastify hook opens the transaction
  with `SET LOCAL app.tenant_id = <session tenant>`. A forgotten WHERE clause returns
  zero rows instead of leaking another tenant's data.
- **Tenant resolution:** login form takes tenant slug + email + password (subdomain
  routing deferred to real deployment). Session stores `tenant_id`; everything after
  login derives tenant from the session, never from request params.
- **Connection routing:** one function, `getDb(tenant)` — returns the shared pool when
  `db_url` is null, else a cached pool for that URL. That is the entire abstraction;
  no "database-per-tenant framework".
- **Big-client migration = runbook, not code** (`RUNBOOK.md`, written in Phase 1):
  1. provision new Postgres, run migrations; 2. `pg_dump` with
  `COPY ... WHERE tenant_id = X` per table, restore; 3. set `tenants.db_url`;
  4. verify with smoke suite against that tenant; 5. delete tenant rows from shared DB.
  Automate after it has happened twice.
- Roles/permissions matrix and leave rules are per-tenant rows (each tenant can
  customize); seed copies the defaults into every new tenant.

## Data model (from `src/data/` types — port, don't invent)

Tables: `tenants` (see Multi-tenancy), `employees` (from `Employee`, +`user_id` nullable),
`users` (email, password_hash, role_id, employee_id — unique per `tenant_id, email`),
`sessions`, `roles` + `role_permissions` (matrix) + `field_permissions`,
`leave_types` (per-country rules from `leaveRulesByCountry`), `leave_requests`, `leave_balances`,
`payroll_rows` (period, bruto/bonos/descuentos/neto/costo_compania), `objectives` + `key_results`
(+ quarterly weights `Trimestre`), `survey_campaigns`, `enps_snapshots`, `survey_templates`,
`recognitions`, `denuncias` (anonymous: no author FK, ever), `notifications`.

NOT tables: dashboard KPIs, headcount trend, dept distribution, payroll aggregates,
top reconocidos — all computed with SQL at request time. Org chart = derived from
`employees.supervisor_id` (change mock's supervisor-by-name to FK).

Seed script ports the mock generators (`mulberry32(73)` PRNG from `employees.ts`,
payroll builder, leave builders) so seeded DB ≈ what the demo already shows.

## Security invariants (non-negotiable, enforce server-side)

1. Salary/payroll fields stripped from responses unless role has the field permission.
   Client-side masking in `Nomina.tsx` is decoration, not security.
2. Every mutating endpoint checks the module×action matrix. Middleware, one place.
3. `denuncias` POST accepts no identifying fields; GET restricted to `analista`/`global`.
4. Zod-validate every request body at the boundary.
5. Tenant isolation via RLS (see Multi-tenancy). No endpoint accepts `tenant_id` as
   input after login; it comes from the session only. Every module's test suite
   includes at least one cross-tenant denial test (tenant A id fetched as tenant B → 404).

---

## Phases

Each task below = one Sonnet agent dispatch with a bounded scope, explicit inputs,
and an acceptance check the orchestrator runs before merging. Opus writes/owns the
shared Zod contract and the DB schema; Sonnets never edit `packages/shared` without
returning the diff for Opus review.

### Phase 0 — Scaffold (Opus directly, no delegation; ~1 task)
- `orbit/`: workspaces root, `docker-compose.yml` (postgres only), `apps/api` Fastify
  skeleton with `/health`, copy the mockup → `apps/web` (git history not needed),
  `packages/shared` with empty `schemas.ts`. CI-less; `npm run dev` boots both.
- Acceptance: `docker compose up -d && npm run dev` → web on 5173, api `/health` 200.

### Phase 1 — Schema + seed (1 Sonnet, sequential — everything depends on it)
- Input: `the mockup's src/data/*.ts` (the types are the spec), table list above,
  Multi-tenancy section (tenant_id on every table, RLS policies in migrations,
  non-superuser app role).
- Deliver: Drizzle schema, migrations (including RLS enable + policies), `seed.ts`
  porting mock generators, `RUNBOOK.md` (big-client extraction), plus the first
  draft of Zod schemas in `packages/shared` (Opus reviews/locks these).
- Seed **two tenants** (`nortania` with the full 312-employee dataset, `demo` with a
  small one) — isolation is testable from day one.
- Acceptance: `npm run db:migrate && npm run db:seed` → row counts match mock for
  `nortania` (312 employees, 6 roles, leave rules for 5 countries); psql as app role
  with `app.tenant_id = demo` sees zero `nortania` rows.

### Phase 2 — Auth + RBAC + tenant context (1 Sonnet, sequential — everything calls it)
- Deliver: login (tenant slug + email + password) / logout / me endpoints, session
  cookie, the per-request `SET LOCAL app.tenant_id` transaction hook + `getDb(tenant)`
  router, `requirePermission(modulo, accion)` Fastify decorator, field-permission
  response filter for salary fields.
- Seed users: one per role per tenant (`empleado@…`, `supervisor@…`, etc., password from env).
- Acceptance: integration test — login as `empleado`, GET payroll → 403;
  login as `nomina`, GET employees → salary present; as `analista` → salary absent;
  login into `demo`, GET an employee id belonging to `nortania` → 404.

### Phase 3 — API modules (4 Sonnets IN PARALLEL — disjoint files, shared contract locked)
Each agent: implement endpoint group + integration test. Routes under `apps/api/src/modules/<name>/`.

| Agent | Modules | Endpoints (CRUD unless noted) |
|---|---|---|
| 3a | employees, orgchart | employees list (server-side filter/sort/paginate for TanStack Table), detail, create, update; GET orgtree (derived) |
| 3b | leave (permisos) | balances, requests, approve/reject (supervisor), per-country rules read |
| 3c | payroll, dashboard, reports | payroll list + aggregates by country/CC; dashboard KPIs endpoint (one SQL round-trip); reports: CSV export endpoint (skip Excel/PDF — CSV covers demo, add when asked) |
| 3d | okrs, engagement, voz, notifications | objectives+KRs CRUD with weighted progress computed server-side; campaigns/eNPS read; recognitions create+list; denuncias (see invariant 3); notifications list+mark-read |

- Acceptance per agent: its integration tests pass against seeded DB; RBAC test for
  at least one denied case per module; one cross-tenant denial test per module;
  its files meet the 85% coverage threshold (`npm run test:coverage` stays green).

### Phase 4 — Frontend wiring (4 Sonnets IN PARALLEL, mirrors Phase 3 split)
- First (Opus, small): add `apps/web/src/api/client.ts` (fetch wrapper, credentials
  include, Zod-parsed responses) + TanStack Query provider + real Login flow +
  route guard redirecting to `/login`. This unblocks the four agents.
- Each agent replaces its pages' `src/data/` imports with query hooks. Rules:
  - Delete the replaced mock module in the same PR — no dual data paths.
  - Buttons that today only fire toasts (`actions.tsx`: NewEmployee, NewLeave,
    AssignLeave, NewObjective, NewCampaign) now call mutations + invalidate queries.
  - Loading = skeleton via existing Card primitives; error = toast + retry; empty
    states for zero rows. No new UI libraries.
  - Keep all existing visual design, motion presets, and Tailwind theme untouched.
- Acceptance: page renders from API (network tab shows no mock), create/approve
  flows persist across reload, `npm run build` clean, and an `agent-browser` check:
  open the page logged in as `supervisor`, snapshot, assert the page's key element
  (table rows / chart / KPI cards) rendered with seeded data.

### Phase 5 — Frontend hardening (2 Sonnets in parallel, after 4)
- 5a UX debt: filters/pagination into URL search params (shareable state); form
  validation with the shared Zod schemas (FormDialog); confirm dialog on destructive
  actions; 404 route; a11y pass on Drawer/Modal (focus trap, esc, aria) — verify
  before adding, some may exist.
- 5b Roles screen goes live: role matrix editable by `global`, wired to
  `role_permissions`; "usuarios con permisos erróneos" audit list computed from real
  users table; apply-suggested-role action.
- Acceptance: reload preserves filters; keyboard-only can open/close drawer;
  role change by `global` reflects on next login of affected user.

### Phase 6 — Verify + ship (Opus directly)
- `npm run test:coverage` — suite green, coverage ≥85% (gate fails otherwise).
- **Smoke suite via `agent-browser`** against the seeded stack. Checklist lives in
  `SMOKE.md` so it is repeatable (and reused by the tenant-migration runbook):
  - Roles × routes sweep: as `empleado`, `supervisor`, `nomina`, `global` — log in,
    visit each of the 12 routes, snapshot, assert page heading + primary data element
    rendered; assert salary column absent for `empleado`/`analista`, present for `nomina`.
  - Mutation paths: create employee, request + approve leave, create objective,
    submit anonymous denuncia — assert persisted after reload.
  - Tenant isolation: log into `demo` tenant, assert `nortania` employees/KPIs
    nowhere visible.
  - Driven by Opus running `agent-browser` (open → snapshot → click/fill by ref →
    assert), one pass per role. No Playwright suite — add one when smoke breaks
    twice for the same reason.
- `/security-review` on the diff; README for `orbit/` (run instructions, seed
  credentials, tenant slugs); tag v0.1.

## Orchestration rules for Opus

1. **Contract first.** Zod schemas + route table locked at end of Phase 2. Parallel
   agents code against the contract, not against each other's branches.
2. **Dispatch format.** Every Sonnet task must include: file paths it owns, the
   contract excerpt it implements, the acceptance command to run, and "do not touch
   files outside your module."
3. **Review gate.** Opus reads each agent's diff before merge; rejects scope creep,
   new dependencies, and any `packages/shared` edit not pre-approved.
4. **Sequencing.** 0 → 1 → 2 strictly serial. 3a–3d parallel. 4 waits for its
   matching Phase 3 agent only (4a can start when 3a merges). 5 after all of 4.
5. **Failure policy.** Agent fails acceptance twice → Opus fixes it directly rather
   than dispatching a third time.
6. **No new scope.** Anything not in this plan (SSO, PDF export, mobile, i18n,
   tenant self-signup, per-tenant infra automation) gets logged in `DEFERRED.md`,
   not built.
7. **Coverage is a gate, not a goal.** `vitest.config` thresholds at 85%
   (lines/branches/functions) from Phase 1 onward; a merge that drops below fails
   acceptance. Exclude `apps/web` visual primitives (`components/ui`, `lib/motion`)
   from the metric — testing Tailwind classnames is theater; business logic, hooks,
   API modules and RBAC are what count.

## Testing strategy (summary)

- **Unit + integration (Vitest):** every API module tested against a real seeded
  Postgres (docker), not mocks. Web: hooks and page logic via Testing Library.
- **Coverage:** ≥85% enforced in config, checked at every phase gate.
- **Smoke (`agent-browser`):** roles × routes sweep + mutation paths + tenant
  isolation, defined in `SMOKE.md`, run at end of Phases 4, 5 and 6.
- **Security:** RBAC denial + cross-tenant denial tests mandatory per module;
  `/security-review` before ship.

## Effort map

~14 Sonnet dispatches total: 1 (schema) + 1 (auth) + 4 (api) + 4 (web) + 2 (hardening)
+ 2 buffer for rework. Opus handles scaffold, API client/login, contract ownership,
reviews, smoke runs, and final verification.
