# Smoke checklist

Run after any deploy or tenant migration. No headless-browser tool is available in
this dev environment, so this checklist is executed against the real API (through
the vite dev proxy or directly against port 3001) rather than driving the actual
browser UI — each check below maps 1:1 to a frontend route's primary data call.

Prereqs: `docker compose up -d`, `npm run dev -w apps/api`, `npm run dev -w apps/web`,
DB seeded (`npm run db:seed -w apps/api`).

## 1. Roles × routes sweep (nortania tenant)

Login as each seeded role (`<role>@nortania.test` / `changeme123`) and hit the route
group's primary endpoint. Expected: 200 unless noted; `salario` present only for
`nomina`/`global` on `/employees` and `/payroll`.

| Route (frontend) | Endpoint | empleado | supervisor | jefe | analista | nomina | global |
|---|---|---|---|---|---|---|---|
| Dashboard | `GET /dashboard` | 200 | 200 | 200 | 200 | 200 (payroll section populated) | 200 |
| Empleados | `GET /employees` | 200, no salario | 200, no salario | 200, no salario | 200, no salario | 200, **salario** | 200, **salario** |
| Organigrama | `GET /orgchart` | 200 | 200 | 200 | 200 | 200 | 200 |
| Permisos | `GET /leave/requests` | 200 | 200 | 200 | 200 | 403 | 200 |
| Nómina | `GET /payroll` | 403 | 403 | 200 | 403 | 200 | 200 |
| OKRs | `GET /okrs/objectives` | 200 | 200 | 200 | 200 | 403 | 200 |
| Reportes | `GET /reports/employees.csv` | 403 | 200 | 200 | 200 | 200 | 200 |
| Encuestas | `GET /engagement/campaigns` | 200 | 200 | 403 | 200 | 403 | 200 |
| Voz — recognitions | `GET /voz/recognitions` | 200 | 200 | 403 | 200 | 403 | 200 |
| Voz — denuncias | `GET /voz/denuncias` | 403 | 403 | 403 | 200 | 403 | 200 |
| Roles | `GET /roles` | 403 | 403 | 403 | 403 | 403 | 200 |
| Notifications | `GET /notifications` | 200 (own only) | 200 | 200 | 200 | 200 | 200 |

## 2. Mutation paths persist after reload

- Create employee (`POST /employees`) → `GET /employees/:id` reflects it.
- Create + approve leave (`POST /leave/requests` → `POST /leave/requests/:id/approve`) →
  balance `usado` increased by the request's `dias`.
- Create objective (`POST /okrs/objectives`) → appears in `GET /okrs/objectives`.
- Submit anonymous denuncia (`POST /voz/denuncias`) → visible to `analista`/`global` via
  `GET /voz/denuncias`, with **no** author/reporter field anywhere in the response.

## 3. Tenant isolation

- Log into `demo` tenant (any seeded `@demo.test` user) → `GET /employees`,
  `GET /dashboard`, `GET /okrs/objectives` never return any `nortania` row/id.
- A `nortania` resource id fetched from a `demo` session → 404, never 403 (RLS makes it
  invisible, not forbidden).

## 4. Full test suite + coverage gate

```
npm run test:coverage -w apps/api   # must exit 0, ≥85% lines/branches/functions/statements
```
